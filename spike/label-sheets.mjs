// Labelled contact sheets of thumbnails for tag review. Usage: node label-sheets.mjs <outDir>
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './lib.mjs';
const outDir = process.argv[2];
await mkdir(outDir, { recursive: true });
const all = JSON.parse(await readFile(join(root, 'lib/catalog/youcam-templates.json'), 'utf8'));
const ids = all.filter((t) => t.keepUsersColour && !/bald/.test(t.id)).map((t) => t.id);
const COLS = 6, W = 220, H = 290, PER = 18;
for (let s = 0; s * PER < ids.length; s++) {
  const chunk = ids.slice(s * PER, (s + 1) * PER);
  const tiles = await Promise.all(chunk.map(async (id, i) => {
    const img = await sharp(join(root, 'spike-output/thumbnails', `${id}.${id === 'female_bouncy_curls' ? 'png' : 'jpg'}`)).resize({ width: W, height: H - 22, fit: 'cover' }).toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="22"><rect width="100%" height="100%" fill="#16202E"/><text x="4" y="16" font-family="sans-serif" font-size="12" fill="#fff">${id.slice(0, 32)}</text></svg>`);
    return [{ input: img, left: (i % COLS) * (W + 4), top: Math.floor(i / COLS) * (H + 4) }, { input: label, left: (i % COLS) * (W + 4), top: Math.floor(i / COLS) * (H + 4) + H - 22 }];
  }));
  const rows = Math.ceil(chunk.length / COLS);
  await sharp({ create: { width: COLS * (W + 4), height: rows * (H + 4), channels: 3, background: '#ffffff' } }).composite(tiles.flat()).jpeg({ quality: 80 }).toFile(join(outDir, `sheet-${s + 1}.jpg`));
}
console.log(ids.length, 'templates,', Math.ceil(ids.length / PER), 'sheets');
