import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CreateBaselineResponse,
  CreateShareResponse,
  DeleteBaselineResponse,
  JobResponse,
  PrivacyReceipt,
  ShareManifest,
  ShareResults,
  StatusResponse,
  type JobSpecInput,
  type MockScenario,
} from "@/lib/contracts/api";
import { ErrorEnvelope } from "@/lib/contracts/errors";
import type { MockBackend } from "@/lib/contracts/mocks/backend";
import { createNodeMockBackend } from "@/lib/contracts/mocks/node";

const meera = readFileSync(join(process.cwd(), "public/mock/personas/meera.jpg"));
const ORIGIN = "http://localhost:3000";

let clock = Date.parse("2026-10-27T08:00:00Z");
let backend: MockBackend;

beforeEach(() => {
  clock = Date.parse("2026-10-27T08:00:00Z");
  backend = createNodeMockBackend({ now: () => clock });
});

async function call(method: string, path: string, init: { body?: BodyInit; json?: unknown; headers?: Record<string, string>; scenario?: MockScenario } = {}) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.scenario) headers["x-cm-mock-scenario"] = init.scenario;
  let body = init.body;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await backend.handle(new Request(ORIGIN + path, { method, headers, body }));
  if (!res) throw new Error(`unhandled ${method} ${path}`);
  return res;
}

function imageForm(bytes: Uint8Array, type = "image/jpeg") {
  const form = new FormData();
  form.set("image", new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), "photo.jpg");
  return form;
}

async function upload(scenario?: MockScenario) {
  const res = await call("POST", "/api/baselines", { body: imageForm(meera), scenario });
  return { res, body: CreateBaselineResponse.parse(await res.json()) };
}

const routeSpec = (routeId = "closest", styleId = "short-bob"): JobSpecInput => ({ kind: "route", routeId, styleId, colour: { source: "own", hex: "#3B2A20" } }) as JobSpecInput;

async function createJob(baselineId: string, spec: JobSpecInput = routeSpec(), scenario?: MockScenario, clientRequestId = crypto.randomUUID()) {
  return call("POST", "/api/jobs", { json: { baselineId, clientRequestId, spec }, scenario });
}

async function poll(id: string) {
  return JobResponse.parse(await (await call("GET", `/api/jobs/${id}`)).json()).job;
}

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = ErrorEnvelope.parse(await res.json());
  expect(body.error.code).toBe(code);
  return body.error;
}

describe("status", () => {
  it("is contract-valid and reports mock mode", async () => {
    const status = StatusResponse.parse(await (await call("GET", "/api/status")).json());
    expect(status).toMatchObject({ live: true, mode: "mock", session: { unitsUsed: 0, unitsCap: 24 } });
    expect(status.capabilities.headwear).toBe(false);
  });

  it("live_disabled turns live off", async () => {
    const status = StatusResponse.parse(await (await call("GET", "/api/status", { scenario: "live_disabled" })).json());
    expect(status).toMatchObject({ live: false, reason: "disabled" });
  });
});

