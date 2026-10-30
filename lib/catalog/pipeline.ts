// Spec → YouCam steps. Pure and isomorphic: the server mapper (B3) fills the placeholders with real
// file ids/URLs; the mocks use the bodies as-is for provenance. Bodies match docs/YOUCAM_FACTS.md.
import type { JobSpec, StepKind } from "@/lib/contracts/api";
import type { ColourPreset, StyleCatalogItem } from "./schema";

/** Placeholders the server mapper replaces. Never real ids in shared code or provenance. */
export const SRC_BASELINE = "<baseline>";
export const SRC_PREVIOUS = "<previous step result>";
export const SRC_STYLE_REF = "<style reference>";

export const STEP_META: Record<StepKind, { endpoint: string; apiVersion: string; units: number }> = {
  "hair-transfer": { endpoint: "/s2s/v2.1/task/hair-transfer", apiVersion: "v2.1", units: 2 },
  "hair-color": { endpoint: "/s2s/v2.0/task/hair-color", apiVersion: "v2.0", units: 1 },
  "makeup-vto": { endpoint: "/s2s/v2.0/task/makeup-vto", apiVersion: "v2.0", units: 1 },
};

export type PlannedStep = {
  kind: StepKind;
  endpoint: string;
  apiVersion: string;
  units: number;
  /** YouCam request body with placeholders for sources. */
  body: Record<string, unknown>;
};

export type CatalogLookup = {
  style(id: string): StyleCatalogItem | undefined;
  colour(id: string): ColourPreset | undefined;
  brow(id: string): { id: string } | undefined;
  /** Slider bands the request is clamped into (inside the contract's own ranges). */
  browBands: Record<"curvature" | "thickness" | "definition" | "intensity", { min: number; max: number }>;
};

const clamp = (value: number, band: { min: number; max: number }) => Math.min(band.max, Math.max(band.min, value));

export class UnknownCatalogIdError extends Error {
  constructor(readonly field: string, readonly id: string) {
    super(`unknown ${field}: ${id}`);
  }
}

// Verified 26 Oct: intensity 80 / shine 20 restores colour faithfully on a hair-transfer result.
const RESTORE = { color_intensity: 80, shine_intensity: 20 };
// Ombre defaults are from the OpenAPI spec, not yet verified live.
const OMBRE_PATTERN = { name: "ombre", blend_strength: 50, line_offset: 0, coloring_section: "top" };

function step(kind: StepKind, body: Record<string, unknown>): PlannedStep {
  return { kind, ...STEP_META[kind], body };
}

function colourBody(src: Record<string, string>, hexes: string[], mode: "full" | "ombre") {
  const palettes = (mode === "ombre" ? hexes.slice(0, 2) : hexes.slice(0, 1)).map((color) => ({ color, ...RESTORE }));
  if (mode === "ombre" && palettes.length === 1) palettes.push({ ...palettes[0]! });
  return { ...src, pattern: mode === "ombre" ? OMBRE_PATTERN : { name: "full" }, palettes };
}

function presetOrThrow(catalog: CatalogLookup, id: string) {
  const preset = catalog.colour(id);
  if (!preset) throw new UnknownCatalogIdError("presetId", id);
  return preset;
}

export function planSteps(spec: JobSpec, catalog: CatalogLookup): PlannedStep[] {
  switch (spec.kind) {
    case "route": {
      const item = catalog.style(spec.styleId);
      if (!item) throw new UnknownCatalogIdError("styleId", spec.styleId);
      const style = item.style;
      const transfer =
        style.source === "template"
          ? step("hair-transfer", { src_file_id: SRC_BASELINE, template_id: style.templateId })
          : step("hair-transfer", {
              src_file_id: SRC_BASELINE,
              ref_file_id: SRC_STYLE_REF,
              // Custom mode keeps the user's colour itself unless a new colour is wanted.
              ...(spec.colour.source === "own" ? { hair_color: "src" } : {}),
            });
      const src = { src_file_url: SRC_PREVIOUS };
      if (spec.colour.source === "template") return [transfer];
      if (spec.colour.source === "own") {
        return style.source === "reference" ? [transfer] : [transfer, step("hair-color", colourBody(src, [spec.colour.hex], "full"))];
      }
      const preset = presetOrThrow(catalog, spec.colour.presetId);
      return [transfer, step("hair-color", colourBody(src, preset.hexes, spec.colour.mode))];
    }
    case "colour": {
      const preset = presetOrThrow(catalog, spec.colour.presetId);
      return [step("hair-color", colourBody({ src_file_id: SRC_BASELINE }, preset.hexes, spec.colour.mode))];
    }
    case "brows": {
      if (!catalog.brow(spec.browShapeId)) throw new UnknownCatalogIdError("browShapeId", spec.browShapeId);
      const bands = catalog.browBands;
      return [
        step("makeup-vto", {
          src_file_id: SRC_BASELINE,
          version: "1.0",
          effects: [
            {
              category: "eyebrows",
              pattern: {
                type: "shape",
                name: spec.browShapeId,
                curvature: clamp(spec.curvature, bands.curvature),
                thickness: clamp(spec.thickness, bands.thickness),
                definition: clamp(spec.definition, bands.definition),
              },
              palettes: [{ color: spec.colourHex, texture: "matte", colorIntensity: clamp(spec.intensity, bands.intensity) }],
            },
          ],
        }),
      ];
    }
  }
}

export function estimateUnits(spec: JobSpec, catalog: CatalogLookup): number {
  return planSteps(spec, catalog).reduce((sum, s) => sum + s.units, 0);
}
