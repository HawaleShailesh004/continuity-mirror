#!/usr/bin/env node
/*
 * Contrast gate for the Morning Light tokens (frontend plan §3.1, §11).
 * Parses app/theme.css, checks every text/background and UI pair we actually
 * use in light and dark, and exits 1 if any pair is below its WCAG minimum.
 * Also fails if the two dark blocks (system preference, manual switch) drift.
 *
 *   node scripts/check-contrast.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(
  fileURLToPath(new URL("../app/theme.css", import.meta.url)),
  "utf8",
);

const TEXT = 4.5; // WCAG 1.4.3 normal text
const UI = 3; // WCAG 1.4.11 non-text (focus ring, selected border)

// [foreground, background, minimum, where it is used]
const PAIRS = [
  ["text", "bg", TEXT, "body and headings"],
  ["text", "surface", TEXT, "text on cards, secondary buttons"],
  ["text", "surface-raised", TEXT, "text in sheets"],
  ["text", "selected", TEXT, "selected chip label"],
  ["text", "peach", TEXT, "text over the warm photo backdrop"],
  ["text-soft", "bg", TEXT, "supporting paragraphs"],
  ["text-soft", "surface", TEXT, "supporting text on cards"],
  ["text-soft", "peach", TEXT, "label pills (Style direction…)"],
  ["text-soft", "selected", TEXT, "unselected segment label"],
  ["text-muted", "bg", TEXT, "captions"],
  ["text-muted", "surface", TEXT, "captions on cards"],
  ["text-muted", "surface-raised", TEXT, "captions in sheets"],
  ["text-muted", "selected", TEXT, "caption on selected"],
  ["on-action", "action", TEXT, "primary button label"],
  ["action", "bg", TEXT, "links, quiet buttons"],
  ["action", "surface", TEXT, "links on cards"],
  ["action", "surface-raised", TEXT, "links in sheets"],
  ["action", "selected", UI, "selected verdict border"],
  ...[1, 2, 3, 4, 5].flatMap((n) => [
    ["text", `dawn-${n}`, TEXT, "headline on the dawn wash"],
    ["text-soft", `dawn-${n}`, TEXT, "supporting text on the dawn wash"],
    ["text-muted", `dawn-${n}`, TEXT, "caption on the dawn wash"],
    ["action", `dawn-${n}`, TEXT, "link on the dawn wash"],
  ]),
  ["focus", "bg", UI, "focus ring"],
  ["focus", "surface", UI, "focus ring on cards"],
  ["focus", "surface-raised", UI, "focus ring in sheets"],
];

function block(selectorPattern) {
  const m = css.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`theme.css: block not found: ${selectorPattern}`);
  const tokens = {};
  for (const [, name, value] of m[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    tokens[name] = value.toLowerCase();
  }
  return tokens;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const modes = {
  light: block(":root"),
  dark: block(':root\\[data-theme="dark"\\]'),
};
const darkSystem = block(':root:not\\(\\[data-theme="light"\\]\\)');

let failures = 0;

const drift = Object.keys({ ...modes.dark, ...darkSystem }).filter(
  (k) => modes.dark[k] !== darkSystem[k],
);
if (drift.length) {
  failures++;
  console.error(`✗ dark blocks differ on: ${drift.join(", ")}`);
}

for (const [mode, tokens] of Object.entries(modes)) {
  console.log(`\n${mode}`);
  for (const [fg, bg, min, use] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      failures++;
      console.error(`  ✗ missing token --${tokens[fg] ? bg : fg}`);
      continue;
    }
    const r = ratio(tokens[fg], tokens[bg]);
    const ok = r >= min;
    if (!ok) failures++;
    const line = `  ${ok ? "✓" : "✗"} ${r.toFixed(2).padStart(5)}:1 ≥ ${min}  --${fg} on --${bg}  (${use})`;
    (ok ? console.log : console.error)(line);
  }
}

if (failures) {
  console.error(`\n${failures} contrast problem(s).`);
  process.exit(1);
}
console.log("\nAll token pairs pass.");
