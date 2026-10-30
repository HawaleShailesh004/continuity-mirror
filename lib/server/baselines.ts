import "server-only";
import { BaselineId, type CreateBaselineResponse, type DeleteBaselineResponse } from "@/lib/contracts/api";
import type { HandlerContext } from "./http/handler";
import { ApiError } from "./http/errors";
import { normaliseImage, UPLOAD_MAX_BYTES } from "./images/normalise";
import { deleteJob, sessionJobs } from "./jobs/store";
import { keys, TTL } from "./keys";
import { isLiveEnabled } from "./ledger/breaker";
import { log } from "./log";

export const BASELINE_TTL_MS = TTL.record;

export type StoredBaseline = { id: string; fileId: string; width: number; height: number; createdAt: number };

type Ctx = HandlerContext<Record<string, string>>;

export async function getBaseline(ctx: Pick<Ctx, "kv">, id: string) {
  return ctx.kv.get<StoredBaseline>(keys.baseline(id));
}

async function readImage(request: Request): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > UPLOAD_MAX_BYTES + 64_000) throw new ApiError("PAYLOAD_TOO_LARGE");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("VALIDATION_FAILED", { details: "expected multipart/form-data with an `image` field" });
  }
  const file = form.get("image");
  if (!file || typeof file === "string") throw new ApiError("VALIDATION_FAILED", { details: "missing `image` file" });
  if (file.size > UPLOAD_MAX_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE");
  return new Uint8Array(await file.arrayBuffer());
}

/** Normalise → reuse or upload once to YouCam → remember the file id for 24 h. The bytes are not kept. */
export async function createBaseline(ctx: Ctx): Promise<{ status: 200 | 201; body: CreateBaselineResponse }> {
  if (ctx.mockScenario === "live_disabled" || !(await isLiveEnabled(ctx))) throw new ApiError("LIVE_DISABLED");
  const image = await normaliseImage(await readImage(ctx.request));

  let stored = await getBaseline(ctx, image.baselineId);
  const reused = Boolean(stored);
  if (!stored) {
    const { fileId } = await ctx.youcam.uploadImage(
      image.jpeg,
      { fileName: `${image.baselineId.slice(0, 16)}.jpg`, contentType: "image/jpeg" },
      { mockScenario: ctx.mockScenario },
    );
    stored = { id: image.baselineId, fileId, width: image.width, height: image.height, createdAt: ctx.now() };
    await ctx.kv.set(keys.baseline(stored.id), stored, { ttlMs: BASELINE_TTL_MS });
    log.info("baseline.uploaded", { requestId: ctx.requestId, baseline: stored.id.slice(0, 12), bytes: image.jpeg.byteLength });
  }
  await ctx.kv.sAdd(keys.sessionBaselines(ctx.session.id), stored.id);
  await ctx.kv.expire(keys.sessionBaselines(ctx.session.id), BASELINE_TTL_MS);

  return {
    status: reused ? 200 : 201,
    body: {
      baselineId: stored.id,
      width: image.width,
      height: image.height,
      normalisedImage: `data:image/jpeg;base64,${image.jpeg.toString("base64")}`,
      reused,
      expiresAt: new Date(stored.createdAt + BASELINE_TTL_MS).toISOString(),
    },
  };
}

/** Forget a baseline and this session's jobs for it. Idempotent. YouCam keeps its copy up to 30 days. */
export async function deleteBaseline(ctx: Ctx, id: string): Promise<DeleteBaselineResponse> {
  const parsed = BaselineId.safeParse(id);
  if (!parsed.success) throw new ApiError("VALIDATION_FAILED", { details: "baselineId must be 64 hex chars" });
  for (const job of await sessionJobs(ctx.kv, ctx.session.id)) {
    if (job.baselineId === parsed.data) await deleteJob(ctx.kv, job);
  }
  await ctx.kv.del(keys.baseline(parsed.data));
  await ctx.kv.sRem(keys.sessionBaselines(ctx.session.id), parsed.data);
  return { deleted: true, upstreamRetentionDays: 30 };
}
