// B0 stage 2: colour restore, textured templates, brows, hats, head wrap. ~15 units.
// Reuses stage-1 baseline file_ids (tests one-upload-many-endpoints).
// Usage (from continuity-mirror/spike): node stage2.mjs
import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { assets, balance, download, normalise, out, runTask, saveJson, upload } from './lib.mjs';

const s1 = JSON.parse(await readFile(out('stage1', 'summary.json'), 'utf8'));
const files = s1.files;
await mkdir(out('stage2'), { recursive: true });

const summary = { started: new Date().toISOString(), balanceStart: await balance(), runs: [] };
console.log(`balance start: ${summary.balanceStart}`);

async function run(name, path, body, saveAs) {
  const log = [];
  const before = await balance();
  const r = await runTask(path, body, log);
  const after = await balance();
  if (r.url && saveAs) await download(r.url, assets('results', saveAs));
  const row = { name, path, status: r.status, seconds: Math.round(r.ms / 1000), units: before - after,
    error: r.body?.data?.error ?? r.body?.error ?? null, errorMessage: r.body?.data?.error_message ?? null, saved: r.url ? saveAs : null };
  summary.runs.push(row);
  await saveJson(out('stage2', `${name}.json`), log);
  console.log(`${String(row.status).padEnd(8)} ${name}  ${row.seconds}s  ${row.units}u  ${row.error ?? ''} ${row.errorMessage ?? ''}`);
  return r;
}

// 1a. Colour restore via src_file_url = stage-1 hair-transfer result URL (chain test)
const amaraLog = JSON.parse(await readFile(out('stage1', 'persona-b-amara__female_bobcut_curly.json'), 'utf8'));
const amaraUrl = amaraLog.find((x) => x.step === 'task-final')?.body?.data?.results?.url;
const urlAlive = amaraUrl ? (await fetch(amaraUrl, { method: 'GET' })).ok : false;
console.log(`stage-1 result URL still valid: ${urlAlive}`);
if (urlAlive) {
  await run('colour-chain-url-amara', '/s2s/v2.0/task/hair-color', {
    src_file_url: amaraUrl,
    pattern: { name: 'full' },
    palettes: [{ color: '#1C1714', color_intensity: 80, shine_intensity: 20 }],
  }, 'persona-b-amara__bobcut_curly__colour-1C1714.jpg');
}

// 1b. Colour restore via re-uploaded result (file_id path)
const graceResult = await readFile(assets('results', 'persona-d-grace__all_pixie.jpg'));
const graceResultId = await upload(await normalise(graceResult), 'grace-pixie-result.jpg', []);
await run('colour-fileid-grace', '/s2s/v2.0/task/hair-color', {
  src_file_id: graceResultId,
  pattern: { name: 'full' },
  palettes: [{ color: '#BEBDB8', color_intensity: 80, shine_intensity: 20 }],
}, 'persona-d-grace__pixie__colour-BEBDB8.jpg');

// 2. Textured templates on Amara's baseline
for (const t of ['female_bouncy_curls', 'female_long_spiral_curls']) {
  await run(`texture-amara-${t}`, '/s2s/v2.1/task/hair-transfer', { src_file_id: files['persona-b-amara'], template_id: t },
    `persona-b-amara__${t}.jpg`);
}

// 3. Brows on Meera's baseline (makeup-vto with the hair-transfer file_id)
for (const [shape, colour] of [['Straight1', '#2B1E16'], ['SoftArch1', '#2B1E16']]) {
  await run(`brows-meera-${shape}`, '/s2s/v2.0/task/makeup-vto', {
    src_file_id: files['persona-a-meera'],
    version: '1.0',
    effects: [{ category: 'eyebrows', pattern: { type: 'shape', name: shape, curvature: 0, thickness: 0, definition: 0 },
      palettes: [{ color: colour, texture: 'matte', colorIntensity: 60 }] }],
  }, `persona-a-meera__brows-${shape}.jpg`);
}

// 4/5. Headwear: upload product refs, then hat / scarf tasks
async function ref(name) {
  const buf = await sharp(await readFile(assets(`${name}.jpg`))).resize({ width: 1024, height: 1024, fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
  return upload(buf, `${name}.jpg`, []);
}
await run('hat-meera-beanie', '/s2s/v2.0/task/hat',
  { src_file_id: files['persona-a-meera'], ref_file_id: await ref('headwear-beanie'), gender: 'female', style: 'style_warm_cozy' },
  'persona-a-meera__hat-beanie.jpg');
await run('hat-daniel-cap', '/s2s/v2.0/task/hat',
  { src_file_id: files['persona-c-daniel'], ref_file_id: await ref('headwear-cap'), gender: 'male', style: 'style_urban_fashion' },
  'persona-c-daniel__hat-cap.jpg');
await run('scarf-amara-turban', '/s2s/v2.0/task/scarf',
  { src_file_id: files['persona-b-amara'], ref_file_id: await ref('headwrap-turban'), gender: 'female', style: 'style_modern_chic' },
  'persona-b-amara__scarf-turban.jpg');

summary.balanceEnd = await balance();
summary.unitsSpent = summary.balanceStart - summary.balanceEnd;
await saveJson(out('stage2', 'summary.json'), summary);
console.log(`balance end: ${summary.balanceEnd} (spent ${summary.unitsSpent})`);
