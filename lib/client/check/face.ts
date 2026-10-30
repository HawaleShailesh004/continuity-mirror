/*
 * Result check, face half (elite-plan B2). Does the face in a result still have the geometry of the
 * face in the baseline? Hair VTO is meant to leave the face alone; if the eyes, nose or mouth moved,
 * the result is not "you with new hair" and we say so instead of showing it as a match.
 *
 * Pure functions over MediaPipe face landmarks (normalised 0..1 of each image). It compares shape,
 * not looks: it never rates a face, and the number never reaches the user, only "unchanged" or "look closer".
 */
import type { Point } from "../capture/checks";

/**
 * Landmarks hair can't move: the eye corners, nose bridge and tip, mouth corners and lips, chin.
 * Cheeks and the face oval are left out on purpose, because hair falls over them.
 */
const STABLE = [33, 133, 159, 145, 362, 263, 386, 374, 6, 1, 98, 327, 61, 291, 13, 14, 152] as const;
const LEFT_EYE = [33, 133] as const;
const RIGHT_EYE = [362, 263] as const;

export type Size = { width: number; height: number };

type P2 = { x: number; y: number };

const centre = (pts: P2[]): P2 => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

function pixels(landmarks: readonly Point[], size: Size): P2[] {
  return STABLE.map((i) => {
    const p = landmarks[i];
    if (!p) throw new Error(`landmark ${i} missing`);
    return { x: p.x * size.width, y: p.y * size.height };
  });
}

/** Distance between the eye centres in pixels: the ruler the drift is measured in. */
export function eyeDistance(landmarks: readonly Point[], size: Size): number {
  const mid = (ids: readonly [number, number]): P2 =>
    centre(ids.map((i) => ({ x: landmarks[i]!.x * size.width, y: landmarks[i]!.y * size.height })));
  const [l, r] = [mid(LEFT_EYE), mid(RIGHT_EYE)];
  return Math.hypot(l.x - r.x, l.y - r.y);
}

/**
 * Root-mean-square distance between the two faces' stable landmarks after the best
 * translation, rotation and uniform scale (a similarity fit), as a fraction of the baseline's
 * eye distance. 0 means identical geometry; head tilt or a slightly different crop don't count.
 */
export function faceDrift(baseline: readonly Point[], baselineSize: Size, result: readonly Point[], resultSize: Size): number {
  const a = pixels(baseline, baselineSize);
  const b = pixels(result, resultSize);
  const [ca, cb] = [centre(a), centre(b)];
  const [pa, pb] = [a.map((p) => ({ x: p.x - ca.x, y: p.y - ca.y })), b.map((p) => ({ x: p.x - cb.x, y: p.y - cb.y }))];

  // Closed-form 2D similarity (complex-number Procrustes): b ≈ s·R·a.
  let dot = 0;
  let cross = 0;
  let norm = 0;
  for (let i = 0; i < pa.length; i++) {
    dot += pa[i]!.x * pb[i]!.x + pa[i]!.y * pb[i]!.y;
    cross += pa[i]!.x * pb[i]!.y - pa[i]!.y * pb[i]!.x;
    norm += pa[i]!.x ** 2 + pa[i]!.y ** 2;
  }
  const [c, s] = [dot / norm, cross / norm]; // scale·cos, scale·sin

  let sum = 0;
  for (let i = 0; i < pa.length; i++) {
    const [px, py] = [c * pa[i]!.x - s * pa[i]!.y, s * pa[i]!.x + c * pa[i]!.y];
    sum += (px - pb[i]!.x) ** 2 + (py - pb[i]!.y) ** 2;
  }
  // Express in the baseline's eye distance, scaled to the result's size by the fitted scale.
  const scale = Math.hypot(c, s) || 1;
  return Math.sqrt(sum / pa.length) / (eyeDistance(baseline, baselineSize) * scale);
}
