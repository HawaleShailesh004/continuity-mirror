import { route } from "@/lib/server/http/handler";
import { getReceipt } from "@/lib/server/status";

export const GET = route({ name: "privacy.receipt" }, async (ctx) => Response.json(await getReceipt(ctx), { headers: { "cache-control": "no-store" } }));
