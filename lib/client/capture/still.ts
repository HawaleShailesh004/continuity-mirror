/*
 * Checking a still photo (an upload, or the frame the camera just took) before
 * it is sent: the same checks as the live camera, run in still-image mode. A
 * photo that fails them never reaches YouCam, so no units are spent on it.
 */
import type { CheckResult } from "./checks";
import { wholeImage } from "./encode";
import { analyseStill, loadDetectors } from "./mediapipe";

/** Results, or null when the models can't run on this device (the photo is then unchecked). */
export async function checkStill(image: ImageBitmap): Promise<CheckResult[] | null> {
  try {
    const detectors = await loadDetectors();
    return (await analyseStill(detectors, image, wholeImage(image.width, image.height))).results;
  } catch {
    return null;
  }
}

/** Lighting is advice; everything else decides whether the photo can be used. */
export const blocking = (results: readonly CheckResult[]) => results.filter((r) => !r.ok && r.id !== "lighting");

/** The backend message key that explains the first blocking problem, for RetakeCoach. */
export function retakeKey(results: readonly CheckResult[]): string {
  switch (blocking(results)[0]?.id) {
    case "shoulders":
      return "capture.retake.shoulders";
    case "pose":
      return "capture.retake.faceForward";
    case "size":
    case "spacing":
      return "capture.retake.size";
    default:
      return "capture.retake.faceVisible";
  }
}
