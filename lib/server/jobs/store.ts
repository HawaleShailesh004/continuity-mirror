import "server-only";
import type { AdapterMode, JobSpec, JobStatus, MockScenario, StepKind } from "@/lib/contracts/api";
import type { ErrorBody } from "@/lib/contracts/errors";
import { keys, TTL } from "../keys";
import type { Reservation } from "../ledger/ledger";
import type { KV } from "../store/kv";

export type StoredStep = {
  kind: StepKind;
  endpoint: string;
  apiVersion: string;
  units: number;
  /** YouCam body with placeholders (what provenance shows). Real ids are filled only at submit. */
  body: Record<string, unknown>;
  status: "pending" | "running" | "succeeded" | "failed";
  youcamTaskId?: string;
  /** Signed upstream URL (~2 h). Never sent to the client or logged. */
  resultUrl?: string;
  startedAt?: number;
  finishedAt?: number;
};

export type StoredJob = {
  id: string;
  sessionId: string;
  baselineId: string;
  clientRequestId: string;
  spec: JobSpec;
  idemKey: string;
  mode: AdapterMode;
  mockScenario?: MockScenario;
  status: JobStatus;
  steps: StoredStep[];
  error?: ErrorBody;
  reservation: Reservation;
  refundedUnits: number;
  /** Submit retries for the current pending step after a retryable YouCam failure. */
  submitAttempts: number;
  nextSubmitAt?: number;
  /** Time spent waiting because the global YouCam call budget was exhausted. Not counted toward the 180 s timeout. */
  throttledMs?: number;
  /** Transient: set by a throttled poll so the response can carry a longer retry hint. Not persisted meaningfully. */
  nextCheckAfter?: number;
  createdAt: number;
  updatedAt: number;
  lastCheckedAt: number;
  resultAt?: number;
};

export async function getJob(kv: KV, id: string): Promise<StoredJob | null> {
  return /^job_[A-Za-z0-9_-]{16}$/.test(id) ? kv.get<StoredJob>(keys.job(id)) : null;
}

/** Records live 24 h from creation, whatever happens to them in between. */
export async function saveJob(kv: KV, job: StoredJob, now: number) {
  const ttlMs = Math.max(60_000, job.createdAt + TTL.record - now);
  await kv.set(keys.job(job.id), job, { ttlMs });
}

export async function deleteJob(kv: KV, job: StoredJob) {
  if ((await kv.get<string>(keys.idem(job.idemKey))) === job.id) await kv.del(keys.idem(job.idemKey));
  await kv.del(keys.job(job.id), keys.clientRequest(job.sessionId, job.clientRequestId), ...job.steps.flatMap((s) => (s.youcamTaskId ? [keys.task(s.youcamTaskId)] : [])));
  await kv.sRem(keys.sessionJobs(job.sessionId), job.id);
}

export async function sessionJobs(kv: KV, sessionId: string): Promise<StoredJob[]> {
  const ids = await kv.sMembers(keys.sessionJobs(sessionId));
  const jobs = await Promise.all(ids.map((id) => kv.get<StoredJob>(keys.job(id))));
  return jobs.filter((j): j is StoredJob => j !== null);
}
