// B5: builds the sample people's genuine results by running the REAL stack in live mode: the route
// handlers, the job engine and the live YouCam adapter (in-process, memory KV). Spends units.
//
//   pnpm demo:build -- --dry          print the plan and the unit estimate, spend nothing
//   pnpm demo:build -- --smoke        one 1-unit colour job on Amara: proves the live adapter end to end
//   pnpm demo:build                   everything (resumable: items already in the manifest are skipped)
//   --max-units=N                     hard cap on estimated units for this run (default 125)
//
// Output: public/demo/<persona>/{baseline,<key>}.jpg and public/demo/manifest.json (lib/contracts/demo.ts).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { POST as postBaseline } from "@/app/api/baselines/route";
import { POST as postJob } from "@/app/api/jobs/route";
import { GET as getJobRoute } from "@/app/api/jobs/[id]/route";
import { GET as getResultRoute } from "@/app/api/jobs/[id]/result/route";
import { catalog, closestBrowShape, defaultBrowHex, estimateUnits, brows as browCatalog } from "@/lib/catalog";
import { canonicalJson } from "@/lib/contracts/canonical";
import { DemoManifest, type DemoItem, type DemoPersona } from "@/lib/contracts/demo";
import { JobResponse, JobSpec, type JobSpecInput } from "@/lib/contracts/api";
import { ErrorEnvelope } from "@/lib/contracts/errors";
import { PERSONAS } from "@/lib/contracts/mocks/fixtures";
import { planAlternatives, planRegrowth, planRoutes, toJobSpec } from "@/lib/planner";
import { setServerContext } from "@/lib/server/context";
import sharp from "sharp";
import { setLogSink } from "@/lib/server/log";
import { parseEnv } from "@/lib/server/env";
import { MemoryBlobStore } from "@/lib/server/blob/memory";
import { MemoryKV } from "@/lib/server/store/memory";
import { createAdapter } from "@/lib/server/youcam";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const SMOKE = args.includes("--smoke");
const MAX_UNITS = Number(args.find((a) => a.startsWith("--max-units="))?.split("=")[1] ?? 125);
const CONCURRENCY = 3;
const ORIGIN = "https://demo.local";

/* ------------------------------------------------------------------ config */

// Hair colour for the restore step comes from each persona's snapshot (lib/contracts/mocks/fixtures.ts):
// B0-proven for Amara and Grace. Meera's was corrected after a live experiment: a yellowish sampled hex
// rendered olive, so hue matters more than intensity.
const HAIR_HEX: Record<string, string> = Object.fromEntries(PERSONAS.map((p) => [p.id, p.snapshot.hairHex!]));

const BROWS_NOTE = "Brow previews are subtle on brows that are still there. The Brow Record (your own brows, photographed) is the main feature.";

/** Looked at by eye on 26 Oct: all realistic, identity intact, colour kept. */
const REF_VERDICT = "good" as const;

const COLOUR_JOB: Record<string, { presetId: string; mode: "full" | "ombre" }> = {
  meera: { presetId: "brown-to-caramel", mode: "ombre" }, // also the first live test of ombre
  amara: { presetId: "red", mode: "full" },
  daniel: { presetId: "light-brown", mode: "full" },
  grace: { presetId: "soft-copper", mode: "full" },
};

/**
 * Reference styles to verify in Hair Style custom mode, and on whom. The others are already exercised
 * by the personas' own items (Amara: coily-shoulder, tapered-coils, box-braids, coily-chin; Daniel/Amara: m-coily-crop).
 */
const REF_CHECKS: [personaId: string, styleId: string][] = [
  ["amara", "twa-short"],
  ["amara", "locs-shoulder"],
  ["meera", "curly-chin"],
  ["meera", "curly-shoulder"],
  ["daniel", "m-coily-crop"],
  ["daniel", "m-curly-top"],
];

/* --------------------------------------------------------------------- env */

