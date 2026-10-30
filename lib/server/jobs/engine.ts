import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { catalog, planSteps, UnknownCatalogIdError, type PlannedStep } from "@/lib/catalog";
import { canonicalJson } from "@/lib/contracts/canonical";
import { CreateJobRequest, type Job } from "@/lib/contracts/api";
import { errorBody, fromYoucamCode, type ErrorBody } from "@/lib/contracts/errors";
import { getBaseline } from "../baselines";
import type { ServerContext } from "../context";
import { ApiError } from "../http/errors";
import type { HandlerContext } from "../http/handler";
import { slidingRateLimit } from "../http/ratelimit";
import { keys, TTL } from "../keys";
import { liveState } from "../ledger/breaker";
import { refund, reserve } from "../ledger/ledger";
import { metrics } from "../ledger/metrics";
import { log } from "../log";
import { YouCamHttpError } from "../youcam/adapter";
import { fillBody, needsStyleRef, styleRefFileId } from "./mapper";
import { getJob, saveJob, type StoredJob } from "./store";

export const JOB_TIMEOUT_MS = 180_000;
export const RESULT_TTL_MS = 110 * 60_000;
const POLL_DEDUPE_MS = 4000;
const LOCK_MS = 5000;
const SUBMIT_BACKOFF_MS = [1000, 3000, 7000];
/** All instances together stay under YouCam's 250 calls / 300 s per token (the rest is headroom for balance checks). */
export const YOUCAM_CALL_BUDGET = { name: "youcam", limit: 200, windowMs: 300_000 };
/** A YouCam step never finishes sooner than this after submit (measured 9–15 s), so earlier polls are wasted calls. */
export const MIN_STEP_POLL_MS = 5000;
const MAX_THROTTLE_CREDIT_MS = 60_000;

/** Thrown before a YouCam call when the global budget is spent; callers wait instead of failing the job. */
class CallBudgetExceeded extends Error {
  constructor(readonly retryAfterMs: number) {
    super("youcam call budget exhausted");
  }
}

/** Count one real YouCam call against the global window (every instance shares it through the KV). */
async function spendCall(ctx: EngineCtx) {
  const r = await slidingRateLimit(ctx.kv, YOUCAM_CALL_BUDGET, "global", ctx.now());
  if (!r.ok) throw new CallBudgetExceeded(r.retryAfterMs);
}

/**
 * While throttled a job can't make progress, so the wait we impose doesn't count toward its timeout.
 * We credit the wait we are about to ask for (the next attempt is no earlier than that), not the past.
 */
function creditThrottle(job: StoredJob, waitMs: number) {
  job.throttledMs = (job.throttledMs ?? 0) + Math.min(Math.max(0, waitMs), MAX_THROTTLE_CREDIT_MS);
}

/** The delay we ask clients to wait when throttled: at least 6 s, at most 60 s. */
function throttleWait(retryAfterMs: number) {
  return Math.min(Math.max(retryAfterMs, 6000), MAX_THROTTLE_CREDIT_MS);
}

type Ctx = HandlerContext<Record<string, string>>;
/** What the state machine needs: no blob store. */
export type EngineCtx = Pick<ServerContext, "env" | "kv" | "now" | "youcam">;

const iso = (ms?: number) => (ms === undefined ? undefined : new Date(ms).toISOString());
const isTerminal = (job: StoredJob) => job.status === "succeeded" || job.status === "failed";

/**
 * The result URL a repair job recolours. Only a finished route or colour job of the same baseline,
 * still inside its result window, can be repaired (not a brows job, and never a repair of a repair,
 * so a loop can't spend units).
 */
