// Domain types shared by frontend and backend. Pure Zod: safe to import in the browser.
// Changing anything here after the contract freeze (Tue 27 Oct, 1 PM IST) needs an ADR.
import { z } from "zod";

export const Hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "expected #RRGGBB")
  .transform((s) => s.toUpperCase())
  .meta({ id: "Hex", example: "#1C1714" });
export type Hex = z.infer<typeof Hex>;

export const ColourFamily = z
  .enum(["black", "dark-brown", "brown", "light-brown", "blonde", "red", "grey", "other"])
  .meta({ id: "ColourFamily" });
export const HairLength = z.enum(["buzz", "short", "chin", "shoulder", "long"]).meta({ id: "HairLength" });
export const Parting = z.enum(["left", "right", "centre", "none"]).meta({ id: "Parting" });
export const Texture = z.enum(["straight", "wavy", "curly", "coily"]).meta({ id: "Texture" });
export const BrowShape = z.enum(["straight", "soft-arch", "high-arch", "rounded"]).meta({ id: "BrowShape" });
export const BrowDarkness = z.enum(["light", "medium", "dark"]).meta({ id: "BrowDarkness" });
export const Beard = z.enum(["none", "stubble", "short", "full"]).meta({ id: "Beard" });

/** User-authored, never inferred. */
export const IdentitySnapshot = z
  .strictObject({
    colourFamily: ColourFamily,
    /** Picked with "tap your hair" on the baseline; drives the colour-restore step. */
    hairHex: Hex.optional(),
    length: HairLength,
    parting: Parting,
    fringe: z.boolean(),
    texture: Texture,
    brows: z.strictObject({ shape: BrowShape, darkness: BrowDarkness }),
    beard: Beard.optional(),
    note: z.string().max(140).optional(),
  })
  .meta({ id: "IdentitySnapshot" });
export type IdentitySnapshot = z.infer<typeof IdentitySnapshot>;

export const RouteId = z
  .enum(["closest", "easier", "new-chapter", "regrowth-3m", "regrowth-6m", "regrowth-12m", "custom"])
  .meta({ id: "RouteId" });
export type RouteId = z.infer<typeof RouteId>;

/** The single dimension a "New chapter" route changes. */
export const ChangedDimension = z.enum(["length", "colour", "fringe", "texture"]).meta({ id: "ChangedDimension" });
export type ChangedDimension = z.infer<typeof ChangedDimension>;

export const CatalogId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "catalog ids are lowercase slugs")
  .meta({ id: "CatalogId" });

export const Verdict = z
  .strictObject({
    routeKey: z.string().min(1),
    feelsLikeMe: z.enum(["yes", "unsure", "no"]),
    unwantedChanges: z.array(z.enum(["colourFamily", "length", "parting", "fringe", "texture", "brows", "beard"])),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "Verdict" });
export type Verdict = z.infer<typeof Verdict>;

export const BrowRecipe = z
  .strictObject({
    catalogShapeId: z.string().min(1),
    shapeName: z.string(),
    thickness: z.string(),
    colourHex: Hex,
    notes: z.string().max(280).optional(),
  })
  .meta({ id: "BrowRecipe" });
export type BrowRecipe = z.infer<typeof BrowRecipe>;

export const Plan = z
  .strictObject({
    shortlist: z.array(z.string()),
    browRecipe: BrowRecipe.optional(),
    budget: z.enum(["low", "mid", "high"]),
    climate: z.enum(["hot", "temperate", "cold"]),
    careEffort: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    country: z.enum(["US", "CA", "IN", "UK", "other"]).optional(),
    checklist: z.record(z.string(), z.boolean()),
  })
  .meta({ id: "Plan" });
export type Plan = z.infer<typeof Plan>;
