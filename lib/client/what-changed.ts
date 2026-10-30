/*
 * "What changed" for one path, in a few words, from facts we already have:
 * the person's own snapshot against the style (and colour) the path used.
 * Pure, so a first-time viewer can say what changed without opening the card.
 */
import { copy } from "@/content/copy";
import type { ColourPreset, StyleCatalogItem } from "@/lib/catalog";
import type { IdentitySnapshot, RouteColour } from "@/lib/contracts";

const LENGTHS = ["buzz", "short", "chin", "shoulder", "long"] as const;
const TEXTURES = ["straight", "wavy", "curly", "coily"] as const;

export type WhatChanged = {
  /** Things that differ from the person's own hair, most visible first (at most three). */
  changes: string[];
  /** One line to show: the changes, or what stayed the same. */
  line: string;
};

export function whatChanged(
  style: Pick<StyleCatalogItem, "length" | "texture" | "fringe">,
  colour: RouteColour,
  snapshot: IdentitySnapshot,
  presets: readonly Pick<ColourPreset, "id" | "label">[],
): WhatChanged {
  const t = copy.paths.changed;
  const changes: string[] = [];

  const dLen = LENGTHS.indexOf(style.length) - LENGTHS.indexOf(snapshot.length);
  if (dLen < 0) changes.push(t.shorter(copy.snapshot.options.length[style.length].toLowerCase()));
  if (dLen > 0) changes.push(t.longer(copy.snapshot.options.length[style.length].toLowerCase()));

  const dTex = TEXTURES.indexOf(style.texture) - TEXTURES.indexOf(snapshot.texture);
  if (dTex < 0) changes.push(t.smoother);
  if (dTex > 0) changes.push(t.moreTexture);

  if (style.fringe && !snapshot.fringe) changes.push(t.addsFringe);
  if (!style.fringe && snapshot.fringe) changes.push(t.noFringe);

  if (colour.source === "preset") {
    const id = colour.presetId;
    changes.push(t.colour(presets.find((c) => c.id === id)?.label.toLowerCase() ?? ""));
  }

  const kept = colour.source === "own";
  const line = changes.length === 0 ? (kept ? t.sameKept : t.same) : [...changes.slice(0, 3), ...(kept ? [t.keptColour] : [])].slice(0, 3).join(" · ");
  return { changes: changes.slice(0, 3), line };
}
