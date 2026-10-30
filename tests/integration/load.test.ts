// Capacity and politeness under load, on a fake clock (no sleeping, deterministic). The mock YouCam adapter
// counts every call, so we can check the rate against YouCam's documented limit (250 calls / 300 s per token).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postBaseline } from "@/app/api/baselines/route";
import { POST as postJob } from "@/app/api/jobs/route";
import { GET as getJobRoute } from "@/app/api/jobs/[id]/route";
import { CreateBaselineResponse, JobResponse, type Job } from "@/lib/contracts/api";
import { MemoryBlobStore } from "@/lib/server/blob/memory";
import { setServerContext, type ServerContext } from "@/lib/server/context";
import { parseEnv } from "@/lib/server/env";
import { YOUCAM_CALL_BUDGET } from "@/lib/server/jobs/engine";
import { MemoryKV } from "@/lib/server/store/memory";
import { MockYouCamAdapter } from "@/lib/server/youcam/mock";

const ORIGIN = "https://cm.test";
const photo = new Uint8Array(readFileSync(join(process.cwd(), "public/mock/personas/meera.jpg")));
const YOUCAM_UPSTREAM_LIMIT = 250;
const STYLES = ["short-bob", "pixie", "bixie"] as const;

let now: number;
let ctx: ServerContext;
let calls: { at: number; kind: "create" | "poll"; task?: string }[];

beforeEach(() => {
  now = Date.parse("2026-10-27T08:00:00Z");
  calls = [];
  const youcam = new MockYouCamAdapter({ now: () => now });
  const createTask = youcam.createTask.bind(youcam);
  const getTask = youcam.getTask.bind(youcam);
  youcam.createTask = async (...a) => (calls.push({ at: now, kind: "create" }), createTask(...a));
  youcam.getTask = async (kind, id) => (calls.push({ at: now, kind: "poll", task: id }), getTask(kind, id));
  ctx = {
    env: parseEnv({ SESSION_UNIT_CAP: "1000", IP_DAILY_UNIT_CAP: "1000" }),
    kv: new MemoryKV(() => now),
    blob: new MemoryBlobStore(),
    youcam,
    now: () => now,
  };
  setServerContext(ctx);
});
afterEach(() => setServerContext(undefined));

type Person = { ip: string; cookie?: string; baselineId?: string; jobs: { id: string; nextPollAt: number; done?: Job }[] };

async function call(p: Person, run: () => Promise<Response>) {
  const res = await run();
  const set = res.headers.get("set-cookie");
  if (set) p.cookie = set.split(";")[0];
  return res;
}
const headers = (p: Person, extra: Record<string, string> = {}) => ({ "x-forwarded-for": p.ip, ...(p.cookie ? { cookie: p.cookie } : {}), ...extra });

