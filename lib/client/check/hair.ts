/*
 * The baseline's own hair colour, measured on the device (elite-plan B2).
 *
 * Why not just use the colour the user tapped? On 30 Oct a Hair Color pass restored with the hex measured
 * from the hair mask brought own-colour results to ΔE 0.9–1.8 of the baseline's hair; the same pass with a
 * tapped hex only got to 4.9–6.5, because a tap picks up the light's cast (docs/YOUCAM_FACTS.md, B5 notes). So the
 * routes restore with the measured colour whenever one is available, and fall back to the user's pick when
 * it isn't (very short hair, no face found, models blocked, mock mode).
 */
import { db } from "../db";
import { MIN_HAIR_COVERAGE } from "./colour";
import { checkEnabled } from "./enabled";
import { measure } from "./measure";

const inFlight = new Map<string, Promise<string | null>>();

async function compute(baselineId: string): Promise<string | null> {
  const row = await db.baselines.get(baselineId);
  if (!row) return null;
  if (row.hairHex) return row.hairHex;
  const { hair } = await measure(row.image);
  const hex = hair && hair.coverage >= MIN_HAIR_COVERAGE ? hair.hex : null;
  if (hex) await db.baselines.update(baselineId, { hairHex: hex });
  return hex;
}

/**
 * The baseline's measured hair colour, or null if it can't be measured within `waitMs`. Measuring keeps
 * going in the background after a timeout, so the next call finds it stored.
 */
export async function measuredHairHex(baselineId: string, waitMs = 4000): Promise<string | null> {
  if (!checkEnabled()) return null;
  let work = inFlight.get(baselineId);
  if (!work) {
    work = compute(baselineId)
      .catch((error) => {
        console.warn("[check] could not measure the hair colour", error);
        return null;
      })
      .finally(() => inFlight.delete(baselineId));
    inFlight.set(baselineId, work);
  }
  return Promise.race([work, new Promise<null>((resolve) => setTimeout(resolve, waitMs, null))]);
}

/** Start measuring now (while the user fills in the snapshot), so the paths don't wait for it. */
export function prewarmHair(baselineId: string): void {
  void measuredHairHex(baselineId, 0);
}
