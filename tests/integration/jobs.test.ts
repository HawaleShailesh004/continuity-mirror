import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postBaseline } from "@/app/api/baselines/route";
import { DELETE as deleteBaselineRoute } from "@/app/api/baselines/[id]/route";
import { POST as postJob } from "@/app/api/jobs/route";
import { GET as getJobRoute } from "@/app/api/jobs/[id]/route";
import { GET as getResultRoute } from "@/app/api/jobs/[id]/result/route";
import { GET as getStatusRoute } from "@/app/api/status/route";
import { GET as getReceiptRoute } from "@/app/api/privacy/receipt/route";
import { POST as webhookRoute } from "@/app/api/webhooks/youcam/route";
import { GET as metricsRoute } from "@/app/api/admin/metrics/route";
import { POST as liveRoute } from "@/app/api/admin/live/route";
import { GET as notFoundRoute } from "@/app/api/[...path]/route";
import { AdminMetrics, CreateBaselineResponse, JobResponse, PrivacyReceipt, StatusResponse, type JobSpecInput, type MockScenario } from "@/lib/contracts/api";
import { ErrorEnvelope } from "@/lib/contracts/errors";
import { setServerContext, type ServerContext } from "@/lib/server/context";
import { parseEnv } from "@/lib/server/env";
import { YOUCAM_CALL_BUDGET } from "@/lib/server/jobs/engine";
import { keys } from "@/lib/server/keys";
import { MemoryBlobStore } from "@/lib/server/blob/memory";
import { MemoryKV } from "@/lib/server/store/memory";
import { YouCamHttpError } from "@/lib/server/youcam/adapter";
import { MockYouCamAdapter } from "@/lib/server/youcam/mock";

const ORIGIN = "https://cm.test";
const meera = readFileSync(join(process.cwd(), "public/mock/personas/meera.jpg"));
const WEBHOOK_SECRET = `whsec_${Buffer.from("webhook-test-secret-key-32-bytes!").toString("base64")}`;

let now: number;
let ctx: ServerContext;
let youcam: MockYouCamAdapter;

function makeCtx(env: Record<string, string> = {}, balance = 1000) {
  youcam = new MockYouCamAdapter({ now: () => now, balance });
  ctx = {
    env: parseEnv({ YOUCAM_WEBHOOK_SECRET: WEBHOOK_SECRET, ADMIN_TOKEN: "admin-token-0123456789", ...env }),
    kv: new MemoryKV(() => now),
    blob: new MemoryBlobStore(),
    youcam,
    now: () => now,
  };
  setServerContext(ctx);
}

beforeEach(() => {
  now = Date.parse("2026-10-27T08:00:00Z");
  makeCtx();
});
afterEach(() => setServerContext(undefined));

