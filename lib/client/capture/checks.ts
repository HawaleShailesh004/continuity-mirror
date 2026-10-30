/*
 * Capture checks (frontend plan §6): everything the camera screen verifies
 * BEFORE a photo is sent anywhere. Pure functions over plain data, so they are
 * unit-tested on landmark fixtures and never need a camera or MediaPipe.
 *
 * Each check mirrors a YouCam rejection we want to prevent (and protects
 * quality: B0 showed the API is more lenient than its docs, so it will accept
 * and charge for a face-only crop or a tilted head; it won't catch those for
 * us). Thresholds are tighter than YouCam's limits, leaving margin.
 */

export type Point = { x: number; y: number; z?: number; visibility?: number; presence?: number };

export type FaceInput = {
  /** 478 normalised landmarks (x, y in 0..1 of the analysed frame). */
  landmarks: readonly Point[];
  /** 4×4 facial transformation matrix, column-major (16 numbers), if the model gave one. */
  matrix?: readonly number[];
};

export type FrameInput = {
  /** Pixel size of the analysed frame. */
  width: number;
  height: number;
  faces: readonly FaceInput[];
  /** 33 pose landmarks of the first person, if the pose model ran. Omit to skip the shoulders check. */
  pose?: readonly Point[];
  /** Brightness of the face area, if sampled. Omit to skip the lighting check. */
  lighting?: Lighting;
};

export type Lighting = {
  /** Mean luminance in the face box, 0..1. */
  mean: number;
  /** |left half − right half| mean luminance, 0..1. */
  imbalance: number;
};

/** What the user is told to do, keyed so the words live in content/copy/capture.ts. */
export type TipKey =
  | "noFace"
  | "manyFaces"
  | "lookStraight"
  | "levelHead"
  | "closer"
  | "back"
  | "shoulders"
  | "light";

export type CheckId = "oneFace" | "pose" | "size" | "spacing" | "shoulders" | "lighting";

export type CheckResult = {
  id: CheckId;
  ok: boolean;
  /** Present when not ok. */
  tip?: TipKey;
  /** The measured value, for tests and debugging (degrees, ratio, luminance). */
  value?: number;
};

/** YouCam's limits in the comments; ours are tighter. */
export const THRESHOLDS = {
  /** YouCam: pitch ±10°, yaw ±45°, roll ±15°. */
  pitchDeg: 8,
  yawDeg: 20,
  rollDeg: 10,
  /** YouCam needs a face ≥ 128 px of a 1024 px long side = 0.125. */
  minFaceRatio: 0.16,
  /** Forehead landmark at least this far (fraction of frame height) from the top: room for hair. */
  topMargin: 0.08,
  /** Chin landmark at most this far down, leaving room for the shoulders to show. */
  bottomLimit: 0.8,
  /** Pose landmark visibility needed to count a shoulder as seen. */
  shoulderVisibility: 0.6,
  /**
   * ...and presence. Visibility alone is not enough: for a photo cropped above the
   * shoulders the model still places them (visibility 0.89–0.95) but reports
   * presence 0.34–0.70, against 0.86–0.99 when they are really in the picture
   * (measured 26 Oct on the same persona with and without the shoulders).
   */
  shoulderPresence: 0.75,
  /** Shoulders must sit inside the frame with a little margin at the bottom. */
  shoulderMaxY: 0.98,
  /**
   * A shoulder may sit right at the side edge: the pose model extrapolates a few
   * percent past it for photos cropped at the shoulder (B0 measured x = 1.004 on a
   * photo YouCam accepted). Beyond this the shoulder is genuinely out of frame.
   */
  shoulderEdge: 0.06,
  lightMin: 0.35,
  lightMax: 0.85,
  lightImbalance: 0.2,
  /** Still for this long before the countdown starts. */
  steadyMs: 1000,
  /** Nose-tip movement (fraction of the frame's long side) that still counts as steady. */
  steadyMove: 0.012,
} as const;

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
export const NOSE_TIP = 1;

/* ------------------------------------------------------------------ geometry */

export type Box = { minX: number; maxX: number; minY: number; maxY: number };

export function faceBox(landmarks: readonly Point[]): Box {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

const deg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Head angles in degrees from MediaPipe's facial transformation matrix
 * (column-major 4×4). Convention: R = Ry(yaw) · Rx(pitch) · Rz(roll).
 * Only magnitudes matter to the checks, so the sign convention is irrelevant.
 */
export function anglesFromMatrix(m: readonly number[]): { yaw: number; pitch: number; roll: number } {
  // Rows of the upper-left 3×3 rotation block.
  const r10 = m[1]!;
  const r11 = m[5]!;
  const r02 = m[8]!;
  const r12 = m[9]!;
  const r22 = m[10]!;
  return {
    pitch: deg(Math.asin(Math.max(-1, Math.min(1, -r12)))),
    yaw: deg(Math.atan2(r02, r22)),
    roll: deg(Math.atan2(r10, r11)),
  };
}

/** Mean luminance (0..1) of an RGBA pixel block. */
function luminance(rgba: ArrayLike<number>, from: number, to: number): number {
  let sum = 0;
  let n = 0;
  for (let i = from; i < to; i += 4) {
    sum += 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
    n++;
  }
  return n === 0 ? 0 : sum / n / 255;
}

/**
 * Brightness of the face area and how uneven it is left to right. `box` is in
 * normalised coordinates of the RGBA image (width × height pixels).
 */
export function lightingFromPixels(rgba: ArrayLike<number>, width: number, height: number, box: Box): Lighting {
  const x0 = Math.max(0, Math.floor(box.minX * width));
  const x1 = Math.min(width, Math.ceil(box.maxX * width));
  const y0 = Math.max(0, Math.floor(box.minY * height));
  const y1 = Math.min(height, Math.ceil(box.maxY * height));
  const mid = Math.floor((x0 + x1) / 2);

  const region = (xa: number, xb: number) => {
    let sum = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      const row = y * width * 4;
      const l = luminance(rgba, row + xa * 4, row + xb * 4);
      sum += l * (xb - xa);
      n += xb - xa;
    }
    return n === 0 ? 0 : sum / n;
  };

  const left = region(x0, mid);
  const right = region(mid, x1);
  return { mean: (left + right) / 2, imbalance: Math.abs(left - right) };
}

