import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearEverything, db, rowStatus } from "@/lib/client/db";
import { demoRoutes, installDemo, isDemoBaseline } from "@/lib/client/demo";
import { DemoManifest } from "@/lib/contracts/demo";
import { planRoutes } from "@/lib/planner";

const manifest = DemoManifest.parse(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "public", "demo", "manifest.json"), "utf8")));

beforeEach(async () => {
  await clearEverything();
  // Every image fetch returns a small blob: the test is about what gets installed, not pixels.
  vi.stubGlobal("fetch", async () => new Response(new Blob(["jpeg"], { type: "image/jpeg" })));
});

describe("sample mode", () => {
  it("installs a person's genuine results as finished jobs, with no API involved", async () => {
    const persona = manifest.personas.find((p) => p.id === "amara")!;
    const id = await installDemo(persona);

    expect(id).toBe("demo-amara");
    expect(isDemoBaseline(id)).toBe(true);

    const rows = await db.jobs.where("baselineId").equals(id).toArray();
    expect(rows.map((r) => r.routeKey).sort()).toEqual(["closest", "closest~variant-1", "easier", "new-chapter"]);
    for (const row of rows) {
      expect(rowStatus(row)).toBe("succeeded");
      expect(row.result).toBe("stored");
      expect(row.job?.provenance.mode).toBe("live"); // made earlier with the real YouCam
      expect(row.job?.provenance.steps.every((s) => s.youcamTaskId)).toBe(true);
    }
    expect(await db.results.where("baselineId").equals(id).count()).toBe(rows.length);
    expect((await db.snapshots.get(id))?.snapshot).toEqual(persona.snapshot);
  });

  it("plans the paths from the very specs the results were made with (and matches the real planner)", async () => {
    for (const persona of manifest.personas) {
      const id = await installDemo(persona);
      const routes = await demoRoutes(id);
      expect(routes.map((r) => r.routeKey)).toEqual(["closest", "easier", "new-chapter"]);

      const planned = planRoutes(persona.snapshot);
      for (const [i, route] of routes.entries()) {
        expect(route.styleId).toBe(planned[i]!.styleId);
        expect(route.colour).toEqual(planned[i]!.colour);
      }
    }
  });

  it("can be installed twice without duplicating anything", async () => {
    const persona = manifest.personas.find((p) => p.id === "meera")!;
    await installDemo(persona);
    await installDemo(persona);
    const expected = persona.items.filter((i) => i.spec.kind === "route" && (i.kind === "variant" || ["closest", "easier", "new-chapter"].includes(i.key))).length;
    expect(await db.jobs.count()).toBe(expected);
    expect(await db.results.count()).toBe(expected);
  });

  it("installs the baked check, the first version and the repair step of a repaired sample", async () => {
    const persona = structuredClone(manifest.personas.find((p) => p.id === "meera")!);
    const closest = persona.items.find((i) => i.key === "closest")!;
    const repairStep = { kind: "hair-color" as const, endpoint: "/s2s/v2.0/task/hair-color", apiVersion: "v2.0", params: { src_file_url: "<source job result>" }, youcamTaskId: "task-repair", finishedAt: "2026-11-01T00:00:00.000Z" };
    closest.check = { outcome: "checked", face: { status: "unchanged", drift: 0.004 }, colour: { status: "drifted", baselineHex: "#2A1D18", resultHex: "#1B170D", deltaE: 5.4 }, repaired: { state: "adjusted", deltaEAfter: 1.2 }, checkedAt: "2026-11-01T00:00:00.000Z" };
    closest.original = "/demo/meera/closest-first.jpg";
    closest.repairStep = repairStep;
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      seen.push(url);
      return new Response(new Blob(["jpeg"], { type: "image/jpeg" }));
    });

    const id = await installDemo(persona);

    const row = (await db.jobs.where("baselineId").equals(id).toArray()).find((r) => r.routeKey === "closest")!;
    expect(row.check).toEqual(closest.check);
    const result = (await db.results.get(row.clientRequestId))!;
    expect(result.original).toBeInstanceOf(Blob);
    expect(seen).toContain("/demo/meera/closest-first.jpg");
    expect(result.provenance.steps).toHaveLength(closest.provenance.steps.length + 1);
    expect(result.provenance.steps.at(-1)).toEqual(repairStep);
    expect(row.job?.steps).toHaveLength(closest.provenance.steps.length); // the job's own steps stay as they were
  });
});
