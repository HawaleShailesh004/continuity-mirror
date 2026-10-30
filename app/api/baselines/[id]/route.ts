import { deleteBaseline } from "@/lib/server/baselines";
import { route } from "@/lib/server/http/handler";

export const DELETE = route<{ id: string }>({ name: "baselines.delete" }, async (ctx) => {
  return Response.json(await deleteBaseline(ctx, ctx.params.id), { headers: { "cache-control": "no-store" } });
});
