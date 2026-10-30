import { route } from "@/lib/server/http/handler";
import { getManifest, revokeShare } from "@/lib/server/shares/service";

export const GET = route<{ token: string }>({ name: "shares.get" }, async (ctx) =>
  Response.json(await getManifest(ctx, ctx.params.token), { headers: { "cache-control": "no-store" } }),
);

export const DELETE = route<{ token: string }>({ name: "shares.revoke" }, async (ctx) =>
  Response.json(await revokeShare(ctx, ctx.params.token), { headers: { "cache-control": "no-store" } }),
);
