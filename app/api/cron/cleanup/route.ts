// Vercel Cron → us (see vercel.json). Not wrapped in route(): no browser session. Vercel sends
// `Authorization: Bearer $CRON_SECRET`; with no secret configured this refuses everyone.
import { createHash, timingSafeEqual } from "node:crypto";
import { serverContext } from "@/lib/server/context";
import { ApiError, errorResponse } from "@/lib/server/http/errors";
import { toErrorBody } from "@/lib/server/http/handler";
import { cleanupShares } from "@/lib/server/shares/service";

export async function GET(request: Request) {
  try {
    const ctx = serverContext();
    const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const secret = ctx.env.CRON_SECRET;
    if (!secret || !given || !timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(secret).digest())) throw new ApiError("UNAUTHORISED");
    return Response.json(await cleanupShares(ctx), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const { body, headers } = toErrorBody(err);
    return errorResponse(body, headers);
  }
}
