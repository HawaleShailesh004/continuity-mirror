import "server-only";
import type { KV } from "../store/kv";

export type RateLimitRule = { name: string; limit: number; windowMs: number };

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterMs: number };

/** Fixed-window counter on the shared KV (works the same on memory and Upstash). */
export async function rateLimit(kv: KV, rule: RateLimitRule, subject: string, now = Date.now()): Promise<RateLimitResult> {
  const window = Math.floor(now / rule.windowMs);
  const count = await kv.incrBy(`rl:${rule.name}:${subject}:${window}`, 1, { ttlMs: rule.windowMs });
  const retryAfterMs = (window + 1) * rule.windowMs - now;
  return { ok: count <= rule.limit, remaining: Math.max(0, rule.limit - count), retryAfterMs: count <= rule.limit ? 0 : retryAfterMs };
}

/**
 * Sliding-window counter: the current window plus the previous one, weighted by how much of it still
 * falls inside the last `windowMs`. Unlike the fixed window above it can't let 2x the limit through
 * around a window boundary, which matters for an upstream limit we must never exceed (YouCam's).
 * A denied attempt does not consume budget. Accurate to within a few calls for evenly spread traffic.
 */
export async function slidingRateLimit(kv: KV, rule: RateLimitRule, subject: string, now = Date.now()): Promise<RateLimitResult> {
  const window = Math.floor(now / rule.windowMs);
  const elapsed = (now % rule.windowMs) / rule.windowMs;
  const previous = (await kv.get<number>(`rl:${rule.name}:${subject}:${window - 1}`)) ?? 0;
  const key = `rl:${rule.name}:${subject}:${window}`;
  const current = await kv.incrBy(key, 1, { ttlMs: rule.windowMs * 2 });
  const estimated = current + previous * (1 - elapsed);
  if (estimated <= rule.limit) return { ok: true, remaining: Math.max(0, Math.floor(rule.limit - estimated)), retryAfterMs: 0 };
  await kv.incrBy(key, -1);
  // The previous window keeps fading: a slot opens in a few seconds at worst, so don't promise a full window.
  return { ok: false, remaining: 0, retryAfterMs: Math.min((window + 1) * rule.windowMs - now, 6000) };
}

// Polling 3 jobs every 2 s is ~90 calls/min, so the general session limit sits above that.
export const RATE_LIMITS = {
  session: { name: "sess", limit: 150, windowMs: 60_000 },
  ip: { name: "ip", limit: 400, windowMs: 60_000 },
  baselineCreate: { name: "baseline", limit: 8, windowMs: 60_000 },
  jobCreate: { name: "job", limit: 10, windowMs: 60_000 },
  shareCreate: { name: "share", limit: 5, windowMs: 3_600_000 },
} satisfies Record<string, RateLimitRule>;
