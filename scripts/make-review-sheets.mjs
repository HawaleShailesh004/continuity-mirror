// Contact sheets for the human tag review: every catalog style with its tags printed under the image.
// Output: spike-output/review/review-N.jpg (gitignored). Usage: node scripts/make-review-sheets.mjs
// Uses the sharp that lives in spike/ (the app itself only needs sharp at runtime on the server).
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const require = createRequire(join(root, "spike", "package.json"));
const sharp = require("sharp");
const styles = JSON.parse(readFileSync(join(root, "lib/catalog/styles.json"), "utf8"));
const outDir = join(root, "spike-output", "review");
mkdirSync(outDir, { recursive: true });

const COLS = 5, W = 250, IMG_H = 300, LABEL_H = 58, PER = 15;
const esc = (s) => s.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`);
for (let s = 0; s * PER < styles.length; s++) {
  const chunk = styles.slice(s * PER, (s + 1) * PER);
  const parts = await Promise.all(
    chunk.map(async (st, i) => {
      const left = (i % COLS) * (W + 4);
      const top = Math.floor(i / COLS) * (IMG_H + LABEL_H + 4);
      const img = await sharp(join(root, "public", st.thumbnail)).resize({ width: W, height: IMG_H, fit: "cover", position: "top" }).toBuffer();
      const tags = `${st.length} · ${st.texture} · fringe ${st.fringe ? "yes" : "no"} · part ${st.parting}`;
      const label = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#16202E"/>` +
          `<text x="6" y="17" font-family="sans-serif" font-size="13" font-weight="700" fill="#fff">${esc(st.id)} (${st.audience})</text>` +
          `<text x="6" y="35" font-family="sans-serif" font-size="12" fill="#BFD3EE">${esc(tags)}</text>` +
          `<text x="6" y="51" font-family="sans-serif" font-size="11" fill="#FBE3D3">${esc(st.style.source)} · care ${st.careEffort} · ${st.priceBand}</text></svg>`,
      );
      return [{ input: img, left, top }, { input: label, left, top: top + IMG_H }];
    }),
  );
  const rows = Math.ceil(chunk.length / COLS);
  await sharp({ create: { width: COLS * (W + 4), height: rows * (IMG_H + LABEL_H + 4), channels: 3, background: "#ffffff" } })
    .composite(parts.flat())
    .jpeg({ quality: 80 })
    .toFile(join(outDir, `review-${s + 1}.jpg`));
}
console.log(`${styles.length} styles → ${Math.ceil(styles.length / PER)} sheets in spike-output/review/`);