describe("baselines", () => {
  it("creates once, then reuses by content hash", async () => {
    const first = await upload();
    expect(first.res.status).toBe(201);
    expect(first.body).toMatchObject({ width: 768, height: 1024, reused: false });
    expect(first.body.normalisedImage.startsWith("data:image/jpeg;base64,")).toBe(true);
    const again = await upload();
    expect(again.res.status).toBe(200);
    expect(again.body).toMatchObject({ baselineId: first.body.baselineId, reused: true });
  });

  it("rejects HEIC, unknown bytes, small images and missing files", async () => {
    const heic = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic"), ...new Uint8Array(16)]);
    const err = await expectError(await call("POST", "/api/baselines", { body: imageForm(heic, "image/heic") }), 415, "IMAGE_FORMAT");
    expect(err.details).toEqual({ hint: "heic" });
    await expectError(await call("POST", "/api/baselines", { body: imageForm(new Uint8Array(64)) }), 415, "IMAGE_FORMAT");

    const tinyPng = new Uint8Array(24);
    tinyPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    tinyPng.set([0, 0, 1, 0, 0, 0, 1, 0], 16); // 256 × 256
    await expectError(await call("POST", "/api/baselines", { body: imageForm(tinyPng, "image/png") }), 422, "IMAGE_TOO_SMALL");

    await expectError(await call("POST", "/api/baselines", { body: new FormData() }), 400, "VALIDATION_FAILED");
  });

  it("delete forgets the baseline and its jobs, and is honest about upstream retention", async () => {
    const { body } = await upload();
    await createJob(body.baselineId);
    const res = await call("DELETE", `/api/baselines/${body.baselineId}`);
    expect(DeleteBaselineResponse.parse(await res.json())).toEqual({ deleted: true, upstreamRetentionDays: 30 });
    const receipt = PrivacyReceipt.parse(await (await call("GET", "/api/privacy/receipt")).json());
    expect(receipt.baselines).toHaveLength(0);
    expect(receipt.jobs).toHaveLength(0);
  });
});

describe("jobs: happy path", () => {
  it("runs hair-transfer → hair-color, then serves the result", async () => {
    const { body: baseline } = await upload();
    const created = await createJob(baseline.baselineId);
    expect(created.status).toBe(202);
    const { job } = JobResponse.parse(await created.json());
    expect(job).toMatchObject({ status: "queued", resultReady: false });
    expect(job.steps.map((s) => s.kind)).toEqual(["hair-transfer", "hair-color"]);
    expect(job.provenance.steps[0]).toMatchObject({ endpoint: "/s2s/v2.1/task/hair-transfer", params: { template_id: "all_short_bob" } });

    await expectError(await call("GET", `/api/jobs/${job.id}/result`), 409, "NOT_READY");

    clock += 3000;
    let polled = await poll(job.id);
    expect(polled.status).toBe("running");
    expect(polled.steps.map((s) => s.status)).toEqual(["running", "pending"]);
    expect(polled.retryAfterMs).toBe(2000);

    clock += 6000;
    polled = await poll(job.id);
    expect(polled.steps.map((s) => s.status)).toEqual(["succeeded", "running"]);

    clock += 6000;
    polled = await poll(job.id);
    expect(polled).toMatchObject({ status: "succeeded", resultReady: true, retryAfterMs: 0 });
    expect(polled.steps.every((s) => s.youcamTaskId && s.finishedAt)).toBe(true);

    const result = await call("GET", `/api/jobs/${job.id}/result`);
    expect(result.headers.get("content-type")).toBe("image/jpeg");
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(new Uint8Array(await result.arrayBuffer()).subarray(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));

    clock += 111 * 60_000;
    await expectError(await call("GET", `/api/jobs/${job.id}/result`), 410, "EXPIRED");
  });

  it("is idempotent by spec and by clientRequestId, without spending units twice", async () => {
    const { body: baseline } = await upload();
    const id = crypto.randomUUID();
    const a = JobResponse.parse(await (await createJob(baseline.baselineId, routeSpec(), undefined, id)).json()).job;
    const sameRequest = await createJob(baseline.baselineId, routeSpec(), undefined, id);
    expect(sameRequest.status).toBe(200);
    const sameSpec = await createJob(baseline.baselineId, routeSpec());
    expect(sameSpec.status).toBe(200);
    expect(JobResponse.parse(await sameSpec.json()).job.id).toBe(a.id);
    const reroll = JobResponse.parse(await (await createJob(baseline.baselineId, { ...routeSpec(), attempt: 1 } as JobSpecInput)).json()).job;
    expect(reroll.id).not.toBe(a.id);
    const status = StatusResponse.parse(await (await call("GET", "/api/status")).json());
    expect(status.session.unitsUsed).toBe(6);
  });

  it("rejects unknown catalog ids and unknown baselines", async () => {
    const { body: baseline } = await upload();
    await expectError(await createJob(baseline.baselineId, routeSpec("closest", "not-a-style")), 400, "VALIDATION_FAILED");
    await expectError(await createJob("b".repeat(64)), 404, "NOT_FOUND");
    await expectError(await call("POST", "/api/jobs", { json: { nope: true } }), 400, "VALIDATION_FAILED");
  });

  it("enforces the session budget (24 units = 8 routes)", async () => {
    const { body: baseline } = await upload();
    // 6 attempts on short-bob + 2 on pixie = 8 distinct 3-unit routes = 24 units
    const routes: [string, number][] = [0, 1, 2, 3, 4, 5].map((a): [string, number] => ["short-bob", a]);
    routes.push(["pixie", 0], ["pixie", 1]);
    for (const [styleId, attempt] of routes) {
      expect((await createJob(baseline.baselineId, { ...routeSpec("easier", styleId), attempt } as JobSpecInput)).status).toBe(202);
    }
    await expectError(await createJob(baseline.baselineId, routeSpec("easier", "bixie")), 403, "SESSION_BUDGET_EXHAUSTED");
  });
});

