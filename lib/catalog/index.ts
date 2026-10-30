// Validated catalog, importable on both sides. JSON is parsed once at module load; a bad edit fails fast.
import browsJson from "./brows.json";
import coloursJson from "./colours.json";
import stylesJson from "./styles.json";
import type { CatalogLookup } from "./pipeline";
import { BrowCatalog, ColourCatalog, StyleCatalog, type ColourPreset, type StyleCatalogItem } from "./schema";

export const styles: readonly StyleCatalogItem[] = StyleCatalog.parse(stylesJson);
export const colours: readonly ColourPreset[] = ColourCatalog.parse(coloursJson);
export const brows: BrowCatalog = BrowCatalog.parse(browsJson);

const styleById = new Map(styles.map((s) => [s.id, s]));
const colourById = new Map(colours.map((c) => [c.id, c]));
const browById = new Map(brows.shapes.map((b) => [b.id, b]));

export const catalog: CatalogLookup = {
  style: (id) => styleById.get(id),
  colour: (id) => colourById.get(id),
  brow: (id) => browById.get(id),
  browBands: brows.bands,
};

export * from "./schema";
export * from "./pipeline";
export * from "./brows";
export { programmes, insuranceGuides, Programme, InsuranceGuide, Country as ProgrammeCountry } from "./resources";
