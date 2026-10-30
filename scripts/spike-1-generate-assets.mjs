// B0 asset generation: AI personas + headwear refs via YouCam Image Generator V2.0 (1 unit each).
// Usage: node scripts/spike-1-generate-assets.mjs [id ...]   (no ids = all; existing files are skipped)
// Output: spike-assets/<id>.jpg plus spike-output/gen-<id>.json (raw responses). Never prints the API key.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const assetDir = join(root, 'spike-assets');
const outDir = join(root, 'spike-output');

const env = Object.fromEntries(
  (await readFile(join(root, '.env.local'), 'utf8'))
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const base = env.YOUCAM_API_BASE.replace(/\/$/, '');
const auth = { Authorization: `Bearer ${env.YOUCAM_API_KEY}` };

const portrait =
  'Photorealistic portrait photograph. Front-facing, looking straight at the camera, head level. ' +
  'Framed from above the top of the head down to mid-chest, both shoulders fully visible in frame. ' +
  'Plain light grey studio background, soft even frontal lighting, neutral relaxed expression, ' +
  'natural skin texture, sharp focus, plain crew-neck top. Hair fully visible and not covered.';
const portraitNegative =
  'hat, cap, glasses, sunglasses, hands, multiple people, cropped head, cropped shoulders, side profile, ' +
  'tilted head, heavy makeup, hair covering face, text, watermark, logo, blur, low resolution, ' +
  'distorted face, extra limbs, cartoon, illustration, painting, 3d render';
const product =
  'Single product only, centered, isolated on a plain white background, studio product photography, ' +
  'soft shadow, the product fills most of the frame, high detail, no person, no mannequin.';
const productNegative =
  'person, face, mannequin, multiple items, text, logo, watermark, busy background, blur, low resolution';

const jobs = [
  { id: 'persona-a-meera', size: '1104*1472', negative: portraitNegative,
    prompt: `A 40-year-old Indian woman with shoulder-length straight dark brown hair, side part, full natural eyebrows. ${portrait}` },
  { id: 'persona-b-amara', size: '1104*1472', negative: portraitNegative,
    prompt: `A 32-year-old Black woman with shoulder-length natural coily type 4 hair, defined curls, full natural eyebrows. ${portrait}` },
  { id: 'persona-c-daniel', size: '1104*1472', negative: portraitNegative,
    prompt: `A 30-year-old Latino man with medium-length wavy dark brown hair reaching his ears, and a short neat full beard. ${portrait}` },
  { id: 'persona-d-grace', size: '1104*1472', negative: portraitNegative,
    prompt: `A 60-year-old white woman with a natural grey chin-length bob haircut, soft fringe-free style, light natural eyebrows. ${portrait}` },
  { id: 'headwear-beanie', size: '1328*1328', negative: productNegative,
    prompt: `Product photo of a soft heather-grey knitted beanie hat. ${product}` },
  { id: 'headwear-cap', size: '1328*1328', negative: productNegative,
    prompt: `Product photo of a plain navy blue cotton baseball cap, three-quarter view. ${product}` },
  { id: 'headwear-sunhat', size: '1328*1328', negative: productNegative,
    prompt: `Product photo of a soft beige cotton bucket sun hat with a wide brim. ${product}` },
  { id: 'headwrap-turban', size: '1328*1328', negative: productNegative,
    prompt: `Product photo of a pre-tied soft jersey turban head wrap in terracotta colour, the kind worn to cover the whole head. ${product}` },
];

const wanted = process.argv.slice(2);
const queue = wanted.length ? jobs.filter((j) => wanted.includes(j.id)) : jobs;

await mkdir(assetDir, { recursive: true });
await mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true, () => false);

async function credit() {
  const r = await fetch(`${base}/s2s/v1.0/client/credit`, { headers: auth });
  const b = await r.json();
  return (b.results ?? []).reduce((s, x) => s + (x.amount ?? 0), 0);
}

function findUrl(data) {
  const r = data?.results;
  if (typeof r?.url === 'string') return r.url;
  if (Array.isArray(r)) return r.map((x) => x?.url ?? x).find((u) => typeof u === 'string');
  if (Array.isArray(r?.urls)) return r.urls[0];
  return undefined;
}

console.log(`balance before: ${await credit()}`);

for (const job of queue) {
  const file = join(assetDir, `${job.id}.jpg`);
  if (await exists(file)) { console.log(`skip ${job.id} (exists)`); continue; }

  const log = { job, create: null, polls: [] };
  const create = await fetch(`${base}/s2s/v2.0/task/text-to-image/youcam`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'youcam-image-v2', prompt: job.prompt, negative_prompt: job.negative, size: job.size, prompt_extend: false }),
  });
  log.create = { status: create.status, body: await create.json().catch(() => null) };
  const taskId = log.create.body?.data?.task_id;
  if (!taskId) {
    console.log(`FAIL create ${job.id}: ${create.status} ${JSON.stringify(log.create.body)}`);
    await writeFile(join(outDir, `gen-${job.id}.json`), JSON.stringify(log, null, 2));
    continue;
  }

  const started = Date.now();
  let url;
  for (let i = 0; i < 40; i += 1) {
    await sleep(i === 0 ? 5000 : 8000);
    const poll = await fetch(`${base}/s2s/v2.0/task/text-to-image/youcam/${taskId}`, { headers: auth });
    const body = await poll.json().catch(() => null);
    log.polls.push({ status: poll.status, body });
    const st = body?.data?.task_status;
    if (poll.status !== 200 || st === 'error') { console.log(`FAIL poll ${job.id}: ${poll.status} ${JSON.stringify(body)}`); break; }
    if (st === 'success') { url = findUrl(body.data); break; }
  }
  await writeFile(join(outDir, `gen-${job.id}.json`), JSON.stringify(log, null, 2));
  if (!url) { console.log(`no result url for ${job.id}`); continue; }

  const img = await fetch(url);
  await writeFile(file, Buffer.from(await img.arrayBuffer()));
  console.log(`ok ${job.id} in ${Math.round((Date.now() - started) / 1000)} s`);
}

console.log(`balance after: ${await credit()}`);
