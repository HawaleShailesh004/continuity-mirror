// Copies raw B0 spike responses (spike-output/, gitignored) into tests/fixtures/youcam/ with secrets
// and account-specific ids replaced by stable placeholders. Shapes are kept exactly.
// Usage: pnpm fixtures:scrub   (re-runnable; overwrites the fixture folder)
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = (...p) => join(root, "spike-output", ...p);
const dest = (...p) => join(root, "tests", "fixtures", "youcam", ...p);

const ID_KEYS = new Set(["file_id", "src_file_id", "ref_file_id", "task_id", "id"]);

function scrubber() {
  const ids = new Map();
  let urls = 0;
  const idFor = (kind, value) => {
    const key = `${kind}:${value}`;
    if (!ids.has(key)) ids.set(key, `fixture-${kind}-${ids.size + 1}`);
    return ids.get(key);
  };
  const walk = (value, key) => {
    if (Array.isArray(value)) return value.map((v) => walk(v, key));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    }
    if (typeof value === "string") {
      if (/X-Amz-|amazonaws\.com/.test(value)) return `https://fixtures.invalid/signed/${++urls}.jpg`;
      if (key === "task_id") return idFor("task", value);
      if (ID_KEYS.has(key) && value.length >= 32) return idFor("file", value);
    }
    if (key === "id" && typeof value === "number") return 1; // credit wallet id
    return value;
  };
  return (value) => walk(value, undefined);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function emit(group, name, sourcePath, data) {
  await mkdir(dest(group), { recursive: true });
  const body = { source: sourcePath.replace(root, "").replace(/\\/g, "/").replace(/^\//, ""), recordedAt: "2026-10-26", data: scrubber()(data) };
  const text = JSON.stringify(body, null, 2) + "\n";
  if (/amazonaws|X-Amz-|Bearer /i.test(text)) throw new Error(`scrub failed for ${group}/${name}`);
  await writeFile(dest(group, `${name}.json`), text);
  return `${group}/${name}`;
}

const groupFor = (name) => {
  if (name.startsWith("colour-")) return "hair-color";
  if (name.startsWith("brows-")) return "makeup-vto";
  if (name.startsWith("hat-")) return "hat";
  if (name.startsWith("scarf-")) return "scarf";
  return "hair-transfer";
};

await rm(dest(), { recursive: true, force: true });
const written = [];
written.push(await emit("account", "credit", src("credit-before.json"), await readJson(src("credit-before.json"))));
written.push(await emit("account", "feature-cost", src("feature-cost.json"), await readJson(src("feature-cost.json"))));
// Public static catalog (no ids or secrets): kept as-is so the brows catalog can be checked against it in CI.
written.push(await emit("catalogs", "eyebrows", src("openapi", "eyebrows.json"), await readJson(src("openapi", "eyebrows.json"))));
for (let i = 0; i < 6; i++) {
  const p = src(`templates-page-${i}.json`);
  written.push(await emit("templates", `page-${i}`, p, await readJson(p)));
}
for (const stage of ["stage1", "stage2"]) {
  for (const f of await readdir(src(stage))) {
    if (!f.endsWith(".json") || f === "summary.json") continue;
    const name = basename(f, ".json");
    written.push(await emit(groupFor(name), name, src(stage, f), await readJson(src(stage, f))));
  }
}
written.push(await emit("hair-transfer", "custom-coily-chin", src("stage3", "log.json"), await readJson(src("stage3", "log.json"))));
for (const f of await readdir(src())) {
  if (!/^gen-.*\.json$/.test(f)) continue;
  written.push(await emit("text-to-image", basename(f, ".json").replace(/^gen-/, ""), src(f), await readJson(src(f))));
}
console.log(`wrote ${written.length} fixtures:\n  ${written.join("\n  ")}`);
