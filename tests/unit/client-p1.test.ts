import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { brows as browCatalog, insuranceGuides, programmes, styles } from "@/lib/catalog";
import { StyleCatalog } from "@/lib/catalog/schema";
import { ApiError } from "@/lib/client/api";
import { BROW_POINTS, GUESS_RECT, browRect, buildRecipe, pixelRect, previewSpec, shapeById, shapesIn, startingPoint } from "@/lib/client/brows";
import type { Point } from "@/lib/client/capture/checks";
import { clearEverything, db, type ShareRow } from "@/lib/client/db";
import { DEMO_BROWS_KEY, DEMO_REGROWTH_KEYS, demoRoutes, installDemo, installDemoItems } from "@/lib/client/demo";
import { buildPackModel } from "@/lib/client/pack";
import { containBox, SHARE_CELL, stopAllSharing, stopSharing, uniqueLabels } from "@/lib/client/share";
import { JobSpec } from "@/lib/contracts";
import { DemoManifest } from "@/lib/contracts/demo";
import { errorBody } from "@/lib/contracts/errors";

const mockApi = vi.hoisted(() => ({ revokeShare: vi.fn(), createShare: vi.fn() }));
vi.mock("@/lib/client/api", async (original) => ({ ...(await original<typeof import("@/lib/client/api")>()), api: mockApi }));

const root = join(import.meta.dirname, "..", "..");
const manifest = DemoManifest.parse(JSON.parse(readFileSync(join(root, "public", "demo", "manifest.json"), "utf8")));

beforeEach(async () => {
  vi.resetAllMocks();
  await clearEverything();
  // Every image fetch returns a small blob: these tests are about what gets installed, not pixels.
  vi.stubGlobal("fetch", async (url: string) =>
    url.endsWith("manifest.json") ? new Response(JSON.stringify(manifest)) : new Response(new Blob(["jpeg"], { type: "image/jpeg" })),
  );
});

/* ------------------------------------------------------------- brow record */