describe("jobs: scenarios", () => {
  it.each([
    ["no_shoulder", "error_no_shoulder", "capture.retake.shoulders", false],
    ["hair_too_short", "error_hair_too_short", "capture.hairTooShort", false],
    ["face_pose", "error_face_pose", "capture.retake.faceForward", false],
    ["unavailable", "error_inference", "generic.serviceBusy", true],
  ] as const)("%s fails the job with the mapped error and refunds units", async (scenario, youcamCode, messageKey, retryable) => {
    const { body: baseline } = await upload();
    const { job } = JobResponse.parse(await (await createJob(baseline.baselineId, routeSpec(), scenario)).json());
    clock += 10_000;
    const failed = await poll(job.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatchObject({ youcamCode, messageKey, retryable });
    expect(failed.steps.map((s) => s.status)).toEqual(["failed", "pending"]);
    await expectError(await call("GET", `/api/jobs/${job.id}/result`), 404, "NOT_FOUND");
    const status = StatusResponse.parse(await (await call("GET", "/api/status")).json());
    expect(status.session.unitsUsed).toBe(0);
  });

  it("a failed job can be retried with a new clientRequestId", async () => {
    const { body: baseline } = await upload();
    const first = JobResponse.parse(await (await createJob(baseline.baselineId, routeSpec("new-chapter"), "partial_failure")).json()).job;
    const other = JobResponse.parse(await (await createJob(baseline.baselineId, routeSpec("closest", "pixie"), "partial_failure")).json()).job;
    clock += 20_000;
    expect((await poll(first.id)).status).toBe("failed");
    expect((await poll(other.id)).status).toBe("succeeded");
    const retry = await createJob(baseline.baselineId, routeSpec("new-chapter"), "partial_failure");
    expect(retry.status).toBe(202);
    const retried = JobResponse.parse(await retry.json()).job;
    clock += 20_000;
    expect((await poll(retried.id)).status).toBe("succeeded");
  });

  it("slow jobs take over 45 s and hint slower polling", async () => {
    const { body: baseline } = await upload();
    const { job } = JobResponse.parse(await (await createJob(baseline.baselineId, routeSpec(), "slow")).json());
    clock += 46_000;
    const polled = await poll(job.id);
    expect(polled).toMatchObject({ status: "running", retryAfterMs: 4000 });
  });

  it("timeout fails after 180 s", async () => {
    const { body: baseline } = await upload();
    const { job } = JobResponse.parse(await (await createJob(baseline.baselineId, routeSpec(), "timeout")).json());
    clock += 179_000;
    expect((await poll(job.id)).status).toBe("running");
    clock += 2000;
    expect((await poll(job.id)).error).toMatchObject({ code: "YOUCAM_TIMEOUT", retryable: true });
  });

  it("rate_limited, budget_exhausted, live_disabled and expired", async () => {
    const { body: baseline } = await upload();
    const limited = await createJob(baseline.baselineId, routeSpec(), "rate_limited");
    expect(limited.headers.get("retry-after")).toBe("5");
    await expectError(limited, 429, "RATE_LIMITED");
    await expectError(await call("POST", "/api/baselines", { body: imageForm(meera), scenario: "rate_limited" }), 429, "RATE_LIMITED");
    await expectError(await createJob(baseline.baselineId, routeSpec(), "budget_exhausted"), 403, "SESSION_BUDGET_EXHAUSTED");
    await expectError(await createJob(baseline.baselineId, routeSpec(), "live_disabled"), 503, "LIVE_DISABLED");
    const { job } = JobResponse.parse(await (await createJob(baseline.baselineId, routeSpec(), "expired")).json());
    clock += 20_000;
    expect((await poll(job.id)).resultReady).toBe(true);
    await expectError(await call("GET", `/api/jobs/${job.id}/result`), 410, "EXPIRED");
  });
});

describe("state persistence", () => {
  it("resumes jobs from exported state", async () => {
    const { body: baseline } = await upload();
    const { job } = JobResponse.parse(await (await createJob(baseline.baselineId)).json());
    const state = JSON.parse(JSON.stringify(backend.exportState()));
    backend = createNodeMockBackend({ now: () => clock });
    backend.importState(state);
    clock += 20_000;
    expect((await poll(job.id)).status).toBe("succeeded");
  });
});

describe("privacy receipt", () => {
  it("lists what the server holds and never claims to store images", async () => {
    const { body: baseline } = await upload();
    await createJob(baseline.baselineId);
    clock += 1000;
    const receipt = PrivacyReceipt.parse(await (await call("GET", "/api/privacy/receipt")).json());
    expect(receipt.serverStoresImages).toBe(false);
    expect(receipt.upstream.retentionDays).toBe(30);
    expect(receipt.jobs[0]).toMatchObject({ kind: "route", endpoints: ["/s2s/v2.1/task/hair-transfer", "/s2s/v2.0/task/hair-color"] });
  });
});

describe("shares (P1)", () => {
  it("create → view → vote → owner results → revoke", async () => {
    const form = new FormData();
    form.set("meta", JSON.stringify({ consent: true, items: [{ label: "Closest" }, { label: "Easier" }], expiresInDays: 7 }));
    form.append("images", new Blob([meera], { type: "image/jpeg" }), "a.jpg");
    form.append("images", new Blob([meera], { type: "image/jpeg" }), "b.jpg");
    const created = CreateShareResponse.parse(await (await call("POST", "/api/shares", { body: form })).json());

    const manifest = ShareManifest.parse(await (await call("GET", `/api/shares/${created.token}`)).json());
    expect(manifest.items.map((i) => i.label)).toEqual(["Closest", "Easier"]);
    expect((await call("GET", manifest.items[0]!.imageUrl)).headers.get("content-type")).toBe("image/jpeg");

    expect((await call("POST", `/api/shares/${created.token}/votes`, { json: { itemKey: "i1", note: "Most like you" } })).status).toBe(201);
    await expectError(await call("GET", `/api/shares/${created.token}/results`), 401, "UNAUTHORISED");
    const results = ShareResults.parse(await (await call("GET", `/api/shares/${created.token}/results`, { headers: { "x-owner-key": created.ownerKey } })).json());
    expect(results.items[0]!.votes).toBe(1);
    expect(results.notes[0]!.note).toBe("Most like you");

    expect((await call("DELETE", `/api/shares/${created.token}`, { headers: { "x-owner-key": created.ownerKey } })).status).toBe(200);
    await expectError(await call("GET", `/api/shares/${created.token}`), 410, "EXPIRED");
  });
});

it("ignores non-API paths so MSW can pass them through", async () => {
  expect(await backend.handle(new Request(`${ORIGIN}/mock/personas/meera.jpg`))).toBeUndefined();
});
