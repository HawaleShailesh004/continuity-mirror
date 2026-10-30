import "server-only";
import { z } from "zod";

const flag = (fallback: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === "true" || v === "1"));
const int = (fallback: number) => z.coerce.number().int().nonnegative().default(fallback);

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    YOUCAM_API_BASE: z.url().default("https://yce-api-01.makeupar.com"),
    YOUCAM_API_KEY: z.string().min(1).optional(),
    YOUCAM_MODE: z.enum(["live", "mock", "replay"]).default("mock"),
    YOUCAM_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
    SESSION_SECRET: z.string().min(32).optional(),
    IP_HASH_SALT: z.string().min(8).optional(),
    KV_DRIVER: z.enum(["upstash", "memory"]).default("memory"),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    ADMIN_TOKEN: z.string().min(16).optional(),
    /** Vercel Cron sends this as a Bearer token; /api/cron/* refuse everyone when it is unset. */
    CRON_SECRET: z.string().min(16).optional(),
    LIVE_GENERATION_ENABLED: flag(true),
    UNIT_FLOOR: int(150),
    SESSION_UNIT_CAP: int(24),
    IP_DAILY_UNIT_CAP: int(48),
    CAP_BROWS: flag(true),
    CAP_HEADWEAR: flag(false),
    CAP_SCARF: flag(false),
    CAP_REGROWTH: flag(true),
    /** Share links (P1). On by default locally (memory stores); on Vercel they need explicit setup. */
    CAP_SHARES: flag(false),
    PUBLIC_BASE_URL: z.url().optional(),
    /** Set by Vercel on every deployment ("1"). */
    VERCEL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const need = (key: keyof typeof env, why: string) => {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `required ${why}` });
    };
    if (env.YOUCAM_MODE === "live") need("YOUCAM_API_KEY", "when YOUCAM_MODE=live");
    if (env.KV_DRIVER === "upstash") {
      need("UPSTASH_REDIS_REST_URL", "when KV_DRIVER=upstash");
      need("UPSTASH_REDIS_REST_TOKEN", "when KV_DRIVER=upstash");
    }
    if (env.CAP_SHARES && env.VERCEL) {
      // Face images and votes must survive across serverless instances and be cleaned up.
      need("BLOB_READ_WRITE_TOKEN", "when CAP_SHARES=true on Vercel");
      need("CRON_SECRET", "when CAP_SHARES=true on Vercel");
      if (env.KV_DRIVER !== "upstash") ctx.addIssue({ code: "custom", path: ["KV_DRIVER"], message: "must be upstash when CAP_SHARES=true on Vercel" });
    }
    // Deployed builds must have real secrets. A local `next start` (e2e runs) falls back to dev values.
    if (env.NODE_ENV === "production" && env.VERCEL) {
      need("SESSION_SECRET", "on Vercel");
      need("IP_HASH_SALT", "on Vercel");
    }
  });
export type Env = z.infer<typeof EnvSchema>;

/** Parses an env record. Error messages name variables, never values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // `KEY=` (as copied from .env.example) means unset, not "empty string".
  const cleaned: Record<string, string | undefined> = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ""));
  // The Vercel Upstash integration names its variables KV_REST_API_*; accept them as the same thing.
  cleaned.UPSTASH_REDIS_REST_URL ??= cleaned.KV_REST_API_URL;
  cleaned.UPSTASH_REDIS_REST_TOKEN ??= cleaned.KV_REST_API_TOKEN;
  // Share links work out of the box locally (in-memory stores); a deployment turns them on on purpose.
  if (cleaned.CAP_SHARES === undefined && !cleaned.VERCEL) cleaned.CAP_SHARES = "true";
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return result.data;
}

let cached: Env | undefined;
export function env(): Env {
  return (cached ??= parseEnv(process.env));
}
