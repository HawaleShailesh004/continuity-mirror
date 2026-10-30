import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brows, catalog, closestBrowShape, colours, defaultBrowHex, estimateUnits, planSteps, styles, UnknownCatalogIdError, SRC_BASELINE, SRC_PREVIOUS } from "@/lib/catalog";
import { JobSpec, type RouteColour } from "@/lib/contracts/api";

const route = (styleId: string, colour: RouteColour) => JobSpec.parse({ kind: "route", routeId: "closest", styleId, colour });

const templates = Array.from({ length: 6 }, (_, i) => {
  const f = JSON.parse(readFileSync(join(process.cwd(), `tests/fixtures/youcam/templates/page-${i}.json`), "utf8"));
  return f.data.body.data.templates as { id: string; keep_users_color: boolean }[];
}).flat();

describe("catalog data", () => {
  it("has unique ids and existing images", () => {
    expect(new Set(styles.map((s) => s.id)).size).toBe(styles.length);
    expect(new Set(colours.map((c) => c.id)).size).toBe(colours.length);
    for (const s of styles) {
      expect(existsSync(join(process.cwd(), "public", s.thumbnail)), s.thumbnail).toBe(true);
      if (s.style.source === "reference") expect(existsSync(join(process.cwd(), "public", s.style.refPath))).toBe(true);
    }
  });

  it("only uses real YouCam templates, with the template's own keep_users_color", () => {
    for (const s of styles) {
      if (s.style.source !== "template") continue;
      const t = templates.find((x) => x.id === (s.style as { templateId: string }).templateId);
      expect(t, s.id).toBeDefined();
      expect(s.style.keepsUsersColour).toBe(t!.keep_users_color);
    }
  });

  it("never includes bald templates", () => {
    expect(styles.some((s) => s.style.source === "template" && /bald/.test(s.style.templateId))).toBe(false);
  });

  it("has a default colour for every family except other", () => {
    for (const family of ["black", "dark-brown", "brown", "light-brown", "blonde", "red", "grey"]) {
      expect(colours.some((c) => c.family === family && c.use.includes("family-default")), family).toBe(true);
    }
  });
});

describe("brows catalog", () => {
  const eyebrows: { label: string; category: string; shape?: string; thickness?: string }[] = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/youcam/catalogs/eyebrows.json"), "utf8")).data;
  const CATEGORY = { straight: "Straight", "soft-arch": "Soft Arch", "high-arch": "High Arch", rounded: "Curved" } as const;

  it("lists only real YouCam shapes whose category and thickness match the metadata", () => {
    expect(eyebrows).toHaveLength(350);
    for (const b of brows.shapes) {
      const real = eyebrows.find((e) => e.label === b.id);
      expect(real, b.id).toBeDefined();
      expect(real!.category, b.id).toBe(CATEGORY[b.shape]);
      expect(real!.thickness?.toLowerCase(), b.id).toBe(b.thickness);
    }
  });

  it("covers every brow shape the snapshot can describe, and picks balanced thickness first", () => {
    for (const shape of ["straight", "soft-arch", "high-arch", "rounded"] as const) {
      const pick = closestBrowShape({ shape, darkness: "medium" });
      expect(pick.shape).toBe(shape);
      expect(pick.thickness).toBe("balanced");
      expect(closestBrowShape({ shape, darkness: "medium" }, "thick").thickness).toBe("thick");
    }
    expect(defaultBrowHex("dark")).toBe("#2B1E16");
  });

  it("rejects unknown shapes and clamps sliders into the bands (provenance shows the clamped values)", () => {
    const base = { kind: "brows", browShapeId: "SoftArch1", curvature: 100, thickness: -100, definition: 100, colourHex: "#2B1E16", intensity: 100 } as const;
    const body = planSteps(JobSpec.parse(base), catalog)[0]!.body as { effects: [{ pattern: Record<string, number>; palettes: [{ colorIntensity: number }] }] };
    expect(body.effects[0].pattern).toMatchObject({ curvature: brows.bands.curvature.max, thickness: brows.bands.thickness.min, definition: 100 });
    expect(body.effects[0].palettes[0].colorIntensity).toBe(brows.bands.intensity.max);
    expect(() => planSteps(JobSpec.parse({ ...base, browShapeId: "NotAShape" }), catalog)).toThrow(UnknownCatalogIdError);
  });

  it("bands sit inside the contract's ranges", () => {
    expect(brows.bands.curvature.min).toBeGreaterThanOrEqual(-100);
    expect(brows.bands.thickness.max).toBeLessThanOrEqual(100);
    expect(brows.bands.definition.min).toBeGreaterThanOrEqual(0);
    expect(brows.bands.intensity.max).toBeLessThanOrEqual(100);
  });
});

