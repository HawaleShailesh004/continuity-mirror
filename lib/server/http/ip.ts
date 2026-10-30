import "server-only";
import { createHash } from "node:crypto";

/** Client IP as Vercel reports it. Used only for hashing, never stored or logged raw. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function hashIp(ip: string, salt: string | undefined): string {
  return createHash("sha256")
    .update(`${salt ?? "dev-salt"}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}
