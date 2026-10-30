// B0 part 1: read-only YouCam checks that should cost 0 units.
// Usage: node scripts/spike-0-readonly.mjs
// Writes raw responses to spike-output/ (gitignored). Never prints the API key.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'spike-output');

async function loadEnv() {
  const text = await readFile(join(root, '.env.local'), 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = await loadEnv();
const base = env.YOUCAM_API_BASE?.replace(/\/$/, '');
const key = env.YOUCAM_API_KEY;
if (!base || !key) throw new Error('YOUCAM_API_BASE and YOUCAM_API_KEY must be set in .env.local');

await mkdir(join(outDir, 'thumbnails'), { recursive: true });

async function call(path) {
  const started = Date.now();
  const res = await fetch(base + path, { headers: { Authorization: `Bearer ${key}` } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  const ms = Date.now() - started;
  console.log(`${res.status} ${path} (${ms} ms)`);
  return { status: res.status, ms, body };
}

async function save(name, data) {
  await writeFile(join(outDir, name), JSON.stringify(data, null, 2));
}

// 1. Host + auth + balance
const creditBefore = await call('/s2s/v1.0/client/credit');
await save('credit-before.json', creditBefore);

// 2. Feature costs
const costs = await call('/s2s/v2.0/credit/feature-cost');
await save('feature-cost.json', costs);

// 3. Hair-transfer templates (paged)
const templates = [];
let token;
let page = 0;
do {
  const qs = new URLSearchParams({ page_size: '20' });
  if (token) qs.set('starting_token', token);
  const r = await call(`/s2s/v2.1/task/template/hair-transfer?${qs}`);
  await save(`templates-page-${page}.json`, r);
  if (r.status !== 200) break;
  const data = r.body?.data ?? {};
  const items = data.templates ?? data.results ?? data.items ?? (Array.isArray(data) ? data : []);
  templates.push(...items);
  token = data.next_token ?? data.starting_token ?? data.next_starting_token;
  page += 1;
} while (token && page < 20);

await save('templates.json', templates);
console.log(`templates collected: ${templates.length}`);

// 4. Thumbnails (any http(s) URL field on a template)
let downloaded = 0;
for (const [i, t] of templates.entries()) {
  const url = Object.values(t).find((v) => typeof v === 'string' && /^https?:\/\//.test(v));
  if (!url) continue;
  const res = await fetch(url);
  if (!res.ok) continue;
  const id = String(t.id ?? t.template_id ?? i).replace(/[^\w-]/g, '_');
  const ext = (res.headers.get('content-type') ?? '').includes('png') ? 'png' : 'jpg';
  await writeFile(join(outDir, 'thumbnails', `${id}.${ext}`), Buffer.from(await res.arrayBuffer()));
  downloaded += 1;
}
console.log(`thumbnails downloaded: ${downloaded}`);

// 5. Balance after, to confirm these calls were free
const creditAfter = await call('/s2s/v1.0/client/credit');
await save('credit-after.json', creditAfter);
