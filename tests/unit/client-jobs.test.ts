import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client/api";
import { clearEverything, db, rowStatus } from "@/lib/client/db";
import { fixtureJob } from "@/lib/client/fixtures";
import { enqueue, needsPolling, resumeUnsent, retry, send, storeResult, whenIdle } from "@/lib/client/jobs";
import type { JobSpec } from "@/lib/contracts";
import { errorBody } from "@/lib/contracts/errors";

const mockApi = vi.hoisted(() => ({ createJob: vi.fn(), job: vi.fn(), result: vi.fn() }));
// The result check loads MediaPipe; it has its own tests (result-check-run.test.ts).
vi.mock("@/lib/client/check/run", () => ({ checkStored: vi.fn(), afterRepair: vi.fn() }));
vi.mock("@/lib/client/api", async (original) => ({ ...(await original<typeof import("@/lib/client/api")>()), api: mockApi }));

const BASELINE = "a".repeat(64);
const spec: JobSpec = {
  kind: "route",
  routeId: "closest",
  styleId: "coily-chin",
  colour: { source: "own", hex: "#1C1714" },
  attempt: 0,
};

// Deterministic: waits until every request the engine started has finished (no sleeping, so no load flake).
const settle = whenIdle;

beforeEach(async () => {
  vi.resetAllMocks();
  await clearEverything();
});

describe("enqueue", () => {
  it("writes the row to IndexedDB BEFORE the request is sent", async () => {
    let storedAtSendTime = false;
    mockApi.createJob.mockImplementation(async (req: { clientRequestId: string }) => {
      storedAtSendTime = Boolean(await db.jobs.get(req.clientRequestId));
      return { job: fixtureJob({ id: "job-1", routeId: "closest", styleId: "coily-chin", status: "running" }) };
    });

    const row = await enqueue({ baselineId: BASELINE, routeKey: "closest", spec });
    await settle();

    expect(storedAtSendTime).toBe(true);
    const saved = await db.jobs.get(row.clientRequestId);
    expect(saved?.jobId).toBe("job-1");
    expect(rowStatus(saved!)).toBe("running");
  });

  it("keeps the row and records the error when the create request fails", async () => {
    mockApi.createJob.mockRejectedValue(new ApiError(errorBody("SESSION_BUDGET_EXHAUSTED"), 403));

    const row = await enqueue({ baselineId: BASELINE, routeKey: "closest", spec });
    await settle();

    const saved = await db.jobs.get(row.clientRequestId);
    expect(saved?.sendError?.messageKey).toBe("budget.sessionReached");
    expect(rowStatus(saved!)).toBe("failed");
  });

  it("turns a dropped connection into a calm, retryable error", async () => {
    mockApi.createJob.mockRejectedValue(new TypeError("fetch failed"));

    const row = await enqueue({ baselineId: BASELINE, routeKey: "closest", spec });
    await settle();

    const error = (await db.jobs.get(row.clientRequestId))?.sendError;
    expect(error?.retryable).toBe(true);
    expect(error?.messageKey).toBe("generic.serviceBusy");
  });
});

