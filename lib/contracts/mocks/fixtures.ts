// Fixture data for mocks and static screens. Images are AI-generated sample people (docs/ASSETS.md)
// and genuine YouCam outputs from the B0 spike. The full demo manifest arrives in B5 (public/demo).
import type { JobSpec } from "../api";
import type { IdentitySnapshot } from "../domain";

export type FixturePersona = {
  id: "meera" | "amara" | "daniel" | "grace";
  name: string;
  pronouns: string;
  age: number;
  /** Normalised exactly like the server does (JPEG, long side 1024): 768 × 1024. */
  baseline: string;
  /** Provisional tags; B5 records the reviewed snapshot in the demo manifest. */
  snapshot: IdentitySnapshot;
};

export const PERSONAS: readonly FixturePersona[] = [
  {
    id: "meera",
    name: "Meera",
    pronouns: "she/her",
    age: 41,
    baseline: "/mock/personas/meera.jpg",
    snapshot: {
      colourFamily: "dark-brown",
      hairHex: "#2A1D18",
      length: "shoulder",
      parting: "left",
      fringe: false,
      texture: "straight",
      brows: { shape: "soft-arch", darkness: "dark" },
    },
  },
  {
    id: "amara",
    name: "Amara",
    pronouns: "she/her",
    age: 32,
    baseline: "/mock/personas/amara.jpg",
    snapshot: {
      colourFamily: "black",
      hairHex: "#1C1714",
      length: "shoulder",
      parting: "none",
      fringe: false,
      texture: "coily",
      brows: { shape: "soft-arch", darkness: "dark" },
    },
  },
  {
    id: "daniel",
    name: "Daniel",
    pronouns: "he/him",
    age: 29,
    baseline: "/mock/personas/daniel.jpg",
    snapshot: {
      colourFamily: "brown",
      hairHex: "#402E22",
      length: "short",
      parting: "none",
      fringe: false,
      texture: "curly",
      brows: { shape: "straight", darkness: "dark" },
      beard: "short",
    },
  },
  {
    id: "grace",
    name: "Grace",
    pronouns: "she/her",
    age: 58,
    baseline: "/mock/personas/grace.jpg",
    snapshot: {
      colourFamily: "grey",
      hairHex: "#BEBDB8",
      length: "chin",
      parting: "none",
      fringe: true,
      texture: "straight",
      brows: { shape: "soft-arch", darkness: "light" },
    },
  },
];

export const RESULT_IMAGES = {
  shortBob: "/mock/results/meera__all_short_bob.jpg",
  brows: "/mock/results/meera__brows-SoftArch1.jpg",
  curlyBobTemplateColour: "/mock/results/amara__female_bobcut_curly.jpg",
  curlyBobOwnColour: "/mock/results/amara__bobcut_curly__colour-1C1714.jpg",
  coilyChin: "/mock/results/amara__custom-coily-chin.jpg",
  texturedComma: "/mock/results/daniel__male_textured_comma.jpg",
  pixieTemplateColour: "/mock/results/grace__all_pixie.jpg",
  pixieOwnColour: "/mock/results/grace__pixie__colour-BEBDB8.jpg",
} as const;

/** Which genuine B0 result stands in for a spec in mock mode. */
export function pickResultImage(spec: JobSpec): string {
  if (spec.kind === "brows") return RESULT_IMAGES.brows;
  if (spec.kind === "colour") return RESULT_IMAGES.curlyBobOwnColour;
  const own = spec.colour.source === "own";
  switch (spec.styleId) {
    case "pixie":
      return own ? RESULT_IMAGES.pixieOwnColour : RESULT_IMAGES.pixieTemplateColour;
    case "bixie":
      return RESULT_IMAGES.pixieTemplateColour;
    case "bob-curly":
      return own ? RESULT_IMAGES.curlyBobOwnColour : RESULT_IMAGES.curlyBobTemplateColour;
    case "coily-chin":
      return RESULT_IMAGES.coilyChin;
    case "textured-comma":
    case "buzz":
      return RESULT_IMAGES.texturedComma;
    default:
      return RESULT_IMAGES.shortBob;
  }
}
