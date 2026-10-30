import "server-only";
import type { AdminMetrics, JobKind, JobStatus, StepKind } from "@/lib/contracts/api";
import { keys } from "../keys";
import type { KV } from "../store/kv";

// Operator numbers for the submission ("p95 route latency", "units by kind"). Best effort: a lost
// increment under a race is acceptable; nothing here gates behaviour.
const LATENCY_SAMPLES = 200;
const STEP_KINDS: StepKind[] = ["hair-transfer", "hair-color", "hair-bang", "makeup-vto"];
const JOB_KINDS: JobKind[] = ["route", "colour", "brows", "fringe", "repair"];
const JOB_STATUSES: JobStatus[] = ["queued", "running", "succeeded", "failed"];

export const metrics = {
  unitsSpent: (kv: KV, kind: StepKind, units: number) => kv.incrBy(keys.metric(`units:${kind}`), units),
  jobFinished: (kv: KV, status: JobStatus) => kv.incrBy(keys.metric(`jobs:${status}`), 1),
  jobCreated: (kv: KV) => kv.incrBy(keys.metric("jobs:created"), 1),
  async youcamError(kv: KV, code: string) {
    await kv.sAdd(keys.metric("yerr:codes"), code);
    await kv.incrBy(keys.metric(`yerr:${code}`), 1);
  },
  async latency(kv: KV, kind: JobKind, ms: number) {
    const key = keys.metric(`lat:${kind}`);
    const samples = (await kv.get<number[]>(key)) ?? [];
    samples.push(Math.round(ms));
    await kv.set(key, samples.slice(-LATENCY_SAMPLES));
  },
};

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

export async function readMetrics(kv: KV, balance: number | null): Promise<AdminMetrics> {
  const byKind: Record<string, number> = {};
  for (const k of STEP_KINDS) byKind[k] = (await kv.get<number>(keys.metric(`units:${k}`))) ?? 0;
  const jobsByStatus: Record<string, number> = { created: (await kv.get<number>(keys.metric("jobs:created"))) ?? 0 };
  for (const s of JOB_STATUSES) jobsByStatus[s] = (await kv.get<number>(keys.metric(`jobs:${s}`))) ?? 0;
  const youcamErrors: Record<string, number> = {};
  for (const code of await kv.sMembers(keys.metric("yerr:codes"))) youcamErrors[code] = (await kv.get<number>(keys.metric(`yerr:${code}`))) ?? 0;
  const latencyMs: AdminMetrics["latencyMs"] = {};
  for (const k of JOB_KINDS) {
    const sorted = [...((await kv.get<number[]>(keys.metric(`lat:${k}`))) ?? [])].sort((a, b) => a - b);
    if (sorted.length) latencyMs[k] = { p50: percentile(sorted, 50), p95: percentile(sorted, 95), n: sorted.length };
  }
  return {
    balance,
    unitsSpent: { total: Object.values(byKind).reduce((a, b) => a + b, 0), byKind },
    jobsByStatus,
    youcamErrors,
    latencyMs,
  };
}
