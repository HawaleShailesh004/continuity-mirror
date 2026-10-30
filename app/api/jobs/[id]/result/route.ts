import { route } from "@/lib/server/http/handler";
import { streamResult } from "@/lib/server/jobs/results";

export const GET = route<{ id: string }>({ name: "jobs.result" }, async (ctx) => streamResult(ctx, ctx.params.id));