/* -------------------------------------------------------------------- checks */

/**
 * Run every check on one frame, in the order the user should fix them. The
 * first failing result's tip is the single thing to say (`primaryTip`).
 */
export function evaluate(frame: FrameInput): CheckResult[] {
  const results: CheckResult[] = [];

  // One face → YouCam error_insufficient_landmarks / error_no_face.
  const count = frame.faces.length;
  results.push(
    count === 1
      ? { id: "oneFace", ok: true, value: 1 }
      : { id: "oneFace", ok: false, tip: count === 0 ? "noFace" : "manyFaces", value: count },
  );
  const face = count === 1 ? frame.faces[0]! : undefined;

  if (!face) {
    // Nothing else can be judged without exactly one face.
    for (const id of ["pose", "size", "spacing"] as const) results.push({ id, ok: false });
    if (frame.pose) results.push({ id: "shoulders", ok: false });
    if (frame.lighting) results.push({ id: "lighting", ok: false });
    return results;
  }

  const box = faceBox(face.landmarks);

  // Head pose → error_large_face_angle / error_face_pose.
  if (face.matrix) {
    const { yaw, pitch, roll } = anglesFromMatrix(face.matrix);
    const rollBad = Math.abs(roll) > THRESHOLDS.rollDeg;
    const forwardBad = Math.abs(yaw) > THRESHOLDS.yawDeg || Math.abs(pitch) > THRESHOLDS.pitchDeg;
    results.push(
      rollBad || forwardBad
        ? { id: "pose", ok: false, tip: forwardBad ? "lookStraight" : "levelHead", value: Math.max(Math.abs(yaw), Math.abs(pitch), Math.abs(roll)) }
        : { id: "pose", ok: true, value: Math.max(Math.abs(yaw), Math.abs(pitch), Math.abs(roll)) },
    );
  } else {
    results.push({ id: "pose", ok: true });
  }

  // Face size → error_below_min_image_size / face too small for the hair tool.
  const longSide = Math.max(frame.width, frame.height);
  const ratio = ((box.maxX - box.minX) * frame.width) / longSide;
  results.push(
    ratio >= THRESHOLDS.minFaceRatio
      ? { id: "size", ok: true, value: ratio }
      : { id: "size", ok: false, tip: "closer", value: ratio },
  );

  // Head not cut off, room left for shoulders.
  const spaced = box.minY >= THRESHOLDS.topMargin && box.maxY <= THRESHOLDS.bottomLimit;
  results.push(spaced ? { id: "spacing", ok: true } : { id: "spacing", ok: false, tip: "back" });

  // Shoulders → error_no_shoulder.
  if (frame.pose) {
    const seen = [LEFT_SHOULDER, RIGHT_SHOULDER].every((i) => {
      const p = frame.pose![i];
      return (
        !!p &&
        (p.visibility ?? 0) >= THRESHOLDS.shoulderVisibility &&
        (p.presence ?? 1) >= THRESHOLDS.shoulderPresence &&
        p.x >= -THRESHOLDS.shoulderEdge &&
        p.x <= 1 + THRESHOLDS.shoulderEdge &&
        p.y >= 0 &&
        p.y <= THRESHOLDS.shoulderMaxY
      );
    });
    results.push(seen ? { id: "shoulders", ok: true } : { id: "shoulders", ok: false, tip: "shoulders" });
  }

  // Lighting: a quality check, not a YouCam error (dark or one-sided light gives poor previews).
  if (frame.lighting) {
    const { mean, imbalance } = frame.lighting;
    const fine = mean >= THRESHOLDS.lightMin && mean <= THRESHOLDS.lightMax && imbalance < THRESHOLDS.lightImbalance;
    results.push(fine ? { id: "lighting", ok: true, value: mean } : { id: "lighting", ok: false, tip: "light", value: mean });
  }

  return results;
}

/** The single most important thing to fix right now, or undefined when all pass. */
export function primaryTip(results: readonly CheckResult[]): TipKey | undefined {
  return results.find((r) => !r.ok && r.tip)?.tip;
}

export const allPass = (results: readonly CheckResult[]) => results.length > 0 && results.every((r) => r.ok);

/* ------------------------------------------------------------------ steadiness */

/**
 * Is the head still? Feed it the nose tip once per analysed frame; it reports
 * how long the nose has stayed within `steadyMove` of where it was.
 */
export class SteadyTracker {
  private anchor: { x: number; y: number; at: number } | null = null;

  /** Milliseconds the head has been steady as of `now`. */
  push(now: number, nose: Point | undefined, aspect: number): number {
    if (!nose) {
      this.anchor = null;
      return 0;
    }
    // Normalise x by the frame aspect so a move is measured in the same units both ways.
    const x = nose.x * aspect;
    const y = nose.y;
    if (!this.anchor || Math.hypot(x - this.anchor.x, y - this.anchor.y) > THRESHOLDS.steadyMove * Math.max(1, aspect)) {
      this.anchor = { x, y, at: now };
      return 0;
    }
    return now - this.anchor.at;
  }

  reset() {
    this.anchor = null;
  }
}
