import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ServerContext } from "../context";
import { keys, TTL } from "../keys";
import { log } from "../log";
import { advance } from "./engine";
import { getJob, saveJob } from "./store";

const TOLERANCE_S = 5 * 60;

/** Standard Webhooks: base64(HMAC-SHA256(key, `${id}.${timestamp}.${body}`)), header "v1,<sig> v1,<sig>…". */
export function verifyStandardWebhook(secret: string, headers: Headers, body: string, nowMs: number): boolean {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader || !/^\d+$/.test(ts)) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = Buffer.from(createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64"));
  return sigHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    const given = Buffer.from(sig ?? "");
    return version === "v1" && given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** The payload shape isn't documented, so we look for a task id in the usual places. */
function taskIdOf(payload: unknown): string | undefined {
  const p = payload as { task_id?: unknown; data?: { task_id?: unknown; id?: unknown } } | null;
  const id = p?.data?.task_id ?? p?.task_id ?? p?.data?.id;
  return typeof id === "string" ? id : undefined;
}

/** Field NAMES only, two levels deep, never values: enough to learn the payload shape from logs without leaking data. */
export function payloadShape(payload: unknown): Record<string, string[]> {
  const names = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v as object).slice(0, 30) : []);
  const top = payload as Record<string, unknown> | null;
  const out: Record<string, string[]> = { "": names(top) };
  for (const k of out[""]!) if (names(top?.[k]).length) out[k] = names(top?.[k]);
  return out;
}

export type WebhookOutcome = "invalid" | "duplicate" | "ignored" | "advanced" | "busy";

/**
 * POST /api/webhooks/youcam. A verified webhook is a nudge: we don't trust its body beyond the task id,
 * and advance the job by asking YouCam (same code path and lock as polling).
 */
export async function handleWebhook(ctx: ServerContext, secret: string, request: Request): Promise<WebhookOutcome> {
  const body = await request.text();
  if (!verifyStandardWebhook(secret, request.headers, body, ctx.now())) return "invalid";
  if (!(await ctx.kv.setNX(keys.webhook(request.headers.get("webhook-id")!), 1, TTL.record))) return "duplicate";

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    log.warn("webhook.not_json", { bytes: body.length });
    return "ignored";
  }
  const taskId = taskIdOf(payload);
  // The payload shape has never been seen (docs/YOUCAM_FACTS.md "Still to verify"): record its field names.
  if (!taskId) log.warn("webhook.unrecognised", { shape: JSON.stringify(payloadShape(payload)).slice(0, 400) });
  const jobId = taskId ? await ctx.kv.get<string>(keys.task(taskId)) : null;
  const job = jobId ? await getJob(ctx.kv, jobId) : null;
  if (!job) return "ignored";

  if (!(await ctx.kv.setNX(keys.jobLock(job.id), 1, 5000))) return "busy"; // a poll is advancing it right now
  try {
    await advance(ctx, job);
    job.lastCheckedAt = ctx.now();
    await saveJob(ctx.kv, job, ctx.now());
    log.info("webhook.advanced", { job: job.id, status: job.status });
    return "advanced";
  } finally {
    await ctx.kv.del(keys.jobLock(job.id));
  }
}
