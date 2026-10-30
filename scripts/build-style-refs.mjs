// Generates textured-hair style references with YouCam Image Generator V2.0 (1 unit each) into
// public/catalog/refs/ and records them in lib/catalog/style-refs.json (merged by build-style-catalog.mjs).
// Idempotent: skips references whose image already exists. Logs every unit. Hard cap: MAX_UNITS.
// Usage: node scripts/build-style-refs.mjs [--dry]
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const DRY = process.argv.includes("--dry");
const MAX_UNITS = 12;

const env = Object.fromEntries(
  (await readFile(join(root, ".env.local"), "utf8"))
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const base = env.YOUCAM_API_BASE.replace(/\/$/, "");
const auth = { Authorization: `Bearer ${env.YOUCAM_API_KEY}` }; // never printed
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  const res = await fetch(base + path, { method, headers: body ? { ...auth, "Content-Type": "application/json" } : auth, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}
const balance = async () => ((await api("GET", "/s2s/v1.0/client/credit")).body?.results ?? []).reduce((s, x) => s + (x.amount ?? 0), 0);

const FRAME =
  "Front-facing, looking at the camera, head level, framed from above the head to mid-chest, both shoulders visible. " +
  "Plain light grey studio background, soft even frontal light, plain crew-neck top. Hair fully visible.";
const NEGATIVE =
  "wig, hat, scarf, headband, glasses, earrings, jewellery, hands, multiple people, cropped head, side profile, text, watermark, blur, cartoon, loose waves, straight hair";

// id, label, audience, length, texture, care, price, caps, comfort, askFor, subject prompt
const REFS = [
  ["twa-short", "Short coils (TWA)", "female", "short", "coily", 1, "low", "mono", "hot", "Teeny weeny afro: very short natural 4C coils, even shape, about 2.5 cm", "Black woman with a very short teeny-weeny-afro haircut of tightly defined type 4C coily hair, about 2.5 cm long, even rounded shape, natural black colour"],
  ["tapered-coils", "Tapered coils", "female", "short", "coily", 1, "low", "mono", "hot", "Short tapered coily cut, ear length, shaped sides", "Black woman with a short tapered natural haircut of type 4C coily hair, shaped sides, a little longer on top, ear length, natural black colour"],
  ["coily-shoulder", "Shoulder-length coils", "female", "shoulder", "coily", 3, "high", "lace", "volume", "Shoulder-length type 4C coily unit, full density", "Black woman with shoulder-length natural type 4C coily hair, dense defined coils, rounded full shape, natural black colour"],
  ["curly-chin", "Curly bob (3C)", "female", "chin", "curly", 2, "mid", "mono", "light", "Chin-length type 3C curly bob, defined curls", "woman with a chin-length curly bob of defined type 3C curls, natural dark brown colour, soft rounded shape"],
  ["curly-shoulder", "Shoulder-length curls (3B)", "female", "shoulder", "curly", 3, "high", "lace", "volume", "Shoulder-length type 3B curls, defined, medium density", "woman with shoulder-length defined type 3B curls, natural dark brown colour, medium density, centre parting"],
  ["locs-shoulder", "Locs, shoulder length", "female", "shoulder", "coily", 1, "high", "lace", "volume", "Shoulder-length locs, medium thickness", "Black woman with shoulder-length locs of medium thickness, natural black colour, neat roots"],
  ["box-braids-shoulder", "Box braids", "female", "shoulder", "coily", 1, "mid", "lace", "volume", "Shoulder-length box braids, medium size", "Black woman with shoulder-length medium box braids, natural black colour, neat parts"],
  ["m-coily-crop", "Coily crop", "male", "short", "coily", 1, "low", "topper", "tender", "Short coily crop with tapered sides", "Black man with a short natural coily crop of type 4C hair on top, low tapered sides, natural black colour, light stubble"],
  ["m-curly-top", "Curly top", "male", "short", "curly", 2, "mid", "topper", "tender", "Short curly top with faded sides", "man with a short curly top of defined 3B curls, faded sides, natural dark brown colour"],
];

const refsJson = join(root, "lib/catalog/style-refs.json");
const existing = existsSync(refsJson) ? JSON.parse(await readFile(refsJson, "utf8")) : [];
const have = new Set(existing.map((s) => s.id));
const todo = REFS.filter(([id]) => !have.has(id) || !existsSync(join(root, "public/catalog/refs", `${id}.jpg`)));
console.log(`${todo.length} to generate, ${REFS.length - todo.length} already present; cap ${MAX_UNITS} units${DRY ? " (dry run)" : ""}`);
if (DRY || todo.length === 0) process.exit(0);

await mkdir(join(root, "public/catalog/refs"), { recursive: true });
const start = await balance();
console.log(`balance start: ${start}`);
let spent = 0;
const FIBRES = { coily: ["kinky-curly synthetic", "human hair"], curly: ["curl-set synthetic", "human hair"] };
const CAPS = { mono: ["monofilament top"], lace: ["lace front", "monofilament top"], topper: ["hair system / topper"] };
const COMFORT = {
  light: ["lightweight cap", "adjustable straps"],
  hot: ["breathable cap, cooler in hot weather"],
  tender: ["soft lining for a tender scalp", "adjustable straps"],
  volume: ["more hair volume means more warmth: ask about a ventilated cap"],
};

for (const [id, label, audience, length, texture, care, price, caps, comfort, askFor, subject] of todo) {
  if (spent >= MAX_UNITS) {
    console.log(`unit cap ${MAX_UNITS} reached, stopping before ${id}`);
    break;
  }
  const create = await api("POST", "/s2s/v2.0/task/text-to-image/youcam", {
    model: "youcam-image-v2",
    size: "1104*1472",
    prompt_extend: false,
    prompt: `Photorealistic portrait photograph of a ${subject}. ${FRAME}`,
    negative_prompt: NEGATIVE,
  });
  spent += 1; // counted up front: a retry after a failure still counts against the cap
  const taskId = create.body?.data?.task_id;
  if (!taskId) {
    console.log(`${id}: create failed (${create.status}) ${JSON.stringify(create.body).slice(0, 200)}`);
    continue;
  }
  let url;
  for (let i = 0; i < 40 && !url; i++) {
    await sleep(4000);
    const poll = await api("GET", `/s2s/v2.0/task/text-to-image/youcam/${taskId}`);
    const st = poll.body?.data?.task_status;
    if (st === "error") {
      console.log(`${id}: error ${poll.body?.data?.error}`);
      break;
    }
    if (st === "success") url = poll.body.data.results?.url ?? poll.body.data.results?.[0]?.url ?? poll.body.data.results?.[0];
  }
  if (!url) continue;
  await writeFile(join(root, "public/catalog/refs", `${id}.jpg`), Buffer.from(await (await fetch(url)).arrayBuffer()));
  existing.push({
    id,
    label,
    style: { source: "reference", refPath: `/catalog/refs/${id}.jpg` },
    thumbnail: `/catalog/refs/${id}.jpg`,
    audience,
    length,
    fringe: false,
    parting: "none",
    texture,
    careEffort: care,
    askFor,
    wigNotes: { fibres: FIBRES[texture], caps: CAPS[caps], comfort: COMFORT[comfort] },
    priceBand: price,
    protective: /locs|braids/.test(id),
    reviewed: false,
  });
  await writeFile(refsJson, JSON.stringify(existing, null, 2) + "\n");
  console.log(`${id}: ok (units so far: ${spent})`);
}

const end = await balance();
console.log(`balance end: ${end} (spent ${start - end}, counted ${spent})`);
