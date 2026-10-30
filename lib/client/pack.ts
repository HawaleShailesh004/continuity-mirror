/*
 * The consultation pack's content as plain data (frontend plan §4.1, Module I),
 * built from the plan and the user's own answers. Pure, so it is unit-tested;
 * the PDF component only draws it. Nothing here goes to a server.
 */
import { copy } from "@/content/copy";
import type { InsuranceGuide, Programme, StyleCatalogItem } from "@/lib/catalog";
import type { IdentitySnapshot, Plan } from "@/lib/contracts";
import { cuesFromSnapshot } from "./cues";

export type PackLook = {
  name: string;
  askFor: string;
  fibres: readonly string[];
  caps: readonly string[];
  comfort: readonly string[];
  upkeep: string;
  price: string;
  ownColour: boolean;
};

export type PackModel = {
  looks: PackLook[];
  /** What makes the hair look like them: their own words, as chips. */
  cues: string[];
  note?: string;
  hairHex?: string;
  situation: { budget: string; climate: string; upkeep: string };
  climateNote: string;
  questions: readonly string[];
  guide?: { title: string; intro: string; steps: { text: string; ours: boolean }[]; asOf: string };
  programmes: { name: string; summary: string; contact?: string; checkNote?: string; asOf: string }[];
  /** The Brow Record, once the person has saved a recipe. */
  brows?: { shape: string; thickness: string; colourHex: string; note?: string; steps: readonly string[] };
  sample: boolean;
};

export function buildPackModel(input: {
  looks: readonly { style: StyleCatalogItem; ownColour: boolean }[];
  snapshot: IdentitySnapshot | null | undefined;
  plan: Pick<Plan, "budget" | "climate" | "careEffort" | "country" | "browRecipe"> | null | undefined;
  guides: readonly InsuranceGuide[];
  programmes: readonly Programme[];
  sample: boolean;
}): PackModel {
  const p = copy.plan;
  const budget = input.plan?.budget ?? "mid";
  const climate = input.plan?.climate ?? "temperate";
  const care = input.plan?.careEffort ?? 2;
  const country = input.plan?.country === "CA" || input.plan?.country === "IN" || input.plan?.country === "UK" ? input.plan.country : "US";

  const guide = input.guides.find((g) => g.country === country);

  return {
    looks: input.looks.map(({ style, ownColour }) => ({
      name: style.label,
      askFor: style.askFor,
      fibres: style.wigNotes.fibres,
      caps: style.wigNotes.caps,
      comfort: style.wigNotes.comfort,
      upkeep: p.careEffort[style.careEffort],
      price: p.priceBand[style.priceBand],
      ownColour,
    })),
    cues: input.snapshot ? cuesFromSnapshot(input.snapshot).map((c) => c.label) : [],
    note: input.snapshot?.note,
    hairHex: input.snapshot?.hairHex,
    situation: { budget: p.budgetOptions[budget], climate: p.climateOptions[climate], upkeep: p.careOptions[care] },
    climateNote: p.climateNotes[climate],
    questions: copy.exportPack.pdf.questionList,
    guide: guide && {
      title: guide.title,
      intro: guide.intro,
      steps: guide.steps.map((s) => ({ text: s.text, ours: s.basis === "guidance" })),
      asOf: guide.asOf,
    },
    programmes: input.programmes
      .filter((x) => x.country === country)
      .map((x) => ({ name: x.name, summary: x.summary, contact: x.contact, checkNote: x.checkNote, asOf: x.asOf })),
    brows: input.plan?.browRecipe && {
      shape: input.plan.browRecipe.shapeName,
      thickness: input.plan.browRecipe.thickness,
      colourHex: input.plan.browRecipe.colourHex,
      note: input.plan.browRecipe.notes,
      steps: copy.brows.steps,
    },
    sample: input.sample,
  };
}

/**
 * Re-encode a stored result for the PDF: JPEG, long side ≤ 900 px, as a data
 * URL. Keeps the file small and handles PNG colour-step results. react-pdf
 * decodes data URLs itself, so nothing is fetched (the CSP forbids fetching
 * blob: and data: URLs, and a raw-bytes object is silently ignored by its
 * browser build: the first version of the pack had no photos in it).
 */
export async function pdfImage(blob: Blob, maxSide = 900): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
