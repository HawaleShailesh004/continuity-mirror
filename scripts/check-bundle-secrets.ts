// Fails if anything secret, or any direct YouCam call, ends up in the client bundle (.next/static).
// Run after `pnpm build`. Never prints secret values, only where a match was found.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const staticDir = join(root, ".next", "static");
if (!existsSync(staticDir)) {
  console.error("check-bundle-secrets: .next/static not found; run `pnpm build` first");
  process.exit(1);
}

function envFileValues(): Record<string, string> {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter((m): m is RegExpMatchArray => Boolean(m))
      .map((m) => [m[1]!, m[2]!.replace(/^["']|["']$/g, "")]),
  );
}

const SECRET_VARS = ["YOUCAM_API_KEY", "YOUCAM_SECRET_KEY", "YOUCAM_WEBHOOK_SECRET", "SESSION_SECRET", "IP_HASH_SALT", "ADMIN_TOKEN", "UPSTASH_REDIS_REST_TOKEN", "BLOB_READ_WRITE_TOKEN"];
const fromFile = envFileValues();
const secretValues = SECRET_VARS.map((name) => ({ name, value: process.env[name] ?? fromFile[name] })).filter(
  (s): s is { name: string; value: string } => typeof s.value === "string" && s.value.length >= 12,
);

const patterns: { label: string; test: (text: string) => boolean }[] = [
  ...SECRET_VARS.map((name) => ({ label: `env var name ${name}`, test: (t: string) => t.includes(name) })),
  ...secretValues.map((s) => ({ label: `value of ${s.name}`, test: (t: string) => t.includes(s.value) })),
  { label: "YouCam API host", test: (t) => /makeupar\.com\/s2s/.test(t) },
  { label: "webhook secret prefix", test: (t) => t.includes("whsec_") },
];

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|mjs|css|json|html|txt|map)$/.test(name)) yield path;
  }
}

const hits: string[] = [];
let scanned = 0;
for (const file of files(staticDir)) {
  scanned++;
  const text = readFileSync(file, "utf8");
  for (const p of patterns) if (p.test(text)) hits.push(`${relative(root, file)}: ${p.label}`);
}

if (hits.length) {
  console.error(`check-bundle-secrets: FOUND in client bundle\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-bundle-secrets: clean (${scanned} files, ${secretValues.length} secret values checked)`);
