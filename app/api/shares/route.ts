import { route } from "@/lib/server/http/handler";
import { RATE_LIMITS } from "@/lib/server/http/ratelimit";
import { createShare } from "@/lib/server/shares/service";

export const POST = route({ name: "shares.create", limits: [RATE_LIMITS.shareCreate] }, async (ctx) =>
  Response.json(await createShare(ctx), { status: 201, headers: { "cache-control": "no-store" } }),
);
