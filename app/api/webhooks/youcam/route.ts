// YouCam → us. Not wrapped in route(): no session cookie or browser rate limits for a server caller.
import { serverContext } from "@/lib/server/context";
import { ApiError, errorResponse } from "@/lib/server/http/errors";
import { toErrorBody } from "@/lib/server/http/handler";
import { handleWebhook } from "@/lib/server/jobs/webhook";

export async function POST(request: Request) {
  try {
    const ctx = serverContext();
    const secret = ctx.env.YOUCAM_WEBHOOK_SECRET;
    if (!secret) throw new ApiError("NOT_FOUND");
    const outcome = await handleWebhook(ctx, secret, request);
    if (outcome === "invalid") throw new ApiError("UNAUTHORISED");
    return Response.json({ ok: true, outcome });
  } catch (err) {
    const { body, headers } = toErrorBody(err);
    return errorResponse(body, headers);
  }
}
