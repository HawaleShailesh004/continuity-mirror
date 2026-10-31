import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { catalog, estimateUnits, planSteps } from "@/lib/catalog";
import type { ResultCheck } from "@/lib/client/check/judge";
import { DemoManifest, type DemoCheck } from "@/lib/contracts/demo";
import { PERSONAS } from "@/lib/contracts/mocks/fixtures";
import { planRegrowth, planRoutes } from "@/lib/planner";

const publicDir = join(process.cwd(), "public");
const manifest = DemoManifest.parse(JSON.parse(readFileSync(join(publicDir, "demo/manifest.json"), "utf8")));
const imageSize = (rel: string) => statSync(join(publicDir, rel)).size;

describe("public/demo/manifest.json", () => {
  it("parses against the contract and covers the four sample people", () => {
    expect(manifest.personas.map((p) => p.id).sort()).toEqual(["amara", "daniel", "grace", "meera"]);
    expect(manifest.mode).toBe("live");
  });

  it("every image exists and is a real JPEG, and nothing is missing from the plan", () => {
    for (const p of manifest.personas) {
      expect(existsSync(join(publicDir, p.baseline)), p.baseline).toBe(true);
      expect(p.failures, `${p.id} has failed items`).toEqual([]);
      for (const i of p.items) {
        const bytes = readFileSync(join(publicDir, i.image));
        expect([...bytes.subarray(0, 2)], i.image).toEqual([0xff, 0xd8]);
        expect(bytes.length, i.image).toBeGreaterThan(20_000);
      }
      const keys = p.items.map((i) => i.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of ["closest", "easier", "new-chapter", "brows", "regrowth-3m", "regrowth-6m", "regrowth-12m"]) expect(keys, `${p.id}/${k}`).toContain(k);
    }
  });

  it("matches what the planner produces for each persona today (no stale results)", () => {
    for (const p of manifest.personas) {
      const fixture = PERSONAS.find((x) => x.id === p.id)!;
      expect(p.snapshot, p.id).toMatchObject({ texture: fixture.snapshot.texture, hairHex: fixture.snapshot.hairHex });
      const planned = [...planRoutes(p.snapshot), ...planRegrowth(p.snapshot)];
      for (const r of planned) {
        const item = p.items.find((i) => i.key === r.routeKey)!;
        expect(item, `${p.id}/${r.routeKey}`).toBeDefined();
        expect(item.spec, `${p.id}/${r.routeKey}`).toMatchObject({ kind: "route", styleId: r.styleId, colour: r.colour });
      }
    }
  });

  it("provenance is genuine: live mode, real task ids, placeholders instead of file ids or URLs", () => {
    for (const p of manifest.personas) {
      for (const i of p.items.filter((x) => x.units > 0)) {
        expect(i.provenance.mode, `${p.id}/${i.key}`).toBe("live");
        expect(i.provenance.steps.length).toBeGreaterThan(0);
        for (const s of i.provenance.steps) expect(s.youcamTaskId, `${p.id}/${i.key}`).toBeTruthy();
      }
    }
    const text = readFileSync(join(publicDir, "demo/manifest.json"), "utf8");
    expect(text).not.toMatch(/amazonaws|X-Amz-|Bearer /i);
    expect(text).toContain("<baseline>");
  });

  it("units add up to what each spec costs in the pipeline (reused results cost 0 and say so)", () => {
    for (const p of manifest.personas) {
      for (const i of p.items) {
        if (i.units === 0) {
          expect(i.note, `${p.id}/${i.key}`).toMatch(/same result/);
          continue;
        }
        expect(i.units, `${p.id}/${i.key}`).toBe(estimateUnits(i.spec, catalog));
        expect(planSteps(i.spec, catalog).length).toBe(i.provenance.steps.length);
      }
    }
  });

  it("brow previews carry the honest note", () => {
    for (const p of manifest.personas) expect(p.items.find((i) => i.key === "brows")!.note).toMatch(/subtle/i);
  });

  it("reference styles were checked in custom mode and looked at", () => {
    expect(manifest.refChecks.length).toBeGreaterThanOrEqual(6);
    for (const r of manifest.refChecks) {
      expect(r.image, r.styleId).toBeDefined();
      expect(r.verdict, r.styleId).toBe("good");
      expect(imageSize(r.image!)).toBeGreaterThan(20_000);
    }
  });

  it("stays small enough to ship in the repo and the PWA precache", () => {
    const total = [...manifest.personas.flatMap((p) => [p.baseline, ...p.items.map((i) => i.image)]), ...manifest.refChecks.flatMap((r) => (r.image ? [r.image] : []))].reduce(
      (sum, rel) => sum + imageSize(rel),
      0,
    );
    expect(total).toBeLessThan(25 * 1024 * 1024);
  });
});

describe("sample checks and repairs", () => {
  it("DemoCheck has exactly the shape of the app's ResultCheck", () => {
    expectTypeOf<DemoCheck>().toEqualTypeOf<ResultCheck>();
  });

  it("a repaired item keeps its first image, and every repair step is a Hair Color pass", () => {
    for (const p of manifest.personas)
      for (const i of p.items) {
        if (i.repairStep) expect(i.original, `${p.id}/${i.key}`).toBeDefined();
        if (i.original) {
          const bytes = readFileSync(join(publicDir, i.original));
          expect([...bytes.subarray(0, 2)], i.original).toEqual([0xff, 0xd8]);
          expect(i.repairStep?.kind, `${p.id}/${i.key}`).toBe("hair-color");
        }
      }
  });

  it("every route and colour item carries its baked check, and none asks the device to repair", () => {
    for (const p of manifest.personas)
      for (const i of p.items) {
        if (i.spec.kind !== "route" && i.spec.kind !== "colour") continue;
        expect(i.check, `${p.id}/${i.key}`).toBeDefined();
        expect(i.check, `${p.id}/${i.key}`).not.toHaveProperty("repairHex");
      }
  });
});
