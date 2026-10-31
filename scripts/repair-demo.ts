// Win plan T3: repair sample results whose hair colour drifted, then bake the on-device result check
// into public/demo/manifest.json so sample mode can show "Checked" like a live session does.
//
//   pnpm dev                                   (the measuring page /dev/check?api=1 only exists in development)
//   pnpm demo:repair                           DRY RUN (default): measure, print the plan and the unit estimate. Spends and writes nothing.
//   pnpm demo:repair -- --live --force=meera/easier --max-units=15     really repair (spends units)
//   pnpm demo:repair -- --bake                 only (re)write `check` on every route/colour item. 0 units.
//   pnpm demo:repair -- --revert=meera/easier  put the first image back, drop original/repairStep, then bake. 0 units.
//   --url=http://localhost:3000                where the dev server is
//
// --force: Meera's "easier" measures ΔE 3.5 (under the threshold of 4) because the check compares the MEAN hair colour,
// and a blue sheen on the highlights barely moves the mean. The eye sees it; the metric doesn't.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { catalog, planSteps, SRC_SOURCE_RESULT } from "@/lib/catalog";
import { DemoManifest, type DemoCheck, type DemoItem, type DemoPersona } from "@/lib/contracts/demo";
import { balance, download, runTask, upload } from "../spike/lib.mjs";

