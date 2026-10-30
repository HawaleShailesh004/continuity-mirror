import { createBaseline } from "@/lib/server/baselines";
import { route } from "@/lib/server/http/handler";
import { RATE_LIMITS } from "@/lib/server/http/ratelimit";

// Node runtime is the default (and `runtime` config is not allowed with cacheComponents); sharp needs it.

export const POST = route({ name: "baselines.create", limits: [RATE_LIMITS.baselineCreate] }, async (ctx) => {
  const { status, body } = await createBaseline(ctx);
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
});
