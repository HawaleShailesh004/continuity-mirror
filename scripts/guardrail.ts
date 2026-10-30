// Claim guardrail (master plan §5.6, §6). Fails CI on banned claims or tone in user-facing code.
// Escape hatch for a deliberate quote: put `guardrail-ignore` on the same line, with a reason.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");

/** Claims we must never make, anywhere a user can read. */
const BANNED_CLAIMS = [
  /\bdiagnos(e|is|ing)\b/i,
  /predict(s|ing)? your hair loss/i,
  /will grow back/i,
  /\bcures?\b/i,
  /treatment works/i,
  /exact (wig )?fit/i,
  /\bguarantee(d|s)?\b/i,
  /looks? younger/i,
  /\battractive(ness)?\b/i,
  /beauty score/i,
  /delete everywhere/i,
];

/** Tone rules for copy (content/ only): calm friend, not cheerleader or clinician. */
const BANNED_TONE = [/\bfight(ing)?\b/i, /\bbattle\b/i, /\bbrave\b/i, /\bfake\b/i, /natural-looking/i, /\bpatients?\b/i];

const USER_FACING = ["content", "components", "app"];
const SKIP_DIRS = new Set(["node_modules", ".next", "api", "dev"]);

function* files(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* files(path);
    } else if (/\.(tsx?|json|mdx?)$/.test(name) && !/\.test\./.test(name)) yield path;
  }
}

const problems: string[] = [];
for (const top of USER_FACING) {
  for (const file of files(join(root, top))) {
    const rel = relative(root, file).replace(/\\/g, "/");
    const rules = rel.startsWith("content/") ? [...BANNED_CLAIMS, ...BANNED_TONE] : BANNED_CLAIMS;
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        // Comments aren't user-facing (and often quote the rules themselves).
        if (line.includes("guardrail-ignore") || /^\s*(\/\/|\/\*|\*)/.test(line)) return;
        for (const rule of rules) if (rule.test(line)) problems.push(`${rel}:${i + 1}  ${rule}  ${line.trim().slice(0, 100)}`);
      });

    // Every generated image must carry the "style direction, not exact wig fit" label.
    const text = readFileSync(file, "utf8");
    if (rel.startsWith("components/") && text.includes("data-generated-image") && !text.includes("StyleDirectionLabel")) {
      problems.push(`${rel}  renders a generated image (data-generated-image) without StyleDirectionLabel`);
    }
  }
}

if (problems.length) {
  console.error(`guardrail: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("guardrail: clean");