/** A browser: keeps its session cookie and IP across calls. */
function client(ip = "203.0.113.7") {
  let cookie: string | undefined;
  const send = async (res: Response) => {
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  };
  const headers = (extra: Record<string, string> = {}) => ({ "x-forwarded-for": ip, ...(cookie ? { cookie } : {}), ...extra });
  const params = <T>(p: T) => ({ params: Promise.resolve(p) });
  return {
    async upload(bytes: Uint8Array = meera) {
      const form = new FormData();
      form.set("image", new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), "me.jpg");
      const res = await send(await postBaseline(new Request(`${ORIGIN}/api/baselines`, { method: "POST", body: form, headers: headers() })));
      return CreateBaselineResponse.parse(await res.json()).baselineId;
    },
    create: async (baselineId: string, spec: JobSpecInput, opts: { scenario?: MockScenario; clientRequestId?: string } = {}) =>
      send(
        await postJob(
          new Request(`${ORIGIN}/api/jobs`, {
            method: "POST",
            headers: headers({ "content-type": "application/json", ...(opts.scenario ? { "x-cm-mock-scenario": opts.scenario } : {}) }),
            body: JSON.stringify({ baselineId, clientRequestId: opts.clientRequestId ?? crypto.randomUUID(), spec }),
          }),
        ),
      ),
    async poll(id: string) {
      const res = await send(await getJobRoute(new Request(`${ORIGIN}/api/jobs/${id}`, { headers: headers() }), params({ id })));
      expect(res.status).toBe(200);
      return JobResponse.parse(await res.json()).job;
    },
    result: async (id: string) => send(await getResultRoute(new Request(`${ORIGIN}/api/jobs/${id}/result`, { headers: headers() }), params({ id }))),
    async status(scenario?: MockScenario) {
      const res = await send(await getStatusRoute(new Request(`${ORIGIN}/api/status`, { headers: headers(scenario ? { "x-cm-mock-scenario": scenario } : {}) })));
      return StatusResponse.parse(await res.json());
    },
    async receipt() {
      return PrivacyReceipt.parse(await (await send(await getReceiptRoute(new Request(`${ORIGIN}/api/privacy/receipt`, { headers: headers() })))).json());
    },
    deleteBaseline: async (id: string) =>
      send(await deleteBaselineRoute(new Request(`${ORIGIN}/api/baselines/${id}`, { method: "DELETE", headers: headers() }), params({ id }))),
  };
}

const route = (styleId = "short-bob", routeId = "closest", attempt = 0): JobSpecInput =>
  ({ kind: "route", routeId, styleId, colour: { source: "own", hex: "#3B2A20" }, attempt }) as JobSpecInput;

async function jobOf(res: Response, status: number) {
  expect(res.status).toBe(status);
  return JobResponse.parse(await res.json()).job;
}

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const { error } = ErrorEnvelope.parse(await res.json());
  expect(error.code).toBe(code);
  return error;
}

/** Advance time and poll until the job is terminal (or give up). */
async function settle(c: ReturnType<typeof client>, id: string, stepMs = 9000, max = 40) {
  for (let i = 0; i < max; i++) {
    now += stepMs;
    const job = await c.poll(id);
    if (job.status === "succeeded" || job.status === "failed") return job;
  }
  throw new Error("job never settled");
}

