import { route } from "@/lib/server/http/handler";
import { getStatus } from "@/lib/server/status";

export const GET = route({ name: "status" }, async (ctx) => Response.json(await getStatus(ctx), { headers: { "cache-control": "no-store" } }));
