import { route } from "@/lib/server/http/handler";
import { RATE_LIMITS } from "@/lib/server/http/ratelimit";
import { createJob } from "@/lib/server/jobs/engine";

export const POST = route({ name: "jobs.create", limits: [RATE_LIMITS.jobCreate] }, async (ctx) => {
  const { status, job } = await createJob(ctx);
  return Response.json({ job }, { status, headers: { "cache-control": "no-store" } });
});
