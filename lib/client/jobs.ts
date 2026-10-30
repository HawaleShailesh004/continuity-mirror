/*
 * Client-side job engine: the rules that keep generation honest with units.
 *
 *  1. The row is written to IndexedDB BEFORE the request is sent. A reload in
 *     the middle re-sends the same clientRequestId; the server returns the same
 *     job. No duplicates, no extra units (docs/API.md, "The core flow").
 *  2. A failed job is retried with a NEW clientRequestId (the same one would
 *     return the old failed job). The old row is hidden, not deleted.
 *  3. The result is copied to the device the moment `resultReady` is true. The
 *     upstream URL expires (410 after ~110 min), so we never depend on it.
 *
 * Plain functions over Dexie + the API client, so they are unit-testable
 * without React. The React side (JobPoller) only schedules polls.
 */
import { api, ApiError, toApiError } from "./api";
import { recompressPng } from "./capture/encode";
import { db, rowStatus, type JobRow } from "./db";
import type { Job, JobSpec } from "@/lib/contracts";

const inFlight = new Set<string>();

export const newRequestId = () => crypto.randomUUID();

/**
 * Resolves once no create or result request is in flight. Lets tests (and any
 * caller that must act "after the send finished") wait deterministically
 * instead of sleeping.
 */
export async function whenIdle(): Promise<void> {
  while (inFlight.size > 0) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** True once a job can no longer change. */
export const isTerminal = (status: Job["status"]) => status === "succeeded" || status === "failed";

/** Write the row first, then send. Returns the stored row. */
export async function enqueue(input: {
  baselineId: string;
  routeKey: string;
  spec: JobSpec;
  variantOf?: string;
  repairOf?: string;
}): Promise<JobRow> {
  const row: JobRow = {
    clientRequestId: newRequestId(),
    baselineId: input.baselineId,
    routeKey: input.routeKey,
    variantOf: input.variantOf,
    repairOf: input.repairOf,
    spec: input.spec,
    result: "none",
    createdAt: new Date().toISOString(),
  };
  await db.jobs.add(row);
  void send(row);
  return row;
}

/** Send (or re-send) a stored row. Idempotent on the server for the same clientRequestId. */
export async function send(row: JobRow): Promise<void> {
  if (inFlight.has(row.clientRequestId)) return;
  inFlight.add(row.clientRequestId);
  try {
    const { job } = await api.createJob({
      baselineId: row.baselineId,
      clientRequestId: row.clientRequestId,
      spec: row.spec,
    });
    await db.jobs.update(row.clientRequestId, { jobId: job.id, job, sendError: undefined });
  } catch (error) {
    await db.jobs.update(row.clientRequestId, { sendError: toApiError(error).body });
    if (row.repairOf) await markRepair(row.repairOf, "failed");
  } finally {
    inFlight.delete(row.clientRequestId);
  }
}

/**
 * Retry a failed path with a fresh clientRequestId. Only that path: the others
 * stay as they are (partial failure, plan §4.1).
 */
export async function retry(row: JobRow): Promise<JobRow> {
  await db.jobs.update(row.clientRequestId, { superseded: true });
  return enqueue({ baselineId: row.baselineId, routeKey: row.routeKey, spec: row.spec, variantOf: row.variantOf });
}

/** After a reload: re-send anything that never got an answer. */
export async function resumeUnsent(baselineId: string): Promise<void> {
  const rows = await db.jobs.where("baselineId").equals(baselineId).toArray();
  await Promise.all(rows.filter((r) => !r.jobId && !r.sendError && !r.superseded).map(send));
}

/** Record the latest server copy of a job. */
export async function applyJob(clientRequestId: string, job: Job): Promise<void> {
  await db.jobs.update(clientRequestId, { jobId: job.id, job });
  if (job.status === "failed") {
    const row = await db.jobs.get(clientRequestId);
    if (row?.repairOf) await markRepair(row.repairOf, "failed");
  }
}

/** Record how a repair went on the result it was meant to fix (the result check's badge reads it). */
export async function markRepair(sourceId: string, state: "queued" | "adjusted" | "failed", deltaEAfter?: number): Promise<void> {
  const source = await db.jobs.get(sourceId);
  if (!source?.check) return;
  const repaired = { state, ...(deltaEAfter === undefined ? {} : { deltaEAfter }) };
  await db.jobs.update(sourceId, { check: { ...source.check, ...(state === "adjusted" ? { outcome: "checked" as const } : {}), repaired } });
}

/**
 * Copy a finished result onto the device. NOT_READY just means "ask again on
 * the next poll"; EXPIRED is recorded so the UI can offer to make it again.
 */
export async function storeResult(row: JobRow): Promise<void> {
  const job = row.job;
  if (!job?.resultReady || row.result !== "none" || !row.jobId || inFlight.has(`result:${row.clientRequestId}`)) return;
  inFlight.add(`result:${row.clientRequestId}`);
  try {
    const image = await recompressPng(await api.result(row.jobId));
    if (row.repairOf) {
      // A repair never becomes a result of its own: it replaces the image of the result it fixed and
      // keeps the first one beside it, with its YouCam step added to "How this was made".
      const sourceId = row.repairOf;
      await db.transaction("rw", db.results, db.jobs, async () => {
        const source = await db.results.get(sourceId);
        if (source) {
          await db.results.put({
            ...source,
            image,
            original: source.original ?? source.image,
            provenance: { ...source.provenance, steps: [...source.provenance.steps, ...job.provenance.steps] },
          });
        }
        await db.jobs.update(row.clientRequestId, { result: "stored" });
      });
      void import("./check/run").then((m) => m.afterRepair(sourceId));
      return;
    }
    await db.transaction("rw", db.results, db.jobs, async () => {
      await db.results.put({
        clientRequestId: row.clientRequestId,
        baselineId: row.baselineId,
        image,
        provenance: job.provenance,
        createdAt: new Date().toISOString(),
      });
      await db.jobs.update(row.clientRequestId, { result: "stored" });
    });
    // Off the main bundle (it brings MediaPipe) and off the critical path: the user already has the image.
    void import("./check/run").then((m) => m.checkStored(row.clientRequestId));
  } catch (error) {
    if (error instanceof ApiError && error.body.code === "EXPIRED") {
      await db.jobs.update(row.clientRequestId, { result: "expired" });
    }
    // Anything else (NOT_READY, offline): leave it "none"; the next poll tries again.
  } finally {
    inFlight.delete(`result:${row.clientRequestId}`);
  }
}

/** A row the poller should keep working on. */
export function needsPolling(row: JobRow): boolean {
  if (row.superseded || row.sendError || !row.jobId || !row.job) return false;
  if (!isTerminal(row.job.status)) return true;
  return row.job.status === "succeeded" && row.result === "none";
}

/** Whole-path summary used by screens: the live (non-superseded) rows of a path. */
export function liveRows(rows: readonly JobRow[]): JobRow[] {
  return rows.filter((r) => !r.superseded);
}

export { rowStatus };
