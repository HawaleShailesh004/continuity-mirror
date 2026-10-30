import { AdminLiveRequest } from "@/lib/contracts/api";
import { requireAdmin } from "@/lib/server/admin";
import { route } from "@/lib/server/http/handler";
import { keys } from "@/lib/server/keys";
import { log } from "@/lib/server/log";

/** Kill switch: overrides LIVE_GENERATION_ENABLED until set again. */
export const POST = route({ name: "admin.live" }, async (ctx) => {
  requireAdmin(ctx.request, ctx.env);
  const { enabled } = AdminLiveRequest.parse(await ctx.request.json().catch(() => undefined));
  await ctx.kv.set(keys.liveFlag, enabled);
  log.warn("admin.live", { requestId: ctx.requestId, enabled });
  return Response.json({ enabled });
});
