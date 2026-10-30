import { requireAdmin } from "@/lib/server/admin";
import { route } from "@/lib/server/http/handler";
import { liveState } from "@/lib/server/ledger/breaker";
import { readMetrics } from "@/lib/server/ledger/metrics";

export const GET = route({ name: "admin.metrics" }, async (ctx) => {
  requireAdmin(ctx.request, ctx.env);
  const { balance } = await liveState(ctx);
  return Response.json(await readMetrics(ctx.kv, balance), { headers: { "cache-control": "no-store" } });
});