const fileEnv = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => [m[1]!, m[2]!.replace(/^["']|["']$/g, "")]),
);
const env = parseEnv({
  YOUCAM_API_BASE: fileEnv.YOUCAM_API_BASE,
  YOUCAM_API_KEY: fileEnv.YOUCAM_API_KEY,
  YOUCAM_MODE: "live",
  // Caps are for judges' sessions; this script has its own cap above.
  SESSION_UNIT_CAP: "1000",
  IP_DAILY_UNIT_CAP: "1000",
});
const ctx = { env, kv: new MemoryKV(), blob: new MemoryBlobStore(), youcam: createAdapter(env), now: () => Date.now() };
setServerContext(ctx);
// Per-request info logs are noise here; keep warnings and errors.
setLogSink((line) => {
  if (line.level !== "info") console.log(JSON.stringify(line));
});

/* ----------------------------------------------------------------- helpers */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const publicDir = join(root, "public", "demo");
const manifestPath = join(publicDir, "manifest.json");

type Item = {
  personaId: string;
  key: string;
  kind: DemoItem["kind"];
  routeId?: DemoItem["routeId"];
  label: string;
  spec: JobSpecInput;
  ref?: boolean;
  /** Same style and colour as an earlier item: reuse that genuine result instead of paying for an identical one. */
  cloneOf?: string;
};

function personaPlan(p: (typeof PERSONAS)[number]): { snapshot: DemoPersona["snapshot"]; items: Item[] } {
  const snapshot = { ...p.snapshot, hairHex: HAIR_HEX[p.id] as `#${string}` };
  const own = { source: "own" as const, hex: snapshot.hairHex! };
  const routes = planRoutes(snapshot);
  const items: Item[] = routes.map((r) => ({
    personaId: p.id,
    key: r.routeKey,
    kind: "route",
    routeId: r.routeId,
    label: r.routeKey === "closest" ? "Closest to me" : r.routeKey === "easier" ? "Familiar, easier" : "New chapter",
    spec: toJobSpec(r),
  }));
  // A variant should be a style the person hasn't already been shown in their three routes.
  const shown = new Set(routes.map((r) => r.styleId));
  const alt = planAlternatives(snapshot, routes[0]!).find((id) => !shown.has(id));
  if (alt) items.push({ personaId: p.id, key: "variant-1", kind: "variant", routeId: "closest", label: "A variant of Closest to me", spec: toJobSpec({ routeId: "closest", styleId: alt, colour: own }) });
  const colour = COLOUR_JOB[p.id]!;
  items.push({ personaId: p.id, key: `colour-${colour.presetId}`, kind: "colour", label: `Colour: ${colour.presetId}`, spec: { kind: "colour", colour, attempt: 0 } });
  const shape = closestBrowShape(snapshot.brows);
  items.push({
    personaId: p.id,
    key: "brows",
    kind: "brows",
    label: "Brow recipe preview",
    spec: {
      kind: "brows",
      browShapeId: shape.id,
      curvature: browCatalog.defaults.curvature,
      thickness: 20,
      definition: browCatalog.defaults.definition,
      colourHex: defaultBrowHex(snapshot.brows.darkness) as `#${string}`,
      intensity: 85,
      attempt: 0,
    },
  });
  const sig = (spec: JobSpecInput) => (spec.kind === "route" ? `${spec.styleId}|${canonicalJson(spec.colour)}` : undefined);
  const firstWith = new Map<string, string>();
  for (const it of items) {
    const s = sig(it.spec);
    if (s && !firstWith.has(s)) firstWith.set(s, it.key);
  }
  for (const r of planRegrowth(snapshot)) {
    const spec = toJobSpec(r);
    items.push({ personaId: p.id, key: r.routeKey, kind: "regrowth", routeId: r.routeId, label: `Regrowth ${r.routeKey.replace("regrowth-", "")}`, spec, cloneOf: firstWith.get(sig(spec)!) });
  }
  return { snapshot, items };
}

const specHash = (spec: JobSpecInput) => canonicalJson(JobSpec.parse(spec));
const unitsOf = (spec: JobSpecInput) => estimateUnits(JobSpec.parse(spec), catalog);

/** One browser per persona: its own session cookie and address, so per-session limits don't couple them. */
function client(personaId: string) {
  let cookie: string | undefined;
  const ip = `10.0.${PERSONAS.findIndex((p) => p.id === personaId) + 1}.1`;
  const headers = (extra: Record<string, string> = {}) => ({ "x-forwarded-for": ip, ...(cookie ? { cookie } : {}), ...extra });
  const take = (res: Response) => {
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  };
  const params = <T>(p: T) => ({ params: Promise.resolve(p) });
  return {
    async upload(bytes: Uint8Array) {
      const form = new FormData();
      form.set("image", new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), "baseline.jpg");
      const res = take(await postBaseline(new Request(`${ORIGIN}/api/baselines`, { method: "POST", body: form, headers: headers() })));
      const body = await res.json();
      if (!res.ok) throw new Error(`baseline upload failed: ${JSON.stringify(ErrorEnvelope.parse(body).error)}`);
      return body as { baselineId: string; normalisedImage: string };
    },
    async create(baselineId: string, spec: JobSpecInput) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = take(
          await postJob(new Request(`${ORIGIN}/api/jobs`, { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify({ baselineId, clientRequestId: crypto.randomUUID(), spec }) })),
        );
        const body = await res.json();
        if (res.status === 429) {
          await sleep(Number(res.headers.get("retry-after") ?? 10) * 1000 + 500);
          continue;
        }
        if (!res.ok) return { error: ErrorEnvelope.parse(body).error };
        return { job: JobResponse.parse(body).job };
      }
      throw new Error("job creation kept being rate limited");
    },
    async poll(id: string) {
      const res = take(await getJobRoute(new Request(`${ORIGIN}/api/jobs/${id}`, { headers: headers() }), params({ id })));
      if (!res.ok) throw new Error(`poll failed: ${res.status}`);
      return JobResponse.parse(await res.json()).job;
    },
    async result(id: string) {
      const res = take(await getResultRoute(new Request(`${ORIGIN}/api/jobs/${id}/result`, { headers: headers() }), params({ id })));
      if (!res.ok) throw new Error(`result failed: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

/* -------------------------------------------------------------------- main */

const plans = PERSONAS.map((p) => ({ persona: p, ...personaPlan(p) }));
const refItems: Item[] = REF_CHECKS.map(([personaId, styleId]) => {
  const own = { source: "own" as const, hex: HAIR_HEX[personaId]! as `#${string}` };
  return { personaId, key: `refcheck-${styleId}`, kind: "route", routeId: "custom", label: `Reference check: ${styleId}`, spec: toJobSpec({ routeId: "custom", styleId, colour: own }), ref: true };
});

const allItems = [...plans.flatMap((p) => p.items), ...refItems];
const todoAll = SMOKE ? [{ personaId: "amara", key: "smoke-colour", kind: "colour" as const, label: "Smoke: colour restore", spec: { kind: "colour", colour: { presetId: "black", mode: "full" }, attempt: 0 } as JobSpecInput }] : allItems;

const existing: DemoManifest | undefined = !SMOKE && existsSync(manifestPath) ? DemoManifest.parse(JSON.parse(readFileSync(manifestPath, "utf8"))) : undefined;
const done = new Set<string>();
for (const p of existing?.personas ?? []) for (const i of p.items) if (existsSync(join(root, "public", i.image))) done.add(`${p.id}/${i.key}:${specHash(i.spec)}`);
for (const r of existing?.refChecks ?? []) if (r.image && existsSync(join(root, "public", r.image))) done.add(`${r.personaId}/refcheck-${r.styleId}:*`);
const isDone = (it: Item) => done.has(`${it.personaId}/${it.key}:${specHash(it.spec)}`) || done.has(`${it.personaId}/${it.key}:*`);
const todo = todoAll.filter((it) => !isDone(it) && !it.cloneOf);
const clonesTodo = todoAll.filter((it) => !isDone(it) && it.cloneOf);
const estimate = todo.reduce((sum, it) => sum + unitsOf(it.spec), 0);

console.log(
  `${allItems.length} items planned, ${todoAll.length - todo.length - clonesTodo.length} already done, ${todo.length} to run, ${clonesTodo.length} reuse an identical result, estimated ${estimate} units (cap ${MAX_UNITS}).`,
);
for (const p of plans) {
  const cost = p.items.filter((i) => !isDone(i)).reduce((s, i) => s + unitsOf(i.spec), 0);
  console.log(`  ${p.persona.id.padEnd(7)} ${p.items.map((i) => `${i.key}=${"styleId" in i.spec ? i.spec.styleId : i.spec.kind}`).join(", ")}  → ${cost} units`);
}
console.log(`  reference checks: ${refItems.filter((i) => !isDone(i)).reduce((s, i) => s + unitsOf(i.spec), 0)} units`);
if (DRY) process.exit(0);

/** YouCam returns PNG for colour steps (about 1 MB). Store everything as a real JPEG so file names and sizes tell the truth. */
async function asJpeg(bytes: Uint8Array): Promise<Buffer> {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return Buffer.from(bytes);
  return sharp(bytes).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}
// Fix anything an earlier run saved under a .jpg name that isn't one (idempotent).
if (!SMOKE && existsSync(publicDir)) {
  let fixed = 0;
  for (const dir of readdirSync(publicDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of readdirSync(join(publicDir, dir.name))) {
      const path = join(publicDir, dir.name, file);
      if (!file.endsWith(".jpg")) continue;
      const bytes = readFileSync(path);
      if (bytes[0] === 0xff && bytes[1] === 0xd8) continue;
      writeFileSync(path, await asJpeg(bytes));
      fixed++;
    }
  }
  if (fixed) console.log(`converted ${fixed} mislabelled PNG results to JPEG`);
}
if (estimate > MAX_UNITS) {
  console.error(`estimate ${estimate} exceeds --max-units=${MAX_UNITS}; refusing to spend.`);
  process.exit(1);
}
if (todo.length === 0 && clonesTodo.length === 0) {
  console.log("nothing to do.");
  process.exit(0);
}

const balanceStart = await ctx.youcam.getBalance();
console.log(`balance start: ${balanceStart}`);

// Manifest state, rebuilt from what exists so reruns keep earlier results.
const state: DemoManifest = existing ?? { version: 1, generatedAt: new Date().toISOString(), mode: "live", unitsSpent: 0, personas: [], refChecks: [] };
for (const p of plans) {
  if (!state.personas.some((x) => x.id === p.persona.id)) {
    state.personas.push({ id: p.persona.id, name: p.persona.name, pronouns: p.persona.pronouns, age: p.persona.age, baseline: `/demo/${p.persona.id}/baseline.jpg`, snapshot: p.snapshot, items: [], failures: [] });
  }
}
// Keep the manifest in step with the current plan: fresh snapshots, no items the plan no longer has.
for (const p of plans) {
  const persona = state.personas.find((x) => x.id === p.persona.id)!;
  persona.snapshot = p.snapshot;
  const keys = new Set(p.items.map((i) => i.key));
  persona.items = persona.items.filter((i) => keys.has(i.key));
  persona.failures = persona.failures.filter((f) => keys.has(f.key));
}
const decorate = () => {
  for (const p of state.personas) for (const i of p.items) if (i.kind === "brows") i.note = BROWS_NOTE;
  for (const r of state.refChecks) if (r.image && !r.verdict) r.verdict = REF_VERDICT;
};

const save = () => {
  decorate();
  state.generatedAt = new Date().toISOString();
  if (!SMOKE) writeFileSync(manifestPath, JSON.stringify(state, null, 2) + "\n");
};

const clients = new Map<string, ReturnType<typeof client>>();
const baselines = new Map<string, string>();
async function baselineFor(personaId: string) {
  if (baselines.has(personaId)) return baselines.get(personaId)!;
  const c = (clients.get(personaId) ?? clients.set(personaId, client(personaId)).get(personaId)!);
  const src = new Uint8Array(readFileSync(join(root, "public", "mock", "personas", `${personaId}.jpg`)));
  const { baselineId, normalisedImage } = await c.upload(src);
  mkdirSync(join(publicDir, personaId), { recursive: true });
  writeFileSync(join(publicDir, personaId, "baseline.jpg"), Buffer.from(normalisedImage.split(",")[1]!, "base64"));
  baselines.set(personaId, baselineId);
  return baselineId;
}

let spent = 0;
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

async function runItem(it: Item) {
  const c = clients.get(it.personaId) ?? clients.set(it.personaId, client(it.personaId)).get(it.personaId)!;
  const baselineId = await baselineFor(it.personaId);
  const started = Date.now();
  const created = await c.create(baselineId, it.spec);
  const persona = state.personas.find((p) => p.id === it.personaId)!;
  const fail = (error: NonNullable<typeof created.error>) => {
    log(`✗ ${it.personaId}/${it.key}: ${error.code} ${error.youcamCode ?? ""}`);
    if (it.ref) {
      state.refChecks = state.refChecks.filter((r) => !(r.personaId === it.personaId && `refcheck-${r.styleId}` === it.key));
      state.refChecks.push({ styleId: (it.spec as { styleId: string }).styleId, personaId: persona.id, error, units: 0, createdAt: new Date().toISOString() });
    } else {
      persona.failures = persona.failures.filter((f) => f.key !== it.key);
      persona.failures.push({ key: it.key, kind: it.kind, label: it.label, spec: JobSpec.parse(it.spec), error, createdAt: new Date().toISOString() });
    }
    save();
  };
  if (created.error) return fail(created.error);
  let job = created.job!;
  const deadline = Date.now() + 5 * 60_000;
  while (job.status !== "succeeded" && job.status !== "failed" && Date.now() < deadline) {
    await sleep(Math.max(job.retryAfterMs, 3500));
    job = await c.poll(job.id);
  }
  if (job.status !== "succeeded") return fail(job.error ?? { code: "YOUCAM_TIMEOUT", messageKey: "generic.timeout", retryable: true });

  const bytes = await c.result(job.id);
  const rel = `/demo/${it.personaId}/${it.ref ? it.key : it.key}.jpg`;
  writeFileSync(join(root, "public", rel), await asJpeg(bytes));
  const units = job.steps.reduce((s, x) => s + x.units, 0);
  spent += units;
  const seconds = (Date.now() - started) / 1000;
  if (it.ref) {
    state.refChecks = state.refChecks.filter((r) => !(r.personaId === it.personaId && `refcheck-${r.styleId}` === it.key));
    state.refChecks.push({ styleId: (it.spec as { styleId: string }).styleId, personaId: persona.id as DemoPersona["id"], image: rel, units, createdAt: new Date().toISOString() });
  } else {
    persona.items = persona.items.filter((i) => i.key !== it.key);
    persona.failures = persona.failures.filter((f) => f.key !== it.key);
    persona.items.push({ key: it.key, kind: it.kind, ...(it.routeId ? { routeId: it.routeId } : {}), label: it.label, spec: job.spec, image: rel, units, seconds, jobId: job.id, provenance: job.provenance, createdAt: new Date().toISOString() });
  }
  log(`✓ ${it.personaId}/${it.key} ${units}u ${seconds.toFixed(0)}s (spent so far ${spent})`);
  save();
}

// Small worker pool; units are checked against the cap before each start.
let committed = 0;
const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      const cost = unitsOf(it.spec);
      if (committed + cost > MAX_UNITS) {
        log(`cap reached, skipping ${it.personaId}/${it.key}`);
        continue;
      }
      committed += cost;
      try {
        await runItem(it);
      } catch (err) {
        log(`! ${it.personaId}/${it.key}: ${err instanceof Error ? err.message.slice(0, 160) : "error"}`);
      }
    }
  }),
);

