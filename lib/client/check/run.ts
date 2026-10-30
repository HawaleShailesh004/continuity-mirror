/*
 * Result check, orchestration (elite-plan B2). After a result is stored on the device:
 *   1. measure the baseline and the result (MediaPipe, on the device),
 *   2. judge them (judge.ts) and write the outcome on the job row,
 *   3. if the colour drifted from the user's own, ask the server for ONE Hair Color pass (1 unit) using the
 *      hex measured from the baseline, and swap the corrected image in when it arrives.
 * It runs after the user already has the image, so it never delays a result. Any failure here leaves the
 * result exactly as YouCam returned it, unchecked.
 */
import { db, type JobRow } from "../db";
import { enqueue, markRepair } from "../jobs";
import { checkEnabled } from "./enabled";
import { judge, type ResultCheck } from "./judge";
import { measure, type Measurement } from "./measure";

export { checkEnabled };

const running = new Set<string>();
const baselines = new Map<string, Promise<Measurement>>();

function baselineMeasurement(id: string, image: Blob): Promise<Measurement> {
  let m = baselines.get(id);
  if (!m) {
    m = measure(image);
    m.catch(() => baselines.delete(id)); // a failed load can be retried
    baselines.set(id, m);
  }
  return m;
}

const expectsOwnColour = (row: JobRow) => row.spec.kind === "route" && row.spec.colour.source === "own";
const isCheckable = (row: JobRow) => row.spec.kind === "route" || row.spec.kind === "colour";

export async function checkStored(clientRequestId: string): Promise<void> {
  if (!checkEnabled() || running.has(clientRequestId)) return;
  running.add(clientRequestId);
  try {
    const row = await db.jobs.get(clientRequestId);
    if (!row || row.check || row.repairOf || row.superseded || !isCheckable(row)) return;
    const [baseline, result] = await Promise.all([db.baselines.get(row.baselineId), db.results.get(clientRequestId)]);
    if (!baseline || !result) return;

    const check = judge(await baselineMeasurement(baseline.id, baseline.image), await measure(result.image), { expectOwnColour: expectsOwnColour(row) });
    await db.jobs.update(clientRequestId, { check });

    if (check.outcome === "repairable" && check.repairHex && row.jobId) {
      // Mark it queued first: if the create call fails fast, "failed" must be the last word.
      await markRepair(clientRequestId, "queued");
      await enqueue({
        baselineId: row.baselineId,
        routeKey: `repair~${clientRequestId}`,
        spec: { kind: "repair", fromJobId: row.jobId, colourHex: check.repairHex as `#${string}` },
        repairOf: clientRequestId,
      });
    }
  } catch (error) {
    console.warn("[check] result left unchecked", error);
  } finally {
    running.delete(clientRequestId);
  }
}

/**
 * The repaired image is now the stored result: measure it again. If the colour is not closer than before,
 * put the first image back (a repair must never leave a result worse than it found it).
 */
export async function afterRepair(clientRequestId: string): Promise<void> {
  try {
    const [row, result] = await Promise.all([db.jobs.get(clientRequestId), db.results.get(clientRequestId)]);
    const before = row?.check?.colour.deltaE ?? null;
    if (!row?.check || !result) return;
    const baseline = await db.baselines.get(row.baselineId);
    if (!baseline) return;

    const after: ResultCheck = judge(await baselineMeasurement(baseline.id, baseline.image), await measure(result.image), { expectOwnColour: true });
    const deltaEAfter = after.colour.deltaE;
    if (result.original && before !== null && deltaEAfter !== null && (deltaEAfter >= before || after.face.status === "changed")) {
      await db.results.put({ ...result, image: result.original, original: undefined });
      await markRepair(clientRequestId, "failed");
      return;
    }
    await markRepair(clientRequestId, "adjusted", deltaEAfter ?? undefined);
  } catch (error) {
    console.warn("[check] could not re-measure the repaired result", error);
    await markRepair(clientRequestId, "adjusted");
  }
}
