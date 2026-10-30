import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Anonymous session: a random id in an HMAC-signed cookie. No PII, nothing else in it.
export const SESSION_COOKIE = "cm_sid";
const MAX_AGE_S = 30 * 24 * 3600;
const DEV_SECRET = "dev-only-session-secret-not-for-production";

function sign(id: string, secret: string) {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export function verifySessionCookie(value: string | undefined, secret: string): string | undefined {
  if (!value) return undefined;
  const [id, sig] = value.split(".");
  if (!id || !sig || !/^[A-Za-z0-9_-]{22}$/.test(id)) return undefined;
  const expected = Buffer.from(sign(id, secret));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : undefined;
}

export type Session = { id: string; isNew: boolean; setCookie?: string };

/** Reads the session from the request, or mints a new one (with a Set-Cookie to send back). */
export function getSession(request: Request, secret: string | undefined): Session {
  const key = secret ?? DEV_SECRET;
  const existing = verifySessionCookie(readCookie(request.headers.get("cookie"), SESSION_COOKIE), key);
  if (existing) return { id: existing, isNew: false };
  const id = randomBytes(16).toString("base64url");
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    id,
    isNew: true,
    setCookie: `${SESSION_COOKIE}=${id}.${sign(id, key)}; Path=/; Max-Age=${MAX_AGE_S}; HttpOnly; SameSite=Lax${secure}`,
  };
}
