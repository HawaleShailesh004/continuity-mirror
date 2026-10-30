// Validated catalog, importable on both sides. JSON is parsed once at module load; a bad edit fails fast.
import browsJson from "./brows.json";
import coloursJson from "./colours.json";
import fringesJson from "./fringes.json";
import stylesJson from "./styles.json";
import type { CatalogLookup } from "./pipeline";
import { BrowCatalog, ColourCatalog, FringeCatalog, StyleCatalog, type ColourPreset, type FringeCatalogItem, type StyleCatalogItem } from "./schema";

export const styles: readonly StyleCatalogItem[] = StyleCatalog.parse(stylesJson);
export const colours: readonly ColourPreset[] = ColourCatalog.parse(coloursJson);
export const brows: BrowCatalog = BrowCatalog.parse(browsJson);

export const fringes: readonly FringeCatalogItem[] = FringeCatalog.parse(fringesJson);

const styleById = new Map(styles.map((s) => [s.id, s]));
const colourById = new Map(colours.map((c) => [c.id, c]));
const fringeById = new Map(fringes.map((f) => [f.id, f]));
const browById = new Map(brows.shapes.map((b) => [b.id, b]));

export const catalog: CatalogLookup = {
  style: (id) => styleById.get(id),
  colour: (id) => colourById.get(id),
  brow: (id) => browById.get(id),
  fringe: (id) => fringeById.get(id),
  browBands: brows.bands,
};

/** The fringes to offer first for who is looking (same audience values as the planner). */
export function suggestedFringes(audience: "female" | "male" | "all" = "all"): FringeCatalogItem[] {
  return fringes.filter((f) => f.suggested && (audience === "all" || f.audience === audience));
}

export * from "./schema";
export * from "./pipeline";
export * from "./brows";
export { programmes, insuranceGuides, Programme, InsuranceGuide, Country as ProgrammeCountry } from "./resources";
