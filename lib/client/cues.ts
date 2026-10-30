import { copy } from "@/content/copy";
import type { IdentitySnapshot, Verdict } from "@/lib/contracts";

export type CueKey = Verdict["unwantedChanges"][number];
export type Cue = { key: CueKey; label: string };

/**
 * The things the user said make their hair look like them, as short labels
 * for the "does this still feel like you?" checklist. Built only from what
 * they told us (the Identity Snapshot), never inferred from the photo.
 */
export function cuesFromSnapshot(snapshot: IdentitySnapshot): Cue[] {
  const o = copy.snapshot.options;
  const cues: Cue[] = [
    { key: "colourFamily", label: o.colourFamily[snapshot.colourFamily] },
    { key: "length", label: o.length[snapshot.length] },
    { key: "texture", label: o.texture[snapshot.texture] },
    { key: "fringe", label: snapshot.fringe ? o.fringe.yes : o.fringe.no },
    { key: "parting", label: o.parting[snapshot.parting] },
    { key: "brows", label: `${o.browShape[snapshot.brows.shape]} brows` },
  ];
  if (snapshot.beard && snapshot.beard !== "none") {
    cues.push({ key: "beard", label: `${o.beard[snapshot.beard]} beard` });
  }
  return cues;
}