describe("reload and retry", () => {
  it("re-sends an unanswered row with the SAME clientRequestId, once", async () => {
    // A row left behind by a reload mid-send: stored, never answered.
    await db.jobs.add({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      baselineId: BASELINE,
      routeKey: "closest",
      spec,
      result: "none",
      createdAt: new Date().toISOString(),
    });
    mockApi.createJob.mockResolvedValue({ job: fixtureJob({ id: "job-9", routeId: "closest", styleId: "coily-chin" }) });

    await resumeUnsent(BASELINE);
    await resumeUnsent(BASELINE);

    expect(mockApi.createJob).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: "11111111-1111-4111-8111-111111111111" }),
    );
    expect(mockApi.createJob).toHaveBeenCalledTimes(1);
    expect(await db.jobs.count()).toBe(1);
  });

  it("does not send a row twice at the same time", async () => {
    let release!: () => void;
    mockApi.createJob.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve({ job: fixtureJob({ id: "j", routeId: "closest", styleId: "coily-chin" }) }))),
    );
    const row = await enqueue({ baselineId: BASELINE, routeKey: "closest", spec });
    await send(row); // second attempt while the first is in flight
    release();
    await settle();
    expect(mockApi.createJob).toHaveBeenCalledTimes(1);
  });

  it("retries a failed path with a NEW clientRequestId and hides the old row", async () => {
    mockApi.createJob.mockRejectedValueOnce(new ApiError(errorBody("YOUCAM_UNAVAILABLE"), 502));
    const failed = await enqueue({ baselineId: BASELINE, routeKey: "new-chapter", spec });
    await settle();

    mockApi.createJob.mockResolvedValue({ job: fixtureJob({ id: "job-2", routeId: "new-chapter", styleId: "coily-chin" }) });
    const fresh = await retry((await db.jobs.get(failed.clientRequestId))!);
    await settle();

    expect(fresh.clientRequestId).not.toBe(failed.clientRequestId);
    expect((await db.jobs.get(failed.clientRequestId))?.superseded).toBe(true);
    expect(fresh.routeKey).toBe("new-chapter");
    expect((await db.jobs.get(fresh.clientRequestId))?.jobId).toBe("job-2");
  });
});

describe("storeResult", () => {
  const readyRow = async () => {
    const job = { ...fixtureJob({ id: "job-1", routeId: "closest", styleId: "coily-chin" }), resultReady: true };
    await db.jobs.add({
      clientRequestId: "22222222-2222-4222-8222-222222222222",
      baselineId: BASELINE,
      routeKey: "closest",
      spec,
      jobId: "job-1",
      job,
      result: "none",
      createdAt: new Date().toISOString(),
    });
    return (await db.jobs.get("22222222-2222-4222-8222-222222222222"))!;
  };

  it("copies the image onto the device and marks it stored", async () => {
    mockApi.result.mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
    const row = await readyRow();

    await storeResult(row);

    const stored = await db.results.get(row.clientRequestId);
    expect(stored?.image.size).toBe(4);
    expect(stored?.provenance.mode).toBe("mock");
    expect((await db.jobs.get(row.clientRequestId))?.result).toBe("stored");
  });

  it("marks an expired result so the UI can offer to make it again", async () => {
    mockApi.result.mockRejectedValue(new ApiError(errorBody("EXPIRED"), 410));
    const row = await readyRow();

    await storeResult(row);

    expect((await db.jobs.get(row.clientRequestId))?.result).toBe("expired");
    expect(await db.results.count()).toBe(0);
  });

  it("leaves a not-ready result for the next poll", async () => {
    mockApi.result.mockRejectedValue(new ApiError(errorBody("NOT_READY"), 409));
    const row = await readyRow();

    await storeResult(row);

    expect((await db.jobs.get(row.clientRequestId))?.result).toBe("none");
  });
});

describe("needsPolling", () => {
  const base = {
    clientRequestId: "x",
    baselineId: BASELINE,
    routeKey: "closest",
    spec,
    result: "none" as const,
    createdAt: "2026-10-26T12:00:00.000Z",
  };
  const job = (status: "queued" | "running" | "succeeded" | "failed") =>
    fixtureJob({ id: "j", routeId: "closest", styleId: "coily-chin", status });

  it("polls running jobs, and finished ones whose image isn't on the device yet", () => {
    expect(needsPolling({ ...base, jobId: "j", job: job("running") })).toBe(true);
    expect(needsPolling({ ...base, jobId: "j", job: job("succeeded") })).toBe(true);
  });

  it("stops for stored, failed, superseded, unsent and errored rows", () => {
    expect(needsPolling({ ...base, jobId: "j", job: job("succeeded"), result: "stored" })).toBe(false);
    expect(needsPolling({ ...base, jobId: "j", job: job("failed") })).toBe(false);
    expect(needsPolling({ ...base, jobId: "j", job: job("running"), superseded: true })).toBe(false);
    expect(needsPolling({ ...base })).toBe(false);
    expect(needsPolling({ ...base, sendError: errorBody("NOT_FOUND") })).toBe(false);
  });
});
