import { route } from "@/lib/server/http/handler";
import { pollJob } from "@/lib/server/jobs/engine";

export const GET = route<{ id: string }>({ name: "jobs.get" }, async (ctx) =>
  Response.json({ job: await pollJob(ctx, ctx.params.id) }, { headers: { "cache-control": "no-store" } }),
);