describe("planSteps", () => {
  it("template + own colour = hair-transfer then hair-color restore with the user's hex (3 units)", () => {
    const steps = planSteps(route("short-bob", { source: "own", hex: "#3b2a20" }), catalog);
    expect(steps.map((s) => s.kind)).toEqual(["hair-transfer", "hair-color"]);
    expect(steps[0]!.body).toEqual({ src_file_id: SRC_BASELINE, template_id: "all_short_bob" });
    expect(steps[1]!.body).toEqual({
      src_file_url: SRC_PREVIOUS,
      pattern: { name: "full" },
      palettes: [{ color: "#3B2A20", color_intensity: 80, shine_intensity: 20 }],
    });
    expect(estimateUnits(route("short-bob", { source: "own", hex: "#3b2a20" }), catalog)).toBe(3);
  });

  it("reference + own colour = one custom-mode step with hair_color src (2 units)", () => {
    const spec = route("coily-chin", { source: "own", hex: "#1C1714" });
    const steps = planSteps(spec, catalog);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.body).toMatchObject({ ref_file_id: expect.any(String), hair_color: "src" });
    expect(estimateUnits(spec, catalog)).toBe(2);
  });

  it("template colour = one step; preset ombre = two palettes", () => {
    expect(planSteps(route("pixie", { source: "template" }), catalog)).toHaveLength(1);
    const ombre = planSteps(route("pixie", { source: "preset", presetId: "brown-to-caramel", mode: "ombre" }), catalog)[1]!;
    expect(ombre.body.pattern).toMatchObject({ name: "ombre" });
    expect(ombre.body.palettes).toHaveLength(2);
  });

  it("colour and brows jobs are one 1-unit step on the baseline", () => {
    const colour = JobSpec.parse({ kind: "colour", colour: { presetId: "soft-copper", mode: "full" } });
    const brows = JobSpec.parse({ kind: "brows", browShapeId: "SoftArch1", curvature: 0, thickness: 10, definition: 40, colourHex: "#2B1E16", intensity: 60 });
    expect(estimateUnits(colour, catalog)).toBe(1);
    expect(planSteps(brows, catalog)[0]).toMatchObject({ kind: "makeup-vto", endpoint: "/s2s/v2.0/task/makeup-vto" });
  });

  it("rejects ids that aren't in the catalog", () => {
    expect(() => planSteps(route("not-a-style", { source: "template" }), catalog)).toThrow(UnknownCatalogIdError);
    expect(() => planSteps(route("pixie", { source: "preset", presetId: "nope", mode: "full" }), catalog)).toThrow(UnknownCatalogIdError);
  });

  it("produces a valid plan for every style × colour source", () => {
    for (const s of styles) {
      for (const colour of [{ source: "own", hex: "#123456" }, { source: "template" }, { source: "preset", presetId: "red", mode: "full" }] as const) {
        const steps = planSteps(route(s.id, colour), catalog);
        expect(steps[0]!.kind).toBe("hair-transfer");
        expect(steps.length).toBeLessThanOrEqual(2); // baseline → style → (colour), never deeper
      }
    }
  });
});
