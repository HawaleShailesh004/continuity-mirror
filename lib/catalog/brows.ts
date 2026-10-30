// Brow Record helpers (P1): map the user's own brow description to the closest catalog shape. Pure.
import type { IdentitySnapshot } from "@/lib/contracts/domain";
import browsJson from "./brows.json";
import { BrowCatalog, type BrowCatalogItem } from "./schema";

const catalog = BrowCatalog.parse(browsJson);

/**
 * The catalog shape closest to the user's described brows: same shape family, thickness "balanced"
 * first (the snapshot doesn't ask about thickness), then the catalog's own order. Always returns one.
 */
export function closestBrowShape(brows: IdentitySnapshot["brows"], thickness: BrowCatalogItem["thickness"] = "balanced"): BrowCatalogItem {
  const family = catalog.shapes.filter((s) => s.shape === brows.shape);
  return family.find((s) => s.thickness === thickness) ?? family[0] ?? catalog.shapes[0]!;
}

/** Brow colour for the Brow Record when the user didn't pick one from their photo. */
export function defaultBrowHex(darkness: IdentitySnapshot["brows"]["darkness"]): string {
  return catalog.colours[darkness];
}
