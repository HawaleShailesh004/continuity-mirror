// B0 stage 1 (go/no-go): one own-colour hairstyle per persona + 3 deliberately bad inputs.
// Budget: ~8 units for styles, up to 6 for errors (if errors are charged).
// Usage (from continuity-mirror/spike): node stage1.mjs
import { readFile, mkdir } from 'node:fs/promises';
import { api, assets, balance, download, normalise, out, runTask, saveJson, upload } from './lib.mjs';

const HAIR = '/s2s/v2.1/task/hair-transfer';
await mkdir(out('stage1'), { recursive: true });
await mkdir(assets('results'), { recursive: true });

const styles = [
  { persona: 'persona-a-meera', template: 'all_short_bob', why: 'shorter, own dark colour' },
  { persona: 'persona-b-amara', template: 'female_bobcut_curly', why: 'textured, own black colour' },
  { persona: 'persona-c-daniel', template: 'male_textured_comma', why: 'men, own colour' },
  { persona: 'persona-d-grace', template: 'all_pixie', why: 'regrowth length, own grey colour' },
];

const summary = { started: new Date().toISOString(), balanceStart: await balance(), files: {}, runs: [] };
console.log(`balance start: ${summary.balanceStart}`);

for (const s of styles) {
  const log = [];
  const buf = await normalise(await readFile(assets(`${s.persona}.jpg`)));
  const fileId = await upload(buf, `${s.persona}.jpg`, log);
  summary.files[s.persona] = fileId;
  const before = await balance();
  const r = await runTask(HAIR, { src_file_id: fileId, template_id: s.template }, log);
  const after = await balance();
  if (r.url) await download(r.url, assets('results', `${s.persona}__${s.template}.jpg`));
  const row = { ...s, status: r.status, seconds: Math.round(r.ms / 1000), units: before - after, error: r.body?.data?.error ?? null };
  summary.runs.push(row);
  await saveJson(out('stage1', `${s.persona}__${s.template}.json`), log);
  console.log(`${row.status.padEnd(8)} ${s.persona} × ${s.template}  ${row.seconds}s  ${row.units}u  ${row.error ?? ''}`);
}

// Deliberately bad inputs: what error codes, and are units charged?
const meera = await readFile(assets('persona-a-meera.jpg'));
const bad = [
  { name: 'no-shoulders', expect: 'error_no_shoulder',
    make: () => normalise(meera, (img) => img.extract({ left: 250, top: 250, width: 600, height: 600 })) },
  { name: 'tilted-35deg', expect: 'error_face_pose / error_large_face_angle',
    make: () => normalise(meera, (img) => img.rotate(35, { background: '#e8ebee' })) },
  { name: 'no-face', expect: 'error_insufficient_landmarks / error_no_face',
    make: async () => normalise(await readFile(assets('headwear-beanie.jpg'))) },
];

for (const b of bad) {
  const log = [];
  const buf = await b.make();
  const fileId = await upload(buf, `bad-${b.name}.jpg`, log);
  const before = await balance();
  const r = await runTask(HAIR, { src_file_id: fileId, template_id: 'all_short_bob' }, log);
  const after = await balance();
  const row = { bad: b.name, expect: b.expect, status: r.status, seconds: Math.round(r.ms / 1000), units: before - after, error: r.body?.data?.error ?? r.body?.error ?? null };
  summary.runs.push(row);
  await saveJson(out('stage1', `bad-${b.name}.json`), log);
  console.log(`${String(row.status).padEnd(8)} bad:${b.name}  ${row.seconds}s  ${row.units}u  got=${JSON.stringify(row.error)}`);
}

summary.balanceEnd = await balance();
summary.unitsSpent = summary.balanceStart - summary.balanceEnd;
await saveJson(out('stage1', 'summary.json'), summary);
console.log(`balance end: ${summary.balanceEnd} (spent ${summary.unitsSpent})`);
