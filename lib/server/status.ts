import "server-only";
import type { PrivacyReceipt, StatusResponse } from "@/lib/contracts/api";
import { getBaseline } from "./baselines";
import type { HandlerContext } from "./http/handler";
import { UPLOAD_MAX_BYTES, MIN_SHORT_SIDE } from "./images/normalise";
import { sessionJobs } from "./jobs/store";
import { keys, TTL } from "./keys";
import { liveState } from "./ledger/breaker";
import { sessionUnitsUsed } from "./ledger/ledger";
import { sessionShares } from "./shares/service";

type Ctx = HandlerContext<Record<string, string>>;

export const version = () => process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

export async function getStatus(ctx: Ctx): Promise<StatusResponse> {
  const state = ctx.mockScenario === "live_disabled" ? { live: false, reason: "disabled" as const } : await liveState(ctx);
  const cap = ctx.env.SESSION_UNIT_CAP;
  const used = ctx.mockScenario === "budget_exhausted" ? cap : await sessionUnitsUsed(ctx, ctx.session.id);
  return {
    live: state.live,
    ...(state.reason ? { reason: state.reason } : {}),
    mode: ctx.youcam.mode,
    session: { unitsUsed: Math.min(used, cap), unitsCap: cap },
    capabilities: {
      hairStyle: true,
      hairColour: true,
      brows: ctx.env.CAP_BROWS,
      headwear: ctx.env.CAP_HEADWEAR,
      scarf: ctx.env.CAP_SCARF,
      regrowth: ctx.env.CAP_REGROWTH,
      shares: ctx.env.CAP_SHARES,
    },
    limits: { uploadMaxBytes: UPLOAD_MAX_BYTES, uploadMaxLongSide: 1600, uploadMinShortSide: MIN_SHORT_SIDE },
    version: version(),
    serverTime: new Date(ctx.now()).toISOString(),
  };
}

/** Exactly what our server holds for this session. No images: there are none to list. */
export async function getReceipt(ctx: Ctx): Promise<PrivacyReceipt> {
  const iso = (ms: number) => new Date(ms).toISOString();
  const baselineIds = await ctx.kv.sMembers(keys.sessionBaselines(ctx.session.id));
  const baselines = (await Promise.all(baselineIds.map((id) => getBaseline(ctx, id)))).filter((b) => b !== null);
  const jobs = await sessionJobs(ctx.kv, ctx.session.id);
  const shares = await sessionShares(ctx, ctx.session.id);
  return {
    baselines: baselines.map((b) => ({ baselineId: b.id, youcamFileId: b.fileId, createdAt: iso(b.createdAt), expiresAt: iso(b.createdAt + TTL.record) })),
    jobs: jobs.map((j) => ({
      id: j.id,
      baselineId: j.baselineId,
      kind: j.spec.kind,
      endpoints: j.steps.map((s) => s.endpoint),
      youcamTaskIds: j.steps.flatMap((s) => (s.youcamTaskId ? [s.youcamTaskId] : [])),
      createdAt: iso(j.createdAt),
      expiresAt: iso(j.createdAt + TTL.record),
    })),
    shares: shares.map((s) => ({ tokenPrefix: s.token.slice(0, 6), itemCount: s.items.length, expiresAt: iso(s.expiresAt) })),
    serverStoresImages: shares.length > 0,
    upstream: { provider: "Perfect Corp YouCam API", retentionDays: 30 },
  };
}
