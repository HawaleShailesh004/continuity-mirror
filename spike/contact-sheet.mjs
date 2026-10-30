// Builds side-by-side before/after sheets for visual review.
// Usage: node contact-sheet.mjs <out-name> <before.jpg> <after.jpg> [<before> <after> ...]
import sharp from 'sharp';
import { assets, out } from './lib.mjs';

const [name, ...files] = process.argv.slice(2);
const H = 420;
const tiles = [];
for (const f of files) {
  const p = f.includes(':') || f.startsWith('/') ? f : assets(f);
  tiles.push(await sharp(p).rotate().resize({ height: H }).jpeg().toBuffer());
}
const metas = await Promise.all(tiles.map((t) => sharp(t).metadata()));
const pairW = [];
for (let i = 0; i < tiles.length; i += 2) pairW.push(metas[i].width + (metas[i + 1]?.width ?? 0) + 8);
const W = Math.max(...pairW);
const rows = Math.ceil(tiles.length / 2);
const composite = [];
for (let i = 0; i < tiles.length; i++) {
  const row = Math.floor(i / 2);
  const left = i % 2 === 0 ? 0 : metas[i - 1].width + 8;
  composite.push({ input: tiles[i], top: row * (H + 8), left });
}
await sharp({ create: { width: W, height: rows * (H + 8), channels: 3, background: '#ffffff' } })
  .composite(composite)
  .jpeg({ quality: 82 })
  .toFile(out(`${name}.jpg`));
console.log(out(`${name}.jpg`));
