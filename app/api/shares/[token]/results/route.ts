import { route } from "@/lib/server/http/handler";
import { getResults } from "@/lib/server/shares/service";

export const GET = route<{ token: string }>({ name: "shares.results" }, async (ctx) =>
  Response.json(await getResults(ctx, ctx.params.token), { headers: { "cache-control": "no-store" } }),
);
