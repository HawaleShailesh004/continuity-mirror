/*
 * Brow Record helpers (master plan Module E). The record is a close photo of
 * the person's OWN brows, taken from the baseline they already gave us, plus
 * the nearest of YouCam's verified brow shapes and a colour. Everything here
 * is pure except the two functions that touch pixels or the face model, and
 * nothing is sent anywhere: the crop is made on this device.
 */
import { brows as browCatalog, closestBrowShape, type BrowCatalogItem } from "@/lib/catalog";
import type { BrowRecipe, IdentitySnapshot, JobSpec } from "@/lib/contracts";
import { brows as t } from "@/content/copy/brows";
import type { Point } from "./capture/checks";

/** A region of an image as fractions (0–1) of its width and height. */
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * MediaPipe face-mesh points along the two eyebrows (upper and lower edge of
 * each). The mesh is the same one the capture screen already runs.
 */
export const BROW_POINTS = [
  70, 63, 105, 66, 107, 46, 53, 52, 65, 55, // the brow on the left of the photo
  336, 296, 334, 293, 300, 276, 283, 282, 295, 285, // the brow on the right
] as const;

/** Crops are wide and short, like the brows: about this much wider than tall. */
const CROP_RATIO = 2.2;

/** Where brows usually are in a portrait photo, for when the face model can't run. */
export const GUESS_RECT: Rect = { x: 0.2, y: 0.24, w: 0.6, h: 0.16 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The crop for a face: both brows with room around them, a little of the eyes
 * for context (brow height is judged against the eye), kept inside the image.
 * `aspect` is the image's width / height; landmarks are fractions of it.
 */
export function browRect(landmarks: readonly Point[], aspect: number): Rect | null {
  const points = BROW_POINTS.map((i) => landmarks[i]).filter((p): p is Point => Boolean(p));
  if (points.length < BROW_POINTS.length) return null;

  const xs = points.map((p) => p.x * aspect); // width in "height units", so the maths is in one scale
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2 + (maxY - minY) * 0.9; // sit a little below the brows: some eye, less forehead

  let w = (maxX - minX) * 1.35;
  let h = w / CROP_RATIO;
  if (h < (maxY - minY) * 2.6) {
    h = (maxY - minY) * 2.6;
    w = h * CROP_RATIO;
  }
  // Never larger than the image; then slide it back inside.
  w = Math.min(w, aspect);
  h = Math.min(h, 1);
  const x = clamp(cx - w / 2, 0, aspect - w);
  const y = clamp(cy - h / 2, 0, 1 - h);
  return { x: x / aspect, y, w: w / aspect, h };
}

/** A rect in whole pixels of an image of this size (never empty, never outside). */
export function pixelRect(rect: Rect, width: number, height: number) {
  const sx = clamp(Math.round(rect.x * width), 0, width - 1);
  const sy = clamp(Math.round(rect.y * height), 0, height - 1);
  const sw = clamp(Math.round(rect.w * width), 1, width - sx);
  const sh = clamp(Math.round(rect.h * height), 1, height - sy);
  return { sx, sy, sw, sh };
}

/** Cut a region out of an image, as a JPEG. The same rect works on a preview of the same photo. */
export async function cropImage(image: Blob, rect: Rect, maxWidth = 900): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  try {
    const { sx, sy, sw, sh } = pixelRect(rect, bitmap.width, bitmap.height);
    const scale = Math.min(1, maxWidth / sw);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/jpeg", 0.9),
    );
  } finally {
    bitmap.close();
  }
}

/**
 * Find the brows on the baseline with the on-device face model (loaded only
 * here and on the capture screen). If the model can't run or doesn't see
 * exactly one face, fall back to where brows usually are, and say so.
 */
export async function findBrows(baseline: Blob): Promise<{ rect: Rect; found: "face" | "guess" }> {
  try {
    const [{ loadDetectors, analyseStill }, { wholeImage }] = await Promise.all([
      import("./capture/mediapipe"),
      import("./capture/encode"),
    ]);
    const bitmap = await createImageBitmap(baseline);
    try {
      const detectors = await loadDetectors();
      const analysis = await analyseStill(detectors, bitmap, wholeImage(bitmap.width, bitmap.height));
      const rect = analysis.landmarks ? browRect(analysis.landmarks, bitmap.width / bitmap.height) : null;
      if (rect) return { rect, found: "face" };
    } finally {
      bitmap.close();
    }
  } catch {
    /* the models didn't load: use the usual place */
  }
  return { rect: GUESS_RECT, found: "guess" };
}

/* ------------------------------------------------------------------ recipe */

/** One of the four shape families a person can describe their brows with. */
export type BrowFamily = IdentitySnapshot["brows"]["shape"];

export const BROW_FAMILIES: readonly BrowFamily[] = ["straight", "soft-arch", "high-arch", "rounded"];

/** The catalog shapes in one family, in the catalog's own order. */
export const shapesIn = (family: BrowFamily): BrowCatalogItem[] => browCatalog.shapes.filter((s) => s.shape === family);

export const shapeById = (id: string): BrowCatalogItem | undefined => browCatalog.shapes.find((s) => s.id === id);

/** Where the Brow Record starts: the shape and darkness the person described in their snapshot. */
export function startingPoint(brows: IdentitySnapshot["brows"]): { shapeId: string; darkness: IdentitySnapshot["brows"]["darkness"] } {
  return { shapeId: closestBrowShape(brows).id, darkness: brows.darkness };
}

export const colourFor = (darkness: IdentitySnapshot["brows"]["darkness"]): string => browCatalog.colours[darkness];

/** The recipe saved to the plan: words a make-up artist or fitter can use. */
export function buildRecipe(shape: BrowCatalogItem, darkness: IdentitySnapshot["brows"]["darkness"], note: string): BrowRecipe {
  const trimmed = note.trim();
  return {
    catalogShapeId: shape.id,
    shapeName: shape.name,
    thickness: t.thickness[shape.thickness],
    colourHex: colourFor(darkness),
    ...(trimmed ? { notes: trimmed.slice(0, 280) } : {}),
  };
}

/** Thickness slider value for a shape's thickness, inside the catalog's band. */
const THICKNESS_VALUE = { thin: -20, balanced: 0, thick: 20 } as const;

/**
 * The optional preview job. Intensity sits near the top of the band because
 * YouCam's brow try-on is nearly invisible on brows that are still there
 * (B0, confirmed in B5): the Brow Record is the real feature.
 */
export function previewSpec(shape: BrowCatalogItem, darkness: IdentitySnapshot["brows"]["darkness"]): JobSpec {
  const { defaults, bands } = browCatalog;
  return {
    kind: "brows",
    browShapeId: shape.id,
    curvature: defaults.curvature,
    thickness: clamp(THICKNESS_VALUE[shape.thickness], bands.thickness.min, bands.thickness.max),
    definition: defaults.definition,
    colourHex: colourFor(darkness),
    intensity: bands.intensity.max,
    attempt: 0,
  };
}