async function repairSourceUrl(ctx: Pick<EngineCtx, "kv" | "now">, fromJobId: string, baselineId: string): Promise<string> {
  const from = await getJob(ctx.kv, fromJobId);
  if (!from || from.baselineId !== baselineId) throw new ApiError("NOT_FOUND", { details: "the job to repair is unknown" });
  if (from.spec.kind !== "route" && from.spec.kind !== "colour") throw new ApiError("VALIDATION_FAILED", { details: [{ path: "spec.fromJobId", message: "only a route or colour result can be repaired" }] });
  if (from.status !== "succeeded" || !from.resultAt) throw new ApiError("NOT_READY");
  if (ctx.now() - from.resultAt > RESULT_TTL_MS) throw new ApiError("EXPIRED");
  const url = from.steps.at(-1)?.resultUrl;
  if (!url) throw new ApiError("INTERNAL");
  return url;
}

/* ------------------------------------------------------------------- view */

export function toPublicJob(job: StoredJob, now: number, retryAfterMs?: number): Job {
  const terminal = isTerminal(job);
  return {
    id: job.id,
    baselineId: job.baselineId,
    clientRequestId: job.clientRequestId,
    spec: job.spec,
    status: job.status,
    steps: job.steps.map((s) => ({
      kind: s.kind,
      status: s.status,
      units: s.units,
      ...(s.youcamTaskId ? { youcamTaskId: s.youcamTaskId } : {}),
      ...(s.startedAt ? { startedAt: iso(s.startedAt) } : {}),
      ...(s.finishedAt ? { finishedAt: iso(s.finishedAt) } : {}),
    })),
    ...(job.error ? { error: job.error } : {}),
    resultReady: job.status === "succeeded",
    ...(job.resultAt ? { resultExpiresAt: iso(job.resultAt + RESULT_TTL_MS) } : {}),
    provenance: {
      mode: job.mode,
      steps: job.steps.map((s) => ({
        kind: s.kind,
        endpoint: s.endpoint,
        apiVersion: s.apiVersion,
        params: s.body, // placeholders, never real file ids or signed URLs
        ...(s.youcamTaskId ? { youcamTaskId: s.youcamTaskId } : {}),
        ...(s.finishedAt ? { finishedAt: iso(s.finishedAt) } : {}),
      })),
    },
    retryAfterMs: terminal ? 0 : (retryAfterMs ?? (now - job.createdAt > 30_000 ? 4000 : 2000)),
    createdAt: iso(job.createdAt)!,
    updatedAt: iso(job.updatedAt)!,
  };
}

/* ----------------------------------------------------------- transitions */

async function failJob(ctx: EngineCtx, job: StoredJob, error: ErrorBody, opts: { refund: boolean } = { refund: true }) {
  const now = ctx.now();
  for (const s of job.steps) {
    if (s.status === "running") {
      s.status = "failed";
      s.finishedAt = now;
    }
  }
  job.status = "failed";
  job.error = error;
  job.updatedAt = now;
  // YouCam errors are free (B0), so refund every step that didn't succeed. A timeout may still be
  // charged upstream, so it keeps its reservation.
  if (opts.refund) {
    const units = job.steps.filter((s) => s.status !== "succeeded").reduce((sum, s) => sum + s.units, 0);
    await refund(ctx.kv, job.reservation, units);
    job.refundedUnits = units;
  }
  await metrics.jobFinished(ctx.kv, "failed");
  if (error.youcamCode) await metrics.youcamError(ctx.kv, error.youcamCode);
  log.info("job.failed", { job: job.id, code: error.code, youcamCode: error.youcamCode });
}

