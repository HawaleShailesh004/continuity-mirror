import { route } from "@/lib/server/http/handler";
import { castVote } from "@/lib/server/shares/service";

export const POST = route<{ token: string }>({ name: "shares.vote" }, async (ctx) =>
  Response.json(await castVote(ctx, ctx.params.token), { status: 201, headers: { "cache-control": "no-store" } }),
);
