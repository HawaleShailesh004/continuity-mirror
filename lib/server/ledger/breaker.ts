import "server-only";
import type { Env } from "../env";
import { keys } from "../keys";
import { log } from "../log";
import type { KV } from "../store/kv";
import type { YouCamAdapter } from "../youcam/adapter";

type BreakerCtx = { kv: KV; env: Env; youcam: YouCamAdapter; now: () => number };

const BALANCE_FRESH_MS = 60_000;

/** Live generation is on unless the env default or the admin kill switch (KV) turns it off. */
export async function isLiveEnabled(ctx: Pick<BreakerCtx, "kv" | "env">): Promise<boolean> {
  return (await ctx.kv.get<boolean>(keys.liveFlag)) ?? ctx.env.LIVE_GENERATION_ENABLED;
}

/** Real YouCam balance, cached 60 s. On a failed refresh the last known value is used (null if none). */
export async function cachedBalance(ctx: BreakerCtx): Promise<number | null> {
  const cached = await ctx.kv.get<{ balance: number; at: number }>(keys.credit);
  if (cached && ctx.now() - cached.at < BALANCE_FRESH_MS) return cached.balance;
  try {
    const balance = await ctx.youcam.getBalance();
    await ctx.kv.set(keys.credit, { balance, at: ctx.now() }, { ttlMs: 3600_000 });
    return balance;
  } catch (err) {
    log.warn("breaker.balance_unavailable", { error: err instanceof Error ? err.message.slice(0, 120) : "unknown" });
    return cached?.balance ?? null;
  }
}

export type LiveState = { live: boolean; reason?: "disabled" | "units_low"; balance: number | null };

/** The global breaker: off when disabled, or when the real balance falls below UNIT_FLOOR (judging reserve). */
export async function liveState(ctx: BreakerCtx): Promise<LiveState> {
  if (!(await isLiveEnabled(ctx))) return { live: false, reason: "disabled", balance: null };
  const balance = await cachedBalance(ctx);
  if (balance !== null && balance < ctx.env.UNIT_FLOOR) return { live: false, reason: "units_low", balance };
  return { live: true, balance };
}
