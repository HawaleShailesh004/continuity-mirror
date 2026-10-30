import "server-only";
import type { ServerContext } from "../context";
import { ApiError } from "../http/errors";
import { YouCamHttpError } from "../youcam/adapter";
import { RESULT_TTL_MS } from "./engine";
import { getJob } from "./store";

/**
 * GET /api/jobs/:id/result: stream the final image straight from YouCam to the client.
 * Nothing is written on our side; the client saves it on the device.
 */
export async function streamResult(ctx: Pick<ServerContext, "kv" | "now" | "youcam">, id: string): Promise<Response> {
  const job = await getJob(ctx.kv, id);
  if (!job || job.status === "failed") throw new ApiError("NOT_FOUND", job ? { details: "job failed; there is no result" } : {});
  if (job.status !== "succeeded" || !job.resultAt) throw new ApiError("NOT_READY");
  if (job.mockScenario === "expired" || ctx.now() - job.resultAt > RESULT_TTL_MS) throw new ApiError("EXPIRED");
  const url = job.steps.at(-1)?.resultUrl;
  if (!url) throw new ApiError("INTERNAL");

  try {
    const { body, contentType } = await ctx.youcam.fetchResult(url);
    return new Response(body as BodyInit, {
      headers: { "content-type": contentType, "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  } catch (err) {
    // The signed URL expiring early shows up as 403/404 from storage.
    if (err instanceof YouCamHttpError && (err.httpStatus === 403 || err.httpStatus === 404)) throw new ApiError("EXPIRED");
    throw err;
  }
}
