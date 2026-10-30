// Catalog schemas (shared). The JSON files beside this are validated against them in tests.
import { z } from "zod";
import { BrowShape, CatalogId, ColourFamily, HairLength, Hex, Parting, Texture } from "@/lib/contracts/domain";

/**
 * Two style sources (B0 stage 3):
 * - template: a YouCam hair-transfer template. Colour drifts darker/cooler, so "own colour" adds a Hair Color pass.
 * - reference: a YouCam-generated reference image (public/catalog/refs). Custom mode + `hair_color: 'src'`
 *   keeps colour and coily texture in one step.
 */
export const StyleSource = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("template"), templateId: z.string().min(1), keepsUsersColour: z.boolean() }),
  z.strictObject({ source: z.literal("reference"), refPath: z.string().startsWith("/catalog/refs/") }),
]);

export const StyleCatalogItem = z
  .strictObject({
    id: CatalogId,
    label: z.string().min(1),
    style: StyleSource,
    thumbnail: z.string().startsWith("/"),
    audience: z.enum(["female", "male", "all"]),
    length: HairLength,
    fringe: z.boolean(),
    parting: Parting,
    texture: Texture,
    careEffort: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** Shop-language spec for a wig fitter. */
    askFor: z.string().min(1),
    wigNotes: z.strictObject({ fibres: z.array(z.string()), caps: z.array(z.string()), comfort: z.array(z.string()) }),
    priceBand: z.enum(["low", "mid", "high"]),
    /** Locs, braids and similar: a different look rather than the person's own hair. Offered as variants, never as "closest". */
    protective: z.boolean().default(false),
    /** false until a human has reviewed the tags (B4). */
    reviewed: z.boolean(),
  })
  .meta({ id: "StyleCatalogItem" });
export type StyleCatalogItem = z.infer<typeof StyleCatalogItem>;

export const ColourPreset = z
  .strictObject({
    id: CatalogId,
    label: z.string().min(1),
    family: ColourFamily,
    /** One hex for `full`, two (root → ends) for `ombre`. */
    hexes: z.array(Hex).min(1).max(2),
    use: z.array(z.enum(["family-default", "softer", "new-chapter", "regrowth"])).min(1),
  })
  .meta({ id: "ColourPreset" });
export type ColourPreset = z.infer<typeof ColourPreset>;

export const BrowCatalogItem = z
  .strictObject({
    /** YouCam's eyebrow `label` (e.g. SoftArch1), as sent in the makeup-vto `pattern.name`. */
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    name: z.string().min(1),
    shape: BrowShape,
    thickness: z.enum(["thin", "balanced", "thick"]),
    description: z.string().min(1),
  })
  .meta({ id: "BrowCatalogItem" });
export type BrowCatalogItem = z.infer<typeof BrowCatalogItem>;

const Band = z.strictObject({ min: z.int(), max: z.int() }).refine((b) => b.min <= b.max, "min must not exceed max");

export const BrowCatalog = z.strictObject({
  source: z.string(),
  shapes: z.array(BrowCatalogItem).min(1),
  /** The server clamps request sliders into these (within the contract's own ranges). */
  bands: z.strictObject({ curvature: Band, thickness: Band, definition: Band, intensity: Band }),
  defaults: z.strictObject({ curvature: z.int(), thickness: z.int(), definition: z.int(), intensity: z.int() }),
  colours: z.strictObject({ light: Hex, medium: Hex, dark: Hex }),
});
export type BrowCatalog = z.infer<typeof BrowCatalog>;

/** One of YouCam's Bangs templates (GET /s2s/v2.0/task/template/hair-bang), verified 30 Oct 2026. */
export const FringeCatalogItem = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9_]{1,64}$/),
    label: z.string().min(1),
    audience: z.enum(["female", "male"]),
    /** Offered first. */
    suggested: z.boolean().optional(),
  })
  .meta({ id: "FringeCatalogItem" });
export type FringeCatalogItem = z.infer<typeof FringeCatalogItem>;
export const FringeCatalog = z.array(FringeCatalogItem).min(1);

export const StyleCatalog = z.array(StyleCatalogItem);
export const ColourCatalog = z.array(ColourPreset);