describe("route job: happy path", () => {
  it("submits immediately, chains hair-transfer → hair-color, streams the result, then expires it", async () => {
    const c = client();
    const baselineId = await c.upload();
    const job = await jobOf(await c.create(baselineId, route()), 202);
    expect(job).toMatchObject({ status: "running", resultReady: false });
    expect(job.steps.map((s) => s.status)).toEqual(["running", "pending"]);
    expect(job.provenance).toMatchObject({ mode: "mock", steps: [{ endpoint: "/s2s/v2.1/task/hair-transfer", params: { src_file_id: "<baseline>", template_id: "all_short_bob" } }, {}] });
    await expectError(await c.result(job.id), 409, "NOT_READY");

    now += 9000;
    const mid = await c.poll(job.id);
    expect(mid.steps.map((s) => s.status)).toEqual(["succeeded", "running"]);

    const done = await settle(c, job.id);
    expect(done).toMatchObject({ status: "succeeded", resultReady: true, retryAfterMs: 0 });
    expect(JSON.stringify(done)).not.toContain("mock://"); // upstream URLs never leave the server

    const res = await c.result(job.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const meta = await sharp(new Uint8Array(await res.arrayBuffer())).metadata();
    expect({ format: meta.format, w: meta.width, h: meta.height }).toEqual({ format: "jpeg", w: 768, h: 1024 });

    expect((await c.status()).session.unitsUsed).toBe(3);
    now += 111 * 60_000;
    await expectError(await c.result(job.id), 410, "EXPIRED");
  });

  it("reference styles upload the style image once and run one custom-mode step", async () => {
    const upload = vi.spyOn(youcam, "uploadImage");
    const c = client();
    const baselineId = await c.upload();
    const a = await jobOf(await c.create(baselineId, { kind: "route", routeId: "closest", styleId: "coily-chin", colour: { source: "own", hex: "#1C1714" } }), 202);
    expect(a.steps).toHaveLength(1);
    await jobOf(await c.create(baselineId, { kind: "route", routeId: "easier", styleId: "coily-chin", colour: { source: "own", hex: "#1C1714" }, attempt: 1 }), 202);
    expect(upload).toHaveBeenCalledTimes(2); // baseline + reference, not reference twice
    expect((await settle(c, a.id)).status).toBe("succeeded");
    expect((await c.status()).session.unitsUsed).toBe(4);
  });

  it("colour and brows jobs run one step on the baseline", async () => {
    const c = client();
    const baselineId = await c.upload();
    const colour = await jobOf(await c.create(baselineId, { kind: "colour", colour: { presetId: "soft-copper", mode: "full" } }), 202);
    const brows = await jobOf(await c.create(baselineId, { kind: "brows", browShapeId: "SoftArch1", curvature: 0, thickness: 10, definition: 40, colourHex: "#2B1E16", intensity: 60 }), 202);
    expect((await settle(c, colour.id)).status).toBe("succeeded");
    expect((await settle(c, brows.id)).steps[0]!.kind).toBe("makeup-vto");
  });
});

describe("fringe job", () => {
  it("runs one hair-bang step on the baseline for 1 unit and streams the result", async () => {
    const c = client();
    const baselineId = await c.upload();
    const job = await jobOf(await c.create(baselineId, { kind: "fringe", templateId: "female_wispy_bangs" }), 202);
    expect(job.provenance.steps[0]).toMatchObject({ endpoint: "/s2s/v2.0/task/hair-bang", params: { src_file_id: "<baseline>", template_id: "female_wispy_bangs" } });
    expect((await settle(c, job.id)).status).toBe("succeeded");
    expect((await c.status()).session.unitsUsed).toBe(1);
    expect((await c.result(job.id)).status).toBe(200);
  });

  it("rejects a template that is not in the catalog", async () => {
    const c = client();
    const baselineId = await c.upload();
    await expectError(await c.create(baselineId, { kind: "fringe", templateId: "not_a_template" }), 400, "VALIDATION_FAILED");
  });
});

describe("repair job (result check)", () => {
  const repair = (fromJobId: string, colourHex = "#211B13"): JobSpecInput => ({ kind: "repair", fromJobId, colourHex });

  it("recolours a finished result in one 1-unit Hair Color step and streams it", async () => {
    const c = client();
    const baselineId = await c.upload();
    const source = await settle(c, (await jobOf(await c.create(baselineId, route()), 202)).id);
    const unitsBefore = (await c.status()).session.unitsUsed;

    const job = await jobOf(await c.create(baselineId, repair(source.id)), 202);
    expect(job.steps.map((s) => s.kind)).toEqual(["hair-color"]);
    expect(job.provenance.steps[0]).toMatchObject({
      endpoint: "/s2s/v2.0/task/hair-color",
      params: { src_file_url: "<source job result>", palettes: [{ color: "#211B13" }] },
    });
    const done = await settle(c, job.id);
    expect(done).toMatchObject({ status: "succeeded", resultReady: true });
    expect(JSON.stringify(done)).not.toContain("mock://"); // the source's upstream URL stays on the server
    expect((await c.status()).session.unitsUsed - unitsBefore).toBe(1);
    expect((await c.result(job.id)).status).toBe(200);
  });

  it("the same repair is the same job; a different colour is a new one", async () => {
    const c = client();
    const baselineId = await c.upload();
    const source = await settle(c, (await jobOf(await c.create(baselineId, route()), 202)).id);
    const a = await jobOf(await c.create(baselineId, repair(source.id)), 202);
    const again = await jobOf(await c.create(baselineId, repair(source.id)), 200);
    const other = await jobOf(await c.create(baselineId, repair(source.id, "#2A1D18")), 202);
    expect(again.id).toBe(a.id);
    expect(other.id).not.toBe(a.id);
  });

  it("refuses a source that is unknown, unfinished, from another photo, a brows job, or itself a repair", async () => {
    const c = client();
    const baselineId = await c.upload();
    await expectError(await c.create(baselineId, repair("job_doesnotexist")), 404, "NOT_FOUND");

    const running = await jobOf(await c.create(baselineId, route()), 202);
    await expectError(await c.create(baselineId, repair(running.id)), 409, "NOT_READY");

    const done = await settle(c, running.id);
    const otherPhoto = await c.upload(new Uint8Array(await sharp(meera).modulate({ brightness: 1.05 }).jpeg().toBuffer()));
    await expectError(await c.create(otherPhoto, repair(done.id)), 404, "NOT_FOUND");

    const brows = await settle(c, (await jobOf(await c.create(baselineId, { kind: "brows", browShapeId: "SoftArch1", curvature: 0, thickness: 10, definition: 40, colourHex: "#2B1E16", intensity: 60 }), 202)).id);
    await expectError(await c.create(baselineId, repair(brows.id)), 400, "VALIDATION_FAILED");

    const fix = await settle(c, (await jobOf(await c.create(baselineId, repair(done.id)), 202)).id);
    await expectError(await c.create(baselineId, repair(fix.id)), 400, "VALIDATION_FAILED");
  });

  it("refuses once the source result has expired", async () => {
    const c = client();
    const baselineId = await c.upload();
    const source = await settle(c, (await jobOf(await c.create(baselineId, route()), 202)).id);
    now += 111 * 60_000;
    await expectError(await c.create(baselineId, repair(source.id)), 410, "EXPIRED");
  });
});

describe("idempotency", () => {
  it("same clientRequestId or same spec → same job, no extra units; re-roll is a new job", async () => {
    const c = client();
    const baselineId = await c.upload();
    const id = crypto.randomUUID();
    const first = await jobOf(await c.create(baselineId, route(), { clientRequestId: id }), 202);
    expect((await jobOf(await c.create(baselineId, route(), { clientRequestId: id }), 200)).id).toBe(first.id);
    expect((await jobOf(await c.create(baselineId, route()), 200)).id).toBe(first.id);
    expect((await jobOf(await c.create(baselineId, route("short-bob", "closest", 1)), 202)).id).not.toBe(first.id);
    expect((await c.status()).session.unitsUsed).toBe(6);
  });

  it("another session with the same photo and spec shares the job", async () => {
    const a = client();
    const b = client("198.51.100.9");
    const baselineId = await a.upload();
    const job = await jobOf(await a.create(baselineId, route()), 202);
    expect(await b.upload()).toBe(baselineId);
    expect((await jobOf(await b.create(baselineId, route()), 200)).id).toBe(job.id);
    expect((await b.receipt()).jobs.map((j) => j.id)).toEqual([job.id]);
  });
});

describe("failures", () => {
  it.each([
    ["no_shoulder", "error_no_shoulder", "capture.retake.shoulders"],
    ["hair_too_short", "error_hair_too_short", "capture.hairTooShort"],
    ["face_pose", "error_face_pose", "capture.retake.faceForward"],
    ["unavailable", "error_inference", "generic.serviceBusy"],
  ] as const)("%s → failed job with the mapped error, units refunded", async (scenario, youcamCode, messageKey) => {
    const c = client();
    const baselineId = await c.upload();
    const job = await jobOf(await c.create(baselineId, route(), { scenario }), 202);
    const failed = await settle(c, job.id);
    expect(failed).toMatchObject({ status: "failed", error: { youcamCode, messageKey } });
    expect(failed.steps.map((s) => s.status)).toEqual(["failed", "pending"]);
    expect((await c.status()).session.unitsUsed).toBe(0);
    await expectError(await c.result(job.id), 404, "NOT_FOUND");
    // A retry is a new job (failed jobs don't block their spec).
    expect((await jobOf(await c.create(baselineId, route()), 202)).id).not.toBe(job.id);
  });

  it("partial_failure fails New chapter once; the retry succeeds", async () => {
    const c = client();
    const baselineId = await c.upload();
    const first = await jobOf(await c.create(baselineId, route("pixie", "new-chapter"), { scenario: "partial_failure" }), 202);
    expect((await settle(c, first.id)).status).toBe("failed");
    const retry = await jobOf(await c.create(baselineId, route("pixie", "new-chapter"), { scenario: "partial_failure" }), 202);
    expect((await settle(c, retry.id)).status).toBe("succeeded");
  });

  it("times out after 180 s and keeps the reservation (YouCam may still charge)", async () => {
    const c = client();
    const baselineId = await c.upload();
    const job = await jobOf(await c.create(baselineId, route(), { scenario: "timeout" }), 202);
    const failed = await settle(c, job.id, 10_000, 30);
    expect(failed.error).toMatchObject({ code: "YOUCAM_TIMEOUT", retryable: true });
    expect(Date.parse(failed.updatedAt) - Date.parse(failed.createdAt)).toBeGreaterThan(180_000);
    expect((await c.status()).session.unitsUsed).toBe(3);
  });

  it("a result that was ready while nobody was polling is accepted, not reported as a timeout", async () => {
    const c = client();
    const baselineId = await c.upload();
    const job = await jobOf(await c.create(baselineId, route()), 202);
    now += 20 * 60_000; // a closed laptop: far past the 180 s timeout, with no polls at all
    const back = await c.poll(job.id);
    expect(back.status).not.toBe("failed");
    expect(back.steps[0]!.status).toBe("succeeded"); // step 1 had finished long ago
    expect((await settle(c, job.id)).status).toBe("succeeded"); // step 2 gets its own fresh clock
  });

  it("a step that is genuinely stuck still times out, on its own clock", async () => {
    const c = client();
    const baselineId = await c.upload();
    const job = await jobOf(await c.create(baselineId, route(), { scenario: "timeout" }), 202);
    now += 20 * 60_000;
    expect((await c.poll(job.id)).error).toMatchObject({ code: "YOUCAM_TIMEOUT" });
  });

  it("slow jobs poll at 4 s after 30 s", async () => {
    const c = client();
    const baselineId = await c.upload();
    const job = await jobOf(await c.create(baselineId, route(), { scenario: "slow" }), 202);
    now += 31_000;
    expect(await c.poll(job.id)).toMatchObject({ status: "running", retryAfterMs: 4000 });
  });

  it("retries a failed submit (5xx) on later polls, then gives up as YOUCAM_UNAVAILABLE", async () => {
    const c = client();
    const baselineId = await c.upload();
    const create = vi.spyOn(youcam, "createTask").mockRejectedValueOnce(new YouCamHttpError(503, "busy"));
    const job = await jobOf(await c.create(baselineId, route()), 202);
    expect(job.status).toBe("queued");
    now += 4000;
    expect((await c.poll(job.id)).status).toBe("running");

    create.mockRejectedValue(new YouCamHttpError(502, "down"));
    const other = await jobOf(await c.create(baselineId, route("pixie")), 202);
    const failed = await settle(c, other.id, 8000);
    expect(failed.error).toMatchObject({ code: "YOUCAM_UNAVAILABLE", retryable: true });
    expect(create.mock.calls.length).toBeGreaterThanOrEqual(5); // 1 initial + 3 retries for `other`
  });

  it("validation, unknown baseline/job, and the JSON 404 for unknown API paths", async () => {
    const c = client();
    const baselineId = await c.upload();
    await expectError(await c.create(baselineId, route("not-a-style")), 400, "VALIDATION_FAILED");
    await expectError(await c.create("f".repeat(64), route()), 404, "NOT_FOUND");
    await expectError(await postJob(new Request(`${ORIGIN}/api/jobs`, { method: "POST", body: "nope" })), 400, "VALIDATION_FAILED");
    const res = await getJobRoute(new Request(`${ORIGIN}/api/jobs/job_xxxxxxxxxxxxxxxx`), { params: Promise.resolve({ id: "job_xxxxxxxxxxxxxxxx" }) });
    await expectError(res, 404, "NOT_FOUND");
    await expectError(notFoundRoute(), 404, "NOT_FOUND");
  });

  it("feature flags: brows and regrowth off → FEATURE_DISABLED", async () => {
    makeCtx({ CAP_BROWS: "false", CAP_REGROWTH: "false" });
    const c = client();
    const baselineId = await c.upload();
    await expectError(await c.create(baselineId, { kind: "brows", browShapeId: "SoftArch1", curvature: 0, thickness: 0, definition: 0, colourHex: "#2B1E16", intensity: 60 }), 403, "FEATURE_DISABLED");
    await expectError(await c.create(baselineId, route("pixie", "regrowth-3m")), 403, "FEATURE_DISABLED");
  });
});

describe("budgets and the breaker", () => {
  it("session cap 24 units = 8 routes", async () => {
    const c = client();
    const baselineId = await c.upload();
    for (let i = 0; i < 8; i++) await jobOf(await c.create(baselineId, route(i < 6 ? "short-bob" : "pixie", "closest", i % 6)), 202);
    const err = await expectError(await c.create(baselineId, route("bixie")), 403, "SESSION_BUDGET_EXHAUSTED");
    expect(err.details).toMatchObject({ scope: "session" });
    expect((await c.status()).session).toEqual({ unitsUsed: 24, unitsCap: 24 });
  });

  it("IP daily cap spans sessions", async () => {
    makeCtx({ IP_DAILY_UNIT_CAP: "6" });
    const a = client();
    const b = client(); // same IP, new session
    const baselineId = await a.upload();
    await jobOf(await a.create(baselineId, route()), 202);
    await jobOf(await a.create(baselineId, route("pixie")), 202);
    await b.upload();
    const err = await expectError(await b.create(baselineId, route("bixie")), 403, "SESSION_BUDGET_EXHAUSTED");
    expect(err.details).toMatchObject({ scope: "ip" });
    expect((await b.status()).session.unitsUsed).toBe(0); // rolled back
  });

  it("job creation is rate limited (10/min)", async () => {
    makeCtx({ SESSION_UNIT_CAP: "999", IP_DAILY_UNIT_CAP: "999" });
    const c = client();
    const baselineId = await c.upload();
    for (let i = 0; i < 10; i++) await c.create(baselineId, route("short-bob", "closest", i % 6));
    await expectError(await c.create(baselineId, route("pixie")), 429, "RATE_LIMITED");
  });

  it("breaker: balance below UNIT_FLOOR → live false, units_low; jobs refused", async () => {
    makeCtx({}, 140);
    const c = client();
    const baselineId = await c.upload();
    expect(await c.status()).toMatchObject({ live: false, reason: "units_low" });
    await expectError(await c.create(baselineId, route()), 503, "LIVE_DISABLED");
  });

  it("mock scenarios at the API level", async () => {
    const c = client();
    const baselineId = await c.upload();
    expect(await c.status("live_disabled")).toMatchObject({ live: false, reason: "disabled" });
    expect((await c.status("budget_exhausted")).session.unitsUsed).toBe(24);
    await expectError(await c.create(baselineId, route(), { scenario: "rate_limited" }), 429, "RATE_LIMITED");
    await expectError(await c.create(baselineId, route(), { scenario: "budget_exhausted" }), 403, "SESSION_BUDGET_EXHAUSTED");
    await expectError(await c.create(baselineId, route(), { scenario: "live_disabled" }), 503, "LIVE_DISABLED");
    const expiring = await jobOf(await c.create(baselineId, route(), { scenario: "expired" }), 202);
    expect((await settle(c, expiring.id)).resultReady).toBe(true);
    await expectError(await c.result(expiring.id), 410, "EXPIRED");
  });
});

describe("polling discipline", () => {
  it("concurrent and rapid polls cause at most one YouCam call per 4 s", async () => {
    const c = client();
    const baselineId = await c.upload();
    const job = await jobOf(await c.create(baselineId, route()), 202);
    const getTask = vi.spyOn(youcam, "getTask");
    await Promise.all(Array.from({ length: 10 }, () => c.poll(job.id))); // within 4 s of create
    now += 4000;
    await Promise.all(Array.from({ length: 10 }, () => c.poll(job.id))); // YouCam steps never finish in under 5 s
    expect(getTask).toHaveBeenCalledTimes(0);
    now += 1000;
    await Promise.all(Array.from({ length: 10 }, () => c.poll(job.id)));
    expect(getTask).toHaveBeenCalledTimes(1);
  });

  it("when the global YouCam call budget is spent, polls get a longer hint and the job waits instead of failing", async () => {
    const c = client();
    const baselineId = await c.upload();
    const job = await jobOf(await c.create(baselineId, route()), 202);
    const getTask = vi.spyOn(youcam, "getTask");
    const exhaust = () => ctx.kv.set(`rl:${YOUCAM_CALL_BUDGET.name}:global:${Math.floor(now / YOUCAM_CALL_BUDGET.windowMs)}`, YOUCAM_CALL_BUDGET.limit);
    now += 5000;
    await exhaust();
    const throttled = await c.poll(job.id);
    expect(throttled).toMatchObject({ status: "running" });
    expect(throttled.retryAfterMs).toBeGreaterThanOrEqual(6000);
    expect(getTask).not.toHaveBeenCalled();

    // Stay throttled for far longer than the 180 s job timeout: the job must not time out for it.
    for (let i = 0; i < 40; i++) {
      now += 6000;
      await exhaust();
      expect((await c.poll(job.id)).status).toBe("running");
    }
    expect(getTask).not.toHaveBeenCalled();

    // Budget back: it finishes normally.
    now += YOUCAM_CALL_BUDGET.windowMs;
    expect((await settle(c, job.id)).status).toBe("succeeded");
  });
});

describe("webhook", () => {
  function signed(body: string, opts: { id?: string; ts?: number; secret?: string } = {}) {
    const id = opts.id ?? `msg_${crypto.randomUUID()}`;
    const ts = String(Math.floor((opts.ts ?? now) / 1000));
    const key = Buffer.from((opts.secret ?? WEBHOOK_SECRET).replace("whsec_", ""), "base64");
    const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
    return new Request(`${ORIGIN}/api/webhooks/youcam`, { method: "POST", body, headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` } });
  }

  it("a verified webhook advances the job; replays and unknown tasks are no-ops", async () => {
    const c = client();
    const baselineId = await c.upload();
    const job = await jobOf(await c.create(baselineId, route()), 202);
    now += 9000;
    const req = signed(JSON.stringify({ data: { task_id: job.steps[0]!.youcamTaskId, task_status: "success" } }), { id: "msg_1" });
    const res = await webhookRoute(req);
    expect(await res.json()).toEqual({ ok: true, outcome: "advanced" });
    expect((await ctx.kv.get<{ steps: { status: string }[] }>(keys.job(job.id)))!.steps[0]!.status).toBe("succeeded");

    const replay = await webhookRoute(signed(JSON.stringify({ data: { task_id: job.steps[0]!.youcamTaskId } }), { id: "msg_1" }));
    expect((await replay.json()).outcome).toBe("duplicate");
    const unknown = await webhookRoute(signed(JSON.stringify({ task_id: "nope" })));
    expect((await unknown.json()).outcome).toBe("ignored");
  });

  it("rejects bad signatures, stale timestamps, and is off without a secret", async () => {
    await expectError(await webhookRoute(signed("{}", { secret: `whsec_${Buffer.from("wrong").toString("base64")}` })), 401, "UNAUTHORISED");
    await expectError(await webhookRoute(signed("{}", { ts: now - 10 * 60_000 })), 401, "UNAUTHORISED");
    makeCtx({ YOUCAM_WEBHOOK_SECRET: "" });
    await expectError(await webhookRoute(signed("{}")), 404, "NOT_FOUND");
  });
});

describe("privacy", () => {
  it("receipt lists this session's baselines and jobs; deleting a baseline removes its jobs", async () => {
    const c = client();
    const baselineId = await c.upload();
    const job = await jobOf(await c.create(baselineId, route()), 202);
    const receipt = await c.receipt();
    expect(receipt.serverStoresImages).toBe(false);
    expect(receipt.baselines.map((b) => b.baselineId)).toEqual([baselineId]);
    expect(receipt.jobs[0]).toMatchObject({ id: job.id, kind: "route", endpoints: ["/s2s/v2.1/task/hair-transfer", "/s2s/v2.0/task/hair-color"] });
    expect(receipt.jobs[0]!.youcamTaskIds).toHaveLength(1);

    expect((await c.deleteBaseline(baselineId)).status).toBe(200);
    expect(await c.receipt()).toMatchObject({ baselines: [], jobs: [] });
    expect(await ctx.kv.get(keys.job(job.id))).toBeNull();
    expect(await client("192.0.2.1").receipt()).toMatchObject({ baselines: [], jobs: [] }); // other sessions see nothing
  });
});

describe("admin", () => {
  const admin = (path: string, init: RequestInit = {}, token = "admin-token-0123456789") =>
    new Request(`${ORIGIN}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });

  it("requires the token", async () => {
    await expectError(await metricsRoute(admin("/api/admin/metrics", {}, "wrong")), 401, "UNAUTHORISED");
    await expectError(await metricsRoute(new Request(`${ORIGIN}/api/admin/metrics`)), 401, "UNAUTHORISED");
    makeCtx({ ADMIN_TOKEN: "" });
    await expectError(await metricsRoute(admin("/api/admin/metrics")), 401, "UNAUTHORISED");
  });

  it("kill switch turns live off and on; metrics count real work", async () => {
    const c = client();
    const baselineId = await c.upload();
    const job = await jobOf(await c.create(baselineId, route()), 202);
    await settle(c, job.id);
    const failed = await jobOf(await c.create(baselineId, route("pixie"), { scenario: "no_shoulder" }), 202);
    await settle(c, failed.id);
    now += 61_000; // past the 60 s balance cache

    const m = AdminMetrics.parse(await (await metricsRoute(admin("/api/admin/metrics"))).json());
    expect(m.unitsSpent).toMatchObject({ total: 3, byKind: { "hair-transfer": 2, "hair-color": 1 } });
    expect(m.jobsByStatus).toMatchObject({ created: 2, succeeded: 1, failed: 1 });
    expect(m.youcamErrors).toEqual({ error_no_shoulder: 1 });
    expect(m.latencyMs.route!.n).toBe(1);
    expect(m.balance).toBe(997);

    expect(await (await liveRoute(admin("/api/admin/live", { method: "POST", body: JSON.stringify({ enabled: false }) }))).json()).toEqual({ enabled: false });
    expect(await c.status()).toMatchObject({ live: false, reason: "disabled" });
    await expectError(await c.create(baselineId, route("bixie")), 503, "LIVE_DISABLED");
    await liveRoute(admin("/api/admin/live", { method: "POST", body: JSON.stringify({ enabled: true }) }));
    expect((await c.status()).live).toBe(true);
  });
});