/** 478 face-mesh points; only the brow points matter, set where a typical portrait has them. */
function face(brow: { cx: number; cy: number; halfWidth: number; halfHeight: number }): Point[] {
  const points: Point[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  BROW_POINTS.forEach((index, i) => {
    const left = i < 10;
    const t = (i % 5) / 4; // 0..1 along the brow
    const upper = (i % 10) < 5;
    points[index] = {
      x: brow.cx + (left ? -1 : 1) * (0.15 + brow.halfWidth * (left ? 1 - t : t)) - (left ? brow.halfWidth : 0),
      y: brow.cy + (upper ? -brow.halfHeight : brow.halfHeight),
    };
  });
  return points;
}

describe("browRect", () => {
  const aspect = 3 / 4;
  const landmarks = face({ cx: 0.5, cy: 0.36, halfWidth: 0.1, halfHeight: 0.012 });

  it("contains every brow point and stays inside the image", () => {
    const rect = browRect(landmarks, aspect)!;
    expect(rect).not.toBeNull();
    for (const key of ["x", "y"] as const) expect(rect[key]).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(rect.y + rect.h).toBeLessThanOrEqual(1 + 1e-9);
    for (const i of BROW_POINTS) {
      const p = landmarks[i]!;
      expect(p.x).toBeGreaterThanOrEqual(rect.x);
      expect(p.x).toBeLessThanOrEqual(rect.x + rect.w);
      expect(p.y).toBeGreaterThanOrEqual(rect.y);
      expect(p.y).toBeLessThanOrEqual(rect.y + rect.h);
    }
  });

  it("is wide and short, about 2.2 : 1 in pixels", () => {
    const rect = browRect(landmarks, aspect)!;
    const pixelRatio = (rect.w * aspect) / rect.h; // fractions of a 3:4 photo → pixels
    expect(pixelRatio).toBeGreaterThan(2);
    expect(pixelRatio).toBeLessThan(2.4);
  });

  it("slides back inside the image when the brows are near an edge", () => {
    const rect = browRect(face({ cx: 0.5, cy: 0.02, halfWidth: 0.1, halfHeight: 0.01 }), aspect)!;
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.h).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("gives up cleanly when the model returned too few points", () => {
    expect(browRect([], aspect)).toBeNull();
    expect(browRect(landmarks.slice(0, 200), aspect)).toBeNull();
  });
});

describe("pixelRect", () => {
  it("never returns an empty or out-of-bounds region", () => {
    for (const rect of [GUESS_RECT, { x: 0.99, y: 0.99, w: 0.5, h: 0.5 }, { x: 0, y: 0, w: 0, h: 0 }, { x: 0.4, y: 0.3, w: 0.2, h: 0.1 }]) {
      const { sx, sy, sw, sh } = pixelRect(rect, 768, 1024);
      expect(sw).toBeGreaterThanOrEqual(1);
      expect(sh).toBeGreaterThanOrEqual(1);
      expect(sx + sw).toBeLessThanOrEqual(768);
      expect(sy + sh).toBeLessThanOrEqual(1024);
    }
  });
});

describe("brow recipe", () => {
  it("starts from the shape the person described, in their darkness", () => {
    for (const p of manifest.personas) {
      const start = startingPoint(p.snapshot.brows);
      expect(shapeById(start.shapeId)?.shape).toBe(p.snapshot.brows.shape);
      expect(start.darkness).toBe(p.snapshot.brows.darkness);
    }
  });

  it("offers real shapes in every family", () => {
    for (const family of ["straight", "soft-arch", "high-arch", "rounded"] as const) expect(shapesIn(family).length).toBeGreaterThan(0);
  });

  it("builds a recipe that fits the plan's contract, with the note trimmed and capped", () => {
    const shape = shapesIn("soft-arch")[0]!;
    const recipe = buildRecipe(shape, "dark", `  ${"x".repeat(400)}  `);
    expect(recipe).toMatchObject({ catalogShapeId: shape.id, shapeName: shape.name, colourHex: browCatalog.colours.dark });
    expect(recipe.notes).toHaveLength(280);
    expect(buildRecipe(shape, "light", "   ").notes).toBeUndefined();
  });

  it("makes a preview job the API will accept, for every verified shape and colour", () => {
    for (const shape of browCatalog.shapes) {
      for (const darkness of ["light", "medium", "dark"] as const) {
        const parsed = JobSpec.safeParse(previewSpec(shape, darkness));
        expect(parsed.success, `${shape.id} ${darkness}`).toBe(true);
        const spec = parsed.data as Extract<JobSpec, { kind: "brows" }>;
        const { bands } = browCatalog;
        expect(spec.thickness).toBeGreaterThanOrEqual(bands.thickness.min);
        expect(spec.thickness).toBeLessThanOrEqual(bands.thickness.max);
        expect(spec.intensity).toBeLessThanOrEqual(bands.intensity.max);
      }
    }
  });
});

describe("pack with a brow recipe", () => {
  const base = { looks: [], snapshot: null, guides: insuranceGuides, programmes, sample: false } as const;
  it("has a brow page model only when a recipe was saved", () => {
    expect(buildPackModel({ ...base, plan: { budget: "mid", climate: "temperate" } }).brows).toBeUndefined();
    const recipe = buildRecipe(shapesIn("rounded")[0]!, "medium", "left brow sits higher");
    const model = buildPackModel({ ...base, plan: { budget: "mid", climate: "temperate", browRecipe: recipe } });
    expect(model.brows).toMatchObject({ shape: recipe.shapeName, thickness: recipe.thickness, note: "left brow sits higher" });
    expect(model.brows!.steps.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------- sample brows and regrowth items */

describe("sample brows and regrowth", () => {
  it("installs a person's genuine regrowth stages and brow preview only when asked, once", async () => {
    const persona = manifest.personas.find((p) => p.id === "amara")!;
    const id = await installDemo(persona);
    const before = await db.jobs.where("baselineId").equals(id).count();

    await installDemoItems("amara", DEMO_REGROWTH_KEYS);
    await installDemoItems("amara", [...DEMO_REGROWTH_KEYS, DEMO_BROWS_KEY]);
    await installDemoItems("amara", [DEMO_BROWS_KEY]);

    const rows = await db.jobs.where("baselineId").equals(id).toArray();
    expect(rows.length).toBe(before + 4);
    expect(rows.map((r) => r.routeKey).sort()).toEqual(expect.arrayContaining(["brows", "regrowth-12m", "regrowth-3m", "regrowth-6m"]));
    for (const row of rows.filter((r) => r.routeKey.startsWith("regrowth") || r.routeKey === "brows")) {
      expect(row.result).toBe("stored");
      expect(row.job?.provenance.mode).toBe("live");
      expect(await db.results.get(row.clientRequestId)).toBeTruthy();
    }
  });

  it("never lets regrowth stages leak into the three paths", async () => {
    for (const persona of manifest.personas) {
      const id = await installDemo(persona);
      await installDemoItems(persona.id, DEMO_REGROWTH_KEYS);
      expect((await demoRoutes(id)).map((r) => r.routeKey)).toEqual(["closest", "easier", "new-chapter"]);
    }
  });

  it("keeps the honest note on a stage that reuses an identical earlier result", async () => {
    const persona = manifest.personas.find((p) => p.id === "daniel")!;
    const id = await installDemo(persona);
    await installDemoItems("daniel", DEMO_REGROWTH_KEYS);
    const rows = await db.jobs.where("baselineId").equals(id).filter((r) => r.routeKey.startsWith("regrowth")).toArray();
    expect(rows.every((r) => r.note?.startsWith("Same style and colour as"))).toBe(true);
  });

  it("rejects an unknown person", async () => {
    await expect(installDemoItems("nobody", DEMO_REGROWTH_KEYS)).rejects.toThrow();
  });
});

/* ------------------------------------------------------------------ sharing */

describe("share images and labels", () => {
  it("fits a picture inside its cell without cropping it, centred", () => {
    const box = containBox(768, 1024, SHARE_CELL);
    expect(box.width / box.height).toBeCloseTo(768 / 1024, 1);
    expect(box.height).toBeLessThanOrEqual(SHARE_CELL.height);
    expect(box.width).toBeLessThanOrEqual(SHARE_CELL.width);
    // A wide picture is letterboxed, not cut.
    const wide = containBox(2000, 1000, SHARE_CELL);
    expect(wide.width).toBe(SHARE_CELL.width);
    expect(wide.y).toBeGreaterThan(0);
    // The right-hand cell starts where the left ends.
    expect(containBox(768, 1024, SHARE_CELL, SHARE_CELL.width).x).toBeGreaterThanOrEqual(SHARE_CELL.width);
  });

  it("gives every shared picture a distinct, short, plain label", () => {
    expect(uniqueLabels(["Short bob", "Short bob", "  Pixie  ", "Short bob"])).toEqual(["Short bob", "Short bob (2)", "Pixie", "Short bob (3)"]);
    expect(uniqueLabels([""])).toEqual(["Option"]);
    for (const label of uniqueLabels(["x".repeat(200), "x".repeat(200)])) expect(label.length).toBeLessThanOrEqual(80);
  });
});

describe("stopping a share", () => {
  const row = (token: string): ShareRow => ({
    token,
    ownerKey: `key-${token}`,
    url: `http://x/share/${token}`,
    labels: ["Short bob"],
    expiresAt: "2030-01-01T00:00:00.000Z",
    createdAt: "2029-01-01T00:00:00.000Z",
  });

  it("deletes on the server with the owner key, then forgets the link here", async () => {
    mockApi.revokeShare.mockResolvedValue({ deleted: true });
    const share = row("a".repeat(22));
    await db.shares.put(share);
    await stopSharing(share);
    expect(mockApi.revokeShare).toHaveBeenCalledWith(share.token, share.ownerKey);
    expect(await db.shares.count()).toBe(0);
  });

  it("treats a link that is already gone as stopped", async () => {
    mockApi.revokeShare.mockRejectedValue(new ApiError(errorBody("EXPIRED"), 410));
    const share = row("b".repeat(22));
    await db.shares.put(share);
    await stopSharing(share);
    expect(await db.shares.count()).toBe(0);
  });

  it("keeps the link when stopping really failed, so the person can try again", async () => {
    mockApi.revokeShare.mockRejectedValue(new ApiError(errorBody("YOUCAM_UNAVAILABLE"), 502));
    const share = row("c".repeat(22));
    await db.shares.put(share);
    await expect(stopSharing(share)).rejects.toBeInstanceOf(ApiError);
    expect(await db.shares.count()).toBe(1);
  });

  it("stops every link for 'delete everything', even when one can't be reached", async () => {
    mockApi.revokeShare.mockImplementation(async (token: string) => {
      if (token.startsWith("d")) throw new ApiError(errorBody("YOUCAM_UNAVAILABLE"), 502);
      return { deleted: true };
    });
    await db.shares.bulkPut([row("d".repeat(22)), row("e".repeat(22))]);
    await expect(stopAllSharing()).resolves.toBeUndefined();
    expect(mockApi.revokeShare).toHaveBeenCalledTimes(2);
    expect((await db.shares.toArray()).map((s) => s.token)).toEqual(["d".repeat(22)]);
  });
});

/* ---------------------------------------------------------------- partners */

describe("partner catalogue format", () => {
  it("the checked-in JSON schema is the one the catalogue is validated with", () => {
    const file = JSON.parse(readFileSync(join(root, "docs", "partner-catalog.schema.json"), "utf8"));
    expect(file).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(StyleCatalog))));
  });

  it("the page's example entry is a valid catalogue entry", () => {
    expect(StyleCatalog.safeParse([styles.find((s) => s.id === "short-bob")]).success).toBe(true);
  });
});
