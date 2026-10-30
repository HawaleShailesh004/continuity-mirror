import { route } from "@/lib/server/http/handler";
import { getShareImage } from "@/lib/server/shares/service";

export const GET = route<{ token: string; key: string }>({ name: "shares.image" }, async (ctx) => getShareImage(ctx, ctx.params.token, ctx.params.key));