const flag = (name: string) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name: string) => flag(name)?.split("=")[1];
const list = (name: string) => (value(name) ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const live = Boolean(flag("live"));
const bakeOnly = Boolean(flag("bake"));
const revert = list("revert");
const force = new Set(list("force"));
const maxUnits = Number(value("max-units") ?? 15);
const url = value("url") ?? "http://localhost:3000";
const dry = !live && !bakeOnly && revert.length === 0;

const publicDir = join(process.cwd(), "public");
const manifestPath = join(publicDir, "demo/manifest.json");
const manifest = DemoManifest.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
const file = (rel: string) => join(publicDir, rel);
const sha = (rel: string) => createHash("sha256").update(readFileSync(file(rel))).digest("hex");
const save = () => {
  const parsed = DemoManifest.parse(manifest); // validate before writing
  writeFileSync(manifestPath, JSON.stringify(parsed, null, 2) + "\n");
};

type Api = {
  __cmJudge: (b: string, r: string, own: boolean) => Promise<DemoCheck>;
  __cmRepairHex: (b: string, r: string) => Promise<string | null>;
  __cmReady?: boolean;
};

const log: unknown[] = [];
let unitsSpent = 0;
const startBalance: number | null = live ? await balance() : null;
if (live && startBalance! - maxUnits < 450) throw new Error(`refusing: balance ${startBalance} - cap ${maxUnits} would go below 450`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${url}/dev/check?api=1`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForFunction(() => (window as unknown as Api).__cmReady === true, null, { timeout: 180_000 });
const judgeAt = (b: string, r: string, own: boolean) => page.evaluate(([b, r, own]) => (window as unknown as Api).__cmJudge(b, r, own as boolean), [b, r, own] as const);
const repairHexAt = (b: string, r: string) => page.evaluate(([b, r]) => (window as unknown as Api).__cmRepairHex(b, r), [b, r] as const);

const isOwnRoute = (i: DemoItem) => i.spec.kind === "route" && i.spec.colour.source === "own";
const dataUrl = (buf: Buffer) => "data:image/jpeg;base64," + buf.toString("base64");

/* ------------------------------------------------------------------ revert */
if (revert.length) {
  for (const target of revert) {
    const [pid, key] = target.split("/");
    const persona = manifest.personas.find((p) => p.id === pid);
    const item = persona?.items.find((i) => i.key === key);
    if (!persona || !item?.original) {
      console.log(`revert ${target}: nothing to revert`);
      continue;
    }
    const original = item.original;
    for (const i of persona.items.filter((x) => x.original === original)) {
      copyFileSync(file(original), file(i.image));
      delete i.original;
      delete i.repairStep;
    }
    rmSync(file(original), { force: true });
    console.log(`reverted ${target}`);
  }
}

/* ------------------------------------------------------------------ repair */
type Done = { persona: DemoPersona; item: DemoItem; first: string; before: DemoCheck; afterDeltaE: number };
const repaired: Done[] = [];

if (!bakeOnly && revert.length === 0) {
  type Group = { persona: DemoPersona; items: DemoItem[]; check: DemoCheck; forced: boolean; hex: string | null };
  const groups: Group[] = [];
  for (const persona of manifest.personas) {
    const byHash = new Map<string, DemoItem[]>();
    for (const item of persona.items.filter(isOwnRoute)) {
      const h = sha(item.original ?? item.image) + (item.original ? "-repaired" : "");
      byHash.set(h, [...(byHash.get(h) ?? []), item]);
    }
    for (const items of byHash.values()) {
      if (items.some((i) => i.original)) continue; // already repaired: re-runs are safe
      const check = await judgeAt(persona.baseline, items[0]!.image, true);
      const forced = items.some((i) => force.has(`${persona.id}/${i.key}`));
      const due = check.outcome === "repairable" || forced;
      if (!due) {
        if (check.outcome === "needs-look" || check.outcome === "unchecked") console.log(`skip ${persona.id}/${items.map((i) => i.key)}: ${check.outcome} (face ${check.face.status})`);
        continue;
      }
      groups.push({ persona, items, check, forced, hex: check.repairHex ?? (await repairHexAt(persona.baseline, items[0]!.image)) });
    }
  }

  console.log("\nperson   keys                                  ΔE before  outcome     forced  repair hex");
  for (const g of groups)
    console.log(`${g.persona.id.padEnd(8)} ${g.items.map((i) => i.key).join(",").padEnd(37)} ${String(g.check.colour.deltaE?.toFixed(1)).padEnd(10)} ${g.check.outcome.padEnd(11)} ${String(g.forced).padEnd(7)} ${g.hex}`);
  console.log(`\n${groups.length} group(s) due, about ${groups.length} unit(s) (1 per Hair Color pass, up to 2 tries each). Cap: ${maxUnits}.`);

  if (live) {
    for (const g of groups) {
      if (unitsSpent + 1 > maxUnits) {
        console.log("unit cap reached, stopping");
        break;
      }
      if (!g.hex) {
        console.log(`skip ${g.persona.id}/${g.items[0]!.key}: no repair colour`);
        continue;
      }
      const first = g.items[0]!;
      const [planned] = planSteps({ kind: "repair", fromJobId: "demo-repair-0000", colourHex: g.hex as `#${string}` }, catalog);
      const { src_file_url: _drop, ...rest } = planned!.body as Record<string, unknown>;
      void _drop;
      const meta = await sharp(file(first.image)).metadata();
      let accepted = false;
      for (let attempt = 1; attempt <= 2 && !accepted; attempt++) {
        if (unitsSpent + planned!.units > maxUnits) break;
        const fileId = await upload(readFileSync(file(first.image)), `${g.persona.id}-${first.key}.jpg`, log);
        const r = await runTask(planned!.endpoint, { src_file_id: fileId, ...rest }, log);
        if (r.taskId) unitsSpent += planned!.units;
        if (r.status !== "success" || !r.url) {
          console.log(`${g.persona.id}/${first.key} try ${attempt}: ${r.status}`);
          continue;
        }
        const tmp = file(`demo/${g.persona.id}/.repair-tmp`);
        await download(r.url, tmp);
        const buf = await sharp(tmp).resize(meta.width, meta.height, { fit: "fill" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
        rmSync(tmp, { force: true });
        const after = await judgeAt(g.persona.baseline, dataUrl(buf), true);
        const before = g.check.colour.deltaE ?? Infinity;
        console.log(`${g.persona.id}/${first.key} try ${attempt}: ΔE ${before.toFixed(1)} → ${after.colour.deltaE?.toFixed(1)} (face ${after.face.status})`);
        if (after.face.status === "changed" || after.colour.deltaE === null || !(after.colour.deltaE < before)) continue;

        const firstRel = `/demo/${g.persona.id}/${first.key}-first.jpg`;
        if (!existsSync(file(firstRel))) copyFileSync(file(first.image), file(firstRel));
        for (const p of new Set(g.items.map((i) => i.image))) writeFileSync(file(p), buf);
        const repairStep = {
          kind: "hair-color" as const,
          endpoint: planned!.endpoint,
          apiVersion: planned!.apiVersion,
          params: { ...rest, src_file_url: SRC_SOURCE_RESULT },
          youcamTaskId: r.taskId as string,
          finishedAt: new Date().toISOString(),
        };
        for (const i of g.items) {
          i.original = firstRel;
          i.repairStep = repairStep;
          repaired.push({ persona: g.persona, item: i, first: firstRel, before: g.check, afterDeltaE: after.colour.deltaE });
        }
        save(); // resumable
        accepted = true;
      }
      if (!accepted) console.log(`${g.persona.id}/${first.key}: not improved, left as it was`);
    }
    manifest.unitsSpent += unitsSpent;
  }
}

/* -------------------------------------------------------------------- bake */
if (!dry) {
  for (const persona of manifest.personas) {
    for (const item of persona.items) {
      if (item.spec.kind !== "route" && item.spec.kind !== "colour") continue; // brows are not checked, same as the live app
      const own = isOwnRoute(item);
      let check: DemoCheck;
      if (item.original) {
        const firstCheck = await judgeAt(persona.baseline, item.original, true);
        const final = await judgeAt(persona.baseline, item.image, true);
        check = { ...firstCheck, outcome: "checked", repaired: { state: "adjusted", ...(final.colour.deltaE == null ? {} : { deltaEAfter: final.colour.deltaE }) } };
      } else {
        check = await judgeAt(persona.baseline, item.image, own);
      }
      const { repairHex: _unused, ...baked } = check; // samples never repair on the device
      void _unused;
      item.check = baked;
    }
  }
  save();
  console.log("baked checks into", manifestPath);
}
await browser.close();

/* ------------------------------------------------------------ review sheet */
if (repaired.length) {
  const groups = new Map<string, Done>();
  for (const d of repaired) groups.set(`${d.persona.id}/${d.first}`, d);
  const W = 384;
  const H = 512;
  const rows = await Promise.all(
    [...groups.values()].map(async (d, row) => {
      const cells = [d.persona.baseline, d.first, d.item.image];
      const label = (text: string, x: number) =>
        ({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="40"><text x="12" y="28" font-family="Arial" font-size="20" fill="#222">${text}</text></svg>`), left: x, top: row * (H + 40) + H });
      const texts = [`${d.persona.id}: baseline`, `first version: ΔE ${d.before.colour.deltaE?.toFixed(1)}`, `repaired: ΔE ${d.afterDeltaE.toFixed(1)}`];
      const imgs = await Promise.all(cells.map(async (c, i) => ({ input: await sharp(file(c)).resize(W, H, { fit: "cover" }).jpeg().toBuffer(), left: i * W, top: row * (H + 40) })));
      return [...imgs, ...texts.map((t, i) => label(t, i * W))];
    }),
  );
  mkdirSync(join(process.cwd(), "spike-output"), { recursive: true });
  await sharp({ create: { width: W * 3, height: (H + 40) * groups.size, channels: 3, background: "#fff" } })
    .composite(rows.flat())
    .jpeg({ quality: 88 })
    .toFile(join(process.cwd(), "spike-output/repair-review.jpg"));
  console.log("review sheet: spike-output/repair-review.jpg");
}

if (live) {
  mkdirSync(join(process.cwd(), "spike-output/repair-demo"), { recursive: true });
  writeFileSync(join(process.cwd(), "spike-output/repair-demo", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(log, null, 2));
  console.log(`units spent: ${unitsSpent}; balance ${startBalance} → ${await balance()}`);
}
