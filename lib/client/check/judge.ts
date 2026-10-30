/*
 * Result check (elite-plan B2): turn two measurements (the baseline and a result) into one outcome.
 * Pure: no MediaPipe, no storage, no network. lib/client/check/run.ts feeds it and acts on the answer.
 *
 * What it asks, and only this:
 *  - face:   did the eyes, nose and mouth stay where they were? (hair VTO must not touch the face)
 *  - colour: is the hair still the user's colour? (only when the route promised to keep it)
 * It never rates how anyone looks. The numbers stay on the device and are not shown as scores.
 *
 * Thresholds come from the 36 genuine YouCam results in public/demo (docs/EVAL.md). Face drift there is
 * 0.002–0.010, while a different person's face in the same pose reads 0.017–0.043, so 0.013 sits between them:
 * it catches a face the edit moved or swapped, not a subtle one (it is a geometry check, not identity
 * verification). Own-colour results sit at ΔE 0–7 and a Hair Color repair brings them to ΔE 0.8–1.9, so 4 is
 * where "a little different" starts to show.
 */
import { deltaE2000, labToHex, MIN_HAIR_COVERAGE, repairColour } from "./colour";
import { faceDrift } from "./face";
import type { Measurement } from "./measure";

export const THRESHOLDS = {
  /** RMS landmark movement as a fraction of the eye distance. */
  faceChanged: 0.013,
  /** CIEDE2000 between the baseline's and the result's hair colour. */
  colourDrift: 4,
  /** Below this share of the image the hair is too small to measure honestly (short styles). */
  minHairCoverage: 0.08,
} as const;

export type FaceStatus = "unchanged" | "changed" | "unknown";
export type ColourStatus = "kept" | "drifted" | "skipped";

/**
 * - checked:   face unchanged, colour kept (or not promised)
 * - repairable: face fine, colour drifted: one Hair Color pass with `repairHex` should fix it
 * - needs-look: the face moved; offer another try, don't repair
 * - unchecked: a face or hair wasn't found in one of the images, so nothing is claimed
 */
export type CheckOutcome = "checked" | "repairable" | "needs-look" | "unchecked";

export type ResultCheck = {
  outcome: CheckOutcome;
  face: { status: FaceStatus; drift: number | null };
  colour: { status: ColourStatus; baselineHex: string | null; resultHex: string | null; deltaE: number | null };
  /** The colour to ask Hair Color for: the baseline's measured hair, nudged against the drift (see repairColour). */
  repairHex?: string;
  /** Set once a repair ran: how far the colour is after it. */
  repaired?: { state: "queued" | "adjusted" | "failed"; deltaEAfter?: number };
  checkedAt: string;
};

export function judge(baseline: Measurement, result: Measurement, opts: { expectOwnColour: boolean }, now: Date = new Date()): ResultCheck {
  const drift = baseline.landmarks && result.landmarks ? faceDrift(baseline.landmarks, baseline.size, result.landmarks, result.size) : null;
  const face: ResultCheck["face"] = {
    drift,
    status: drift === null ? "unknown" : drift <= THRESHOLDS.faceChanged ? "unchanged" : "changed",
  };

  const measurable = Boolean(baseline.hair && result.hair && baseline.hair.coverage >= MIN_HAIR_COVERAGE && result.hair.coverage >= THRESHOLDS.minHairCoverage);
  const deltaE = baseline.hair && result.hair ? deltaE2000(baseline.hair.lab, result.hair.lab) : null;
  const colour: ResultCheck["colour"] = {
    baselineHex: baseline.hair?.hex ?? null,
    resultHex: result.hair?.hex ?? null,
    deltaE,
    status: !opts.expectOwnColour || !measurable || deltaE === null ? "skipped" : deltaE > THRESHOLDS.colourDrift ? "drifted" : "kept",
  };

  const outcome: CheckOutcome =
    face.status === "unknown" ? "unchecked" : face.status === "changed" ? "needs-look" : colour.status === "drifted" ? "repairable" : "checked";

  return {
    outcome,
    face,
    colour,
    ...(outcome === "repairable" && baseline.hair && result.hair ? { repairHex: labToHex(repairColour(baseline.hair.lab, result.hair.lab)) } : {}),
    checkedAt: now.toISOString(),
  };
}
