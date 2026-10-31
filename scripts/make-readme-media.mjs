// README images from the genuine sample results in public/demo (no units, no network).
//
//   node scripts/make-readme-media.mjs
//
// Writes docs/media/hero.jpg (one person, every path) and docs/media/paths.jpg (four people x five columns).
// Re-run it whenever public/demo changes (e.g. after scripts/repair-demo.ts), so the README shows what the app shows.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = join(import.meta.dirname, "..");
const demo = (person, key) => join(root, "public", "demo", person, `${key}.jpg`);
const outDir = join(root, "docs", "media");
mkdirSync(outDir, { recursive: true });

const COLUMNS = [
  { key: "baseline", label: "You, before" },
  { key: "closest", label: "Closest to me" },
  { key: "easier", label: "Familiar, easier" },
  { key: "new-chapter", label: "New chapter" },
  { key: "regrowth-6m", label: "Regrowth, ~6 months" },
];

const INK = "#0F172A";
const MUTED = "#475569";
const PAPER = "#F7F8FA";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const text = (w, h, lines) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${lines
      .map(
        ({ x, y, size, weight = 600, fill = INK, anchor = "middle", value }) =>
          `<text x="${x}" y="${y}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(value)}</text>`,
      )
      .join("")}</svg>`,
  );

async function cell(person, key, w, h) {
  return sharp(demo(person, key)).resize(w, h, { fit: "cover", position: "top" }).toBuffer();
}

async function grid({ people, cellW, cellH, gap, header, footer, file }) {
  const width = COLUMNS.length * cellW + (COLUMNS.length + 1) * gap;
  const rowH = cellH + gap;
  const height = header + people.length * rowH + gap + footer;
  const composites = [];

  composites.push({
    input: text(
      width,
      header,
      COLUMNS.map((c, i) => ({ x: gap + i * (cellW + gap) + cellW / 2, y: header - 14, size: Math.round(cellW / 12), value: c.label })),
    ),
    left: 0,
    top: 0,
  });

  for (const [r, person] of people.entries()) {
    for (const [c, col] of COLUMNS.entries()) {
      composites.push({ input: await cell(person, col.key, cellW, cellH), left: gap + c * (cellW + gap), top: header + r * rowH });
    }
  }

  composites.push({
    input: text(width, footer, [
      {
        x: width / 2,
        y: footer / 2 + 6,
        size: Math.max(14, Math.round(cellW / 15)),
        weight: 500,
        fill: MUTED,
        value: "AI-generated sample people · genuine YouCam results · style direction, not exact wig fit · regrowth is a possibility, not a prediction",
      },
    ]),
    left: 0,
    top: height - footer,
  });

  await sharp({ create: { width, height, channels: 3, background: PAPER } })
    .composite(composites)
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(join(outDir, file));
  console.log(`docs/media/${file}  ${width}x${height}`);
}

await grid({ people: ["amara"], cellW: 300, cellH: 400, gap: 12, header: 52, footer: 44, file: "hero.jpg" });
await grid({ people: ["meera", "amara", "daniel", "grace"], cellW: 220, cellH: 293, gap: 10, header: 44, footer: 40, file: "paths.jpg" });
