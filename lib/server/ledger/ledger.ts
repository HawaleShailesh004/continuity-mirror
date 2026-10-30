import "server-only";
import type { Env } from "../env";
import { ApiError } from "../http/errors";
import { keys, TTL } from "../keys";
import type { KV } from "../store/kv";

/** Units reserved for one job. Stored on the job so a refund always reverses the same counters. */
export type Reservation = { sessionId: string; ipHash: string; day: string; units: number };

type LedgerCtx = { kv: KV; env: Env; now: () => number };

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function sessionUnitsUsed(ctx: Pick<LedgerCtx, "kv">, sessionId: string): Promise<number> {
  return (await ctx.kv.get<number>(keys.unitsSession(sessionId))) ?? 0;
}

/**
 * Reserve units against the session cap and the per-IP daily cap before any YouCam call.
 * Over either cap → both counters are rolled back and SESSION_BUDGET_EXHAUSTED is thrown.
 */
export async function reserve(ctx: LedgerCtx, sessionId: string, ipHash: string, units: number): Promise<Reservation> {
  const day = utcDay(ctx.now());
  const sessKey = keys.unitsSession(sessionId);
  const ipKey = keys.unitsIp(ipHash, day);
  const sess = await ctx.kv.incrBy(sessKey, units, { ttlMs: TTL.session });
  if (sess > ctx.env.SESSION_UNIT_CAP) {
    await ctx.kv.incrBy(sessKey, -units);
    throw new ApiError("SESSION_BUDGET_EXHAUSTED", { details: { scope: "session", unitsCap: ctx.env.SESSION_UNIT_CAP } });
  }
  const ip = await ctx.kv.incrBy(ipKey, units, { ttlMs: TTL.ipDay });
  if (ip > ctx.env.IP_DAILY_UNIT_CAP) {
    await ctx.kv.incrBy(ipKey, -units);
    await ctx.kv.incrBy(sessKey, -units);
    throw new ApiError("SESSION_BUDGET_EXHAUSTED", { details: { scope: "ip" } });
  }
  return { sessionId, ipHash, day, units };
}

/** Give back units YouCam didn't charge (its errors are free: verified in B0). */
export async function refund(kv: KV, r: Reservation, units: number) {
  if (units <= 0) return;
  await kv.incrBy(keys.unitsSession(r.sessionId), -units);
  await kv.incrBy(keys.unitsIp(r.ipHash, r.day), -units);
}
