/*
 * The "what to ask for" sentence for a saved look. The template supplies only
 * length and shape; parting, fringe and colour come from what the person told us
 * (their Identity Snapshot), so the words never describe someone else's hair.
 */
import { copy } from "@/content/copy";
import type { StyleCatalogItem } from "@/lib/catalog";
import type { IdentitySnapshot } from "@/lib/contracts";

// ", messy fringe" · " with a long wispy fringe" · " and a fringe"
const FRINGE_CLAUSE = /(?:,\s*|\s+with\s+|\s+and\s+)(?:an?\s+)?(?:[\w-]+\s+){0,2}(?:fringe|bangs)\b/gi;
// "with a fringe and soft waves" keeps "with soft waves"
const FRINGE_THEN_AND = /\bwith\s+(?:an?\s+)?(?:[\w-]+\s+){0,2}(?:fringe|bangs)\s+and\s+/gi;
const PARTING_CLAUSE = /(?:,\s*|\s+with\s+an?\s+|\s+)(?:centre|center|side)\s+parting\b/gi;

/** The template's own wording with its parting and fringe taken out: length and shape remain. */
export function shapeOnly(askFor: string): string {
  return askFor
    .replace(FRINGE_THEN_AND, "with ")
    .replace(FRINGE_CLAUSE, "")
    .replace(PARTING_CLAUSE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[,\s]+$/, "")
    .trim();
}

export function askForLine(style: StyleCatalogItem, snapshot: IdentitySnapshot | null | undefined, ownColour: boolean): string {
  const base = shapeOnly(style.askFor);
  // Without answers there is nothing to add; say only what the template can say.
  if (!snapshot) return base;
  const p = copy.plan.askForParts;
  const parts = [base];
  if (style.length !== "buzz") {
    if (snapshot.parting !== "none") parts.push(p.parting[snapshot.parting]);
    parts.push(snapshot.fringe ? p.fringeYes : p.fringeNo);
  }
  if (ownColour) parts.push(p.colour(snapshot.colourFamily === "other" ? null : copy.snapshot.options.colourFamily[snapshot.colourFamily].toLowerCase()));
  return parts.join(", ");
}
