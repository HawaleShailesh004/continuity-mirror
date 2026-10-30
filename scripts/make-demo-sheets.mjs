// Review sheets for the demo manifest: baseline + every result per persona, then the reference checks.
// Output: spike-output/demo-review/*.jpg (gitignored). Usage: node scripts/make-demo-sheets.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const sharp = createRequire(join(root, "spike", "package.json"))("sharp");
const manifest = JSON.parse(readFileSync(join(root, "public/demo/manifest.json"), "utf8"));
const outDir = join(root, "spike-output", "demo-review");
mkdirSync(outDir, { recursive: true });

const COLS = 5, W = 240, H = 320, LABEL = 36;
const esc = (s) => s.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`);

async function sheet(name, tiles) {
  const composites = [];
  for (const [i, t] of tiles.entries()) {
    const left = (i % COLS) * (W + 4);
    const top = Math.floor(i / COLS) * (H + LABEL + 4);
    composites.push({ input: await sharp(join(root, "public", t.image)).resize({ width: W, height: H, fit: "cover", position: "top" }).toBuffer(), left, top });
    composites.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LABEL}"><rect width="100%" height="100%" fill="#16202E"/>` +
          `<text x="5" y="15" font-family="sans-serif" font-size="12" font-weight="700" fill="#fff">${esc(t.title)}</text>` +
          `<text x="5" y="30" font-family="sans-serif" font-size="11" fill="#BFD3EE">${esc(t.sub)}</text></svg>`,
      ),
      left,
      top: top + H,
    });
  }
  const rows = Math.ceil(tiles.length / COLS);
  await sharp({ create: { width: COLS * (W + 4), height: rows * (H + LABEL + 4), channels: 3, background: "#fff" } })
    .composite(composites)
    .jpeg({ quality: 80 })
    .toFile(join(outDir, `${name}.jpg`));
}

for (const p of manifest.personas) {
  const tiles = [{ image: p.baseline, title: `${p.name}: BEFORE`, sub: `${p.snapshot.length} ${p.snapshot.texture} ${p.snapshot.hairHex}` }];
  for (const i of p.items) {
    const style = i.spec.styleId ?? i.spec.browShapeId ?? i.spec.colour?.presetId ?? "";
    tiles.push({ image: i.image, title: i.key, sub: `${style} · ${i.units}u` });
  }
  await sheet(`persona-${p.id}`, tiles);
}
await sheet(
  "refchecks",
  manifest.refChecks.filter((r) => r.image).map((r) => ({ image: r.image, title: `${r.personaId} ← ${r.styleId}`, sub: `${r.units}u` })),
);
console.log("sheets in", outDir);
