// B0 stage 3: can Hair Style custom mode (reference image) keep coily texture? ~3 units.
// 1) Generate a coily-hair reference with YouCam Image Generator (1u)
// 2) hair-transfer custom mode on Amara with ref_file_id + hair_color: 'src' (2u)
// Usage (from continuity-mirror/spike): node stage3-coily.mjs
import { readFile, mkdir } from 'node:fs/promises';
import { assets, balance, download, normalise, out, runTask, saveJson, upload } from './lib.mjs';

const s1 = JSON.parse(await readFile(out('stage1', 'summary.json'), 'utf8'));
await mkdir(out('stage3'), { recursive: true });
const log = [];
const summary = { balanceStart: await balance() };
console.log(`balance start: ${summary.balanceStart}`);

const gen = await runTask('/s2s/v2.0/task/text-to-image/youcam', {
  model: 'youcam-image-v2',
  size: '1104*1472',
  prompt_extend: false,
  prompt:
    'Photorealistic portrait photograph of a Black woman with a chin-length rounded natural haircut of tightly defined type 4C coily hair, ' +
    'dense springy coils, natural black colour. Front-facing, looking at the camera, head level, framed from above the head to mid-chest, ' +
    'both shoulders visible. Plain light grey studio background, soft even frontal light, plain crew-neck top. Hair fully visible.',
  negative_prompt: 'straight hair, loose waves, wig, hat, scarf, glasses, earrings, hands, multiple people, cropped head, side profile, text, watermark, blur, cartoon',
}, log, { intervalMs: 5000 });
console.log(`reference: ${gen.status} ${Math.round(gen.ms / 1000)}s`);
if (!gen.url) { await saveJson(out('stage3', 'log.json'), log); throw new Error('reference generation failed'); }
await download(gen.url, assets('ref-coily-chin.jpg'));

const refId = await upload(await normalise(await readFile(assets('ref-coily-chin.jpg'))), 'ref-coily-chin.jpg', log);
const before = await balance();
const r = await runTask('/s2s/v2.1/task/hair-transfer', {
  src_file_id: s1.files['persona-b-amara'],
  ref_file_id: refId,
  hair_color: 'src',
}, log);
const after = await balance();
if (r.url) await download(r.url, assets('results', 'persona-b-amara__custom-coily-chin.jpg'));
console.log(`custom transfer: ${r.status} ${Math.round(r.ms / 1000)}s ${before - after}u ${JSON.stringify(r.body?.data?.error ?? r.body?.error ?? null)}`);

summary.balanceEnd = await balance();
summary.unitsSpent = summary.balanceStart - summary.balanceEnd;
await saveJson(out('stage3', 'log.json'), log);
await saveJson(out('stage3', 'summary.json'), summary);
console.log(`balance end: ${summary.balanceEnd} (spent ${summary.unitsSpent})`);