// Identical style + colour to an earlier result: reuse that genuine image under the new key (0 units).
for (const it of clonesTodo) {
  const persona = state.personas.find((p) => p.id === it.personaId)!;
  const source = persona.items.find((i) => i.key === it.cloneOf);
  if (!source) {
    log(`! ${it.personaId}/${it.key}: source ${it.cloneOf} missing, cannot reuse`);
    continue;
  }
  const rel = `/demo/${it.personaId}/${it.key}.jpg`;
  copyFileSync(join(root, "public", source.image), join(root, "public", rel));
  persona.items = persona.items.filter((i) => i.key !== it.key);
  persona.items.push({
    ...source,
    key: it.key,
    kind: it.kind,
    ...(it.routeId ? { routeId: it.routeId } : {}),
    label: it.label,
    spec: JobSpec.parse(it.spec),
    image: rel,
    units: 0,
    note: `Same style and colour as "${source.label}", so this is the same result.`,
  });
  log(`= ${it.personaId}/${it.key} reuses ${it.cloneOf} (0u)`);
}

const balanceEnd = await ctx.youcam.getBalance();
state.unitsSpent += balanceStart - balanceEnd;
save();
console.log(`balance end: ${balanceEnd} (spent ${balanceStart - balanceEnd}, counted ${spent}).`);
