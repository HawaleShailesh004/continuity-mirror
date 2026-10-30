import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Env } from "./env";
import { ApiError } from "./http/errors";

/** Bearer ADMIN_TOKEN. With no token configured, admin endpoints refuse everyone. */
export function requireAdmin(request: Request, env: Pick<Env, "ADMIN_TOKEN">) {
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.ADMIN_TOKEN || !given) throw new ApiError("UNAUTHORISED");
  // Compare digests so length differences don't leak through timing.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(env.ADMIN_TOKEN).digest();
  if (!timingSafeEqual(a, b)) throw new ApiError("UNAUTHORISED");
}