async function startPerson(i: number): Promise<Person> {
  const p: Person = { ip: `10.1.${Math.floor(i / 200)}.${i % 200}`, jobs: [] };
  const form = new FormData();
  form.set("image", new Blob([photo as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), "me.jpg");
  const up = await call(p, () => postBaseline(new Request(`${ORIGIN}/api/baselines`, { method: "POST", body: form, headers: headers(p) })));
  p.baselineId = CreateBaselineResponse.parse(await up.json()).baselineId;
  for (const [n, styleId] of STYLES.entries()) {
    const res = await call(p, () =>
      postJob(
        new Request(`${ORIGIN}/api/jobs`, {
          method: "POST",
          headers: headers(p, { "content-type": "application/json" }),
          body: JSON.stringify({ baselineId: p.baselineId, clientRequestId: crypto.randomUUID(), spec: { kind: "route", routeId: n === 0 ? "closest" : n === 1 ? "easier" : "new-chapter", styleId, colour: { source: "own", hex: `#${(0x2a1d18 + i).toString(16).toUpperCase()}` }, attempt: 0 } }), // distinct per person, or the engine dedupes them into one job
        }),
      ),
    );
    const { job } = JobResponse.parse(await res.json());
    p.jobs.push({ id: job.id, nextPollAt: now + job.retryAfterMs });
  }
  return p;
}

/** Everyone polls exactly when told to (like our client: honour retryAfterMs, never faster). */
async function runUntilDone(people: Person[], stepMs: number, maxMs: number) {
  const start = now;
  while (now - start < maxMs && people.some((p) => p.jobs.some((j) => !j.done))) {
    now += stepMs;
    for (const p of people) {
      for (const j of p.jobs) {
        if (j.done || now < j.nextPollAt) continue;
        const res = await call(p, () => getJobRoute(new Request(`${ORIGIN}/api/jobs/${j.id}`, { headers: headers(p) }), { params: Promise.resolve({ id: j.id }) }));
        expect(res.status).toBe(200);
        const { job } = JobResponse.parse(await res.json());
        if (job.status === "succeeded" || job.status === "failed") j.done = job;
        else j.nextPollAt = now + Math.max(job.retryAfterMs, 1000);
      }
    }
  }
}

const maxInWindow = (xs: { at: number }[], windowMs: number) => {
  let max = 0;
  for (let i = 0, lo = 0; i < xs.length; i++) {
    while (xs[i]!.at - xs[lo]!.at >= windowMs) lo++;
    max = Math.max(max, i - lo + 1);
  }
  return max;
};

describe("a moderate crowd (8 people, 24 jobs)", () => {
  it("stays well inside YouCam's rate limit and every job succeeds", async () => {
    const people = await Promise.all(Array.from({ length: 8 }, (_, i) => startPerson(i)));
    await runUntilDone(people, 1000, 10 * 60_000);

    const jobs = people.flatMap((p) => p.jobs);
    expect(jobs.every((j) => j.done?.status === "succeeded")).toBe(true);
    // 3 routes x 2 steps each = 48 creates, plus the polls.
    expect(calls.filter((c) => c.kind === "create")).toHaveLength(48);
    expect(maxInWindow(calls, 300_000)).toBeLessThanOrEqual(YOUCAM_CALL_BUDGET.limit);
    // Never more than one poll per task per 4 s, however many clients ask.
    const polls = calls.filter((c) => c.kind === "poll");
    const byTask = Map.groupBy(polls, (c) => c.task!);
    for (const [task, taskPolls] of byTask) {
      for (let i = 1; i < taskPolls.length; i++) expect(taskPolls[i]!.at - taskPolls[i - 1]!.at, task).toBeGreaterThanOrEqual(4000);
    }
    // Calls per finished job: the cost model behind "how many people can use the live path".
    const perJob = calls.length / jobs.length;
    expect(perJob).toBeLessThan(12);
    if (process.env.LOAD_REPORT) console.info(`[load] moderate: ${calls.length} YouCam calls for ${jobs.length} jobs = ${perJob.toFixed(1)} per job; peak ${maxInWindow(calls, 300_000)} per 300 s; slowest ${Math.max(...jobs.map((j) => Date.parse(j.done!.updatedAt) - Date.parse(j.done!.createdAt))) / 1000} s`);
  }, 120_000);
});

describe("a rush (25 people, 75 jobs): far more than YouCam allows", () => {
  it("never exceeds the call budget, slows down instead of failing, and finishes everything", async () => {
    const people = await Promise.all(Array.from({ length: 25 }, (_, i) => startPerson(i)));
    await runUntilDone(people, 3000, 90 * 60_000);

    const jobs = people.flatMap((p) => p.jobs);
    const failed = jobs.filter((j) => j.done?.status === "failed").map((j) => j.done!.error?.code);
    expect(failed, `failed jobs: ${failed.join(",")}`).toEqual([]);
    expect(jobs.every((j) => j.done?.status === "succeeded")).toBe(true);
    // The documented upstream limit is 250 per 300 s: no sliding window may exceed it (we aim for 200).
    expect(maxInWindow(calls, 300_000)).toBeLessThanOrEqual(YOUCAM_UPSTREAM_LIMIT);
    // And it really was throttled: finishing took much longer than the ~30 s an unthrottled job needs.
    const slowest = Math.max(...jobs.map((j) => Date.parse(j.done!.updatedAt) - Date.parse(j.done!.createdAt)));
    expect(slowest).toBeGreaterThan(5 * 60_000);
    if (process.env.LOAD_REPORT) console.info(`[load] rush: ${calls.length} calls for ${jobs.length} jobs; peak ${maxInWindow(calls, 300_000)} per 300 s; slowest ${(slowest / 60_000).toFixed(1)} min; median ${(jobs.map((j) => Date.parse(j.done!.updatedAt) - Date.parse(j.done!.createdAt)).sort((a, b) => a - b)[Math.floor(jobs.length / 2)]! / 60_000).toFixed(1)} min`);
  }, 120_000);
});