/** Submit the first pending step. Retryable YouCam failures are retried on later polls (1/3/7 s). */
async function submitNext(ctx: EngineCtx, job: StoredJob) {
  const index = job.steps.findIndex((s) => s.status === "pending");
  if (index < 0) return;
  const step = job.steps[index]!;
  const now = ctx.now();

  const baseline = await getBaseline(ctx, job.baselineId);
  if (!baseline) return failJob(ctx, job, errorBody("NOT_FOUND", { details: "baseline expired; upload it again" }));

  try {
    const meta = { mockScenario: job.mockScenario };
    await spendCall(ctx);
    const body = fillBody(step.body, {
      baselineFileId: baseline.fileId,
      previousResultUrl: job.steps[index - 1]?.resultUrl,
      ...(job.spec.kind === "repair" ? { sourceResultUrl: await repairSourceUrl(ctx, job.spec.fromJobId, job.baselineId) } : {}),
      ...(needsStyleRef(step.body) && job.spec.kind === "route" ? { styleRefFileId: await styleRefFileId(ctx, job.spec.styleId, meta) } : {}),
    });
    const { taskId } = await ctx.youcam.createTask(step.kind, body, meta);
    step.youcamTaskId = taskId;
    step.status = "running";
    step.startedAt = now;
    job.status = "running";
    job.submitAttempts = 0;
    job.throttledMs = 0; // the per-step clock restarts
    delete job.nextSubmitAt;
    job.updatedAt = now;
    await ctx.kv.set(keys.task(taskId), job.id, { ttlMs: TTL.record });
  } catch (err) {
    if (err instanceof CallBudgetExceeded) {
      // Wait for the window to roll; the job stays queued (or between steps) and is not failed or timed out for it.
      const wait = throttleWait(err.retryAfterMs);
      job.nextSubmitAt = now + wait;
      creditThrottle(job, wait);
      job.updatedAt = now;
      log.warn("job.submit_throttled", { job: job.id });
      return;
    }
    if (err instanceof YouCamHttpError && err.retryable && job.submitAttempts < SUBMIT_BACKOFF_MS.length) {
      job.nextSubmitAt = now + Math.max(err.retryAfterMs ?? 0, SUBMIT_BACKOFF_MS[job.submitAttempts]!);
      job.submitAttempts++;
      job.updatedAt = now;
      log.warn("job.submit_retry", { job: job.id, attempt: job.submitAttempts, status: String(err.httpStatus) });
      return;
    }
    const code = err instanceof YouCamHttpError && err.retryable ? "YOUCAM_UNAVAILABLE" : "INTERNAL";
    if (code === "INTERNAL") log.error("job.submit_failed", { job: job.id, error: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    await failJob(ctx, job, errorBody(code));
  }
}

/** `called`: a real YouCam call (or submit) was attempted; `throttled`: the global budget was spent; `idle`: nothing to do yet. */
export type AdvanceResult = "called" | "throttled" | "idle";

/** The 180 s clock runs per step (from its submit, or from creation while still queued), minus time spent throttled. */
function stepAge(job: StoredJob, step: StoredJob["steps"][number] | undefined, now: number) {
  return now - (step?.startedAt ?? job.createdAt) - (job.throttledMs ?? 0);
}

/** One step of the state machine. Shared by the poll handler and the webhook (always under the job lock). */
export async function advance(ctx: EngineCtx, job: StoredJob): Promise<AdvanceResult> {
  if (isTerminal(job)) return "idle";
  const now = ctx.now();
  const step = job.steps.find((s) => s.status === "running");
  const timedOut = stepAge(job, step, now) > JOB_TIMEOUT_MS;

  if (!step) {
    if (timedOut) {
      await failJob(ctx, job, errorBody("YOUCAM_TIMEOUT"), { refund: false });
      return "idle";
    }
    if (job.nextSubmitAt && now < job.nextSubmitAt) return "idle";
    await submitNext(ctx, job);
    return job.nextSubmitAt && job.nextSubmitAt > now ? "throttled" : "called";
  }
  // A step never finishes sooner than this after submit, so asking earlier only burns the call budget.
  if (!timedOut && now - (step.startedAt ?? 0) < MIN_STEP_POLL_MS) return "idle";

  // Even when it has timed out, ask YouCam once more: the result may have been ready all along
  // (a closed laptop, a backgrounded tab). A late success is accepted; only a still-running task fails.
  let state;
  try {
    await spendCall(ctx);
    state = await ctx.youcam.getTask(step.kind, step.youcamTaskId!);
  } catch (err) {
    if (err instanceof CallBudgetExceeded) {
      const wait = throttleWait(err.retryAfterMs);
      creditThrottle(job, wait);
      job.nextCheckAfter = now + wait;
      return "throttled";
    }
    if (err instanceof YouCamHttpError && err.retryable) {
      if (timedOut) await failJob(ctx, job, errorBody("YOUCAM_TIMEOUT"), { refund: false });
      return "called"; // otherwise try again next poll
    }
    log.error("job.poll_failed", { job: job.id, error: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    await failJob(ctx, job, errorBody("INTERNAL"));
    return "called";
  }

  if (state.status === "running") {
    if (timedOut) await failJob(ctx, job, errorBody("YOUCAM_TIMEOUT"), { refund: false });
    return "called";
  }
  if (state.status === "error") {
    await failJob(ctx, job, fromYoucamCode(state.youcamCode));
    return "called";
  }

  step.status = "succeeded";
  step.finishedAt = now;
  step.resultUrl = state.resultUrl;
  job.updatedAt = now;
  await metrics.unitsSpent(ctx.kv, step.kind, step.units);
  if (job.steps.some((s) => s.status === "pending")) {
    await submitNext(ctx, job);
    return "called";
  }

  job.status = "succeeded";
  job.resultAt = now;
  await metrics.jobFinished(ctx.kv, "succeeded");
  await metrics.latency(ctx.kv, job.spec.kind, now - job.createdAt);
  return "called";
}

/* -------------------------------------------------------------- create */

function plan(spec: StoredJob["spec"]): PlannedStep[] {
  try {
    return planSteps(spec, catalog);
  } catch (err) {
    if (err instanceof UnknownCatalogIdError) throw new ApiError("VALIDATION_FAILED", { details: [{ path: `spec.${err.field}`, message: err.message }] });
    throw err;
  }
}

export async function createJob(ctx: Ctx): Promise<{ status: 200 | 202; job: Job }> {
  let raw: unknown;
  try {
    raw = await ctx.request.json();
  } catch {
    throw new ApiError("VALIDATION_FAILED", { details: "body must be JSON" });
  }
  const { baselineId, clientRequestId, spec } = CreateJobRequest.parse(raw);
  const sid = ctx.session.id;
  const now = ctx.now();

  // Retry of the same request → the same job, whatever its state.
  const byRequest = await ctx.kv.get<string>(keys.clientRequest(sid, clientRequestId));
  const prior = byRequest ? await getJob(ctx.kv, byRequest) : null;
  if (prior) return { status: 200, job: toPublicJob(prior, now) };

  const steps = plan(spec);
  if (spec.kind === "brows" && !ctx.env.CAP_BROWS) throw new ApiError("FEATURE_DISABLED", { details: "brows" });
  if (spec.kind === "route" && spec.routeId.startsWith("regrowth") && !ctx.env.CAP_REGROWTH) throw new ApiError("FEATURE_DISABLED", { details: "regrowth" });

  if (!(await getBaseline(ctx, baselineId))) throw new ApiError("NOT_FOUND", { details: "baseline expired or unknown; upload it again" });
  if (spec.kind === "repair") await repairSourceUrl(ctx, spec.fromJobId, baselineId);

  // Same baseline + spec → the existing job (no units), unless it failed.
  const idemKey = createHash("sha256").update(`${baselineId}:${canonicalJson(spec)}`).digest("hex");
  const sameId = await ctx.kv.get<string>(keys.idem(idemKey));
  const same = sameId ? await getJob(ctx.kv, sameId) : null;
  if (same && same.status !== "failed") {
    await ctx.kv.set(keys.clientRequest(sid, clientRequestId), same.id, { ttlMs: TTL.record });
    await ctx.kv.sAdd(keys.sessionJobs(sid), same.id);
    return { status: 200, job: toPublicJob(same, now) };
  }

  if (ctx.mockScenario === "rate_limited") throw new ApiError("RATE_LIMITED", {}, { "retry-after": "5" });
  if (ctx.mockScenario === "live_disabled") throw new ApiError("LIVE_DISABLED");
  if (ctx.mockScenario === "budget_exhausted") throw new ApiError("SESSION_BUDGET_EXHAUSTED", { details: { scope: "session", unitsCap: ctx.env.SESSION_UNIT_CAP } });
  if (!(await liveState(ctx)).live) throw new ApiError("LIVE_DISABLED");

  const units = steps.reduce((sum, s) => sum + s.units, 0);
  const reservation = await reserve(ctx, sid, ctx.ipHash, units);

  // Mock parity with MockBackend: partial_failure fails the New chapter route once.
  let mockScenario = ctx.mockScenario;
  if (mockScenario === "partial_failure") {
    const firstTime = spec.kind === "route" && spec.routeId === "new-chapter" && (await ctx.kv.setNX(keys.partialFailure(idemKey), 1, TTL.record));
    mockScenario = firstTime ? "unavailable" : undefined;
  }

  const job: StoredJob = {
    id: `job_${randomBytes(12).toString("base64url")}`,
    sessionId: sid,
    baselineId,
    clientRequestId,
    spec,
    idemKey,
    mode: ctx.youcam.mode,
    ...(mockScenario ? { mockScenario } : {}),
    status: "queued",
    steps: steps.map((s) => ({ kind: s.kind, endpoint: s.endpoint, apiVersion: s.apiVersion, units: s.units, body: s.body, status: "pending" })),
    reservation,
    refundedUnits: 0,
    submitAttempts: 0,
    createdAt: now,
    updatedAt: now,
    lastCheckedAt: now,
  };
  await ctx.kv.set(keys.idem(idemKey), job.id, { ttlMs: TTL.record });
  await ctx.kv.set(keys.clientRequest(sid, clientRequestId), job.id, { ttlMs: TTL.record });
  await ctx.kv.sAdd(keys.sessionJobs(sid), job.id);
  await ctx.kv.expire(keys.sessionJobs(sid), TTL.record);
  await metrics.jobCreated(ctx.kv);

  await submitNext(ctx, job);
  await saveJob(ctx.kv, job, ctx.now());
  log.info("job.created", { requestId: ctx.requestId, job: job.id, kind: spec.kind, units, status: job.status });
  return { status: 202, job: toPublicJob(job, ctx.now()) };
}

/* ---------------------------------------------------------------- poll */

/**
 * GET /api/jobs/:id. Many clients polling one job cause at most one YouCam call per 4 s: recent checks
 * are served from KV, a lock serialises advances, and a global window caps YouCam calls.
 * Job ids are 96-bit random capability tokens (no session check), so a lost cookie can still resume.
 */
export async function pollJob(ctx: EngineCtx, id: string): Promise<Job> {
  const job = await getJob(ctx.kv, id);
  if (!job) throw new ApiError("NOT_FOUND");
  const now = ctx.now();
  if (isTerminal(job) || now - job.lastCheckedAt < POLL_DEDUPE_MS) return toPublicJob(job, now);
  if (!(await ctx.kv.setNX(keys.jobLock(id), 1, LOCK_MS))) return toPublicJob(job, now);
  try {
    const fresh = (await getJob(ctx.kv, id)) ?? job;
    delete fresh.nextCheckAfter;
    const result = await advance(ctx, fresh);
    // Polls that made no YouCam call (too early, nothing due) must not eat the 4 s dedupe window.
    if (result !== "idle") fresh.lastCheckedAt = now;
    await saveJob(ctx.kv, fresh, now);
    // Throttled by the global budget: tell the client to come back later instead of at the normal pace.
    return toPublicJob(fresh, now, fresh.nextCheckAfter ? fresh.nextCheckAfter - now : undefined);
  } finally {
    await ctx.kv.del(keys.jobLock(id));
  }
}
