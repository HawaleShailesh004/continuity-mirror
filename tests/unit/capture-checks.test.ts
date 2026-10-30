import { describe, expect, it } from "vitest";
import {
  THRESHOLDS,
  SteadyTracker,
  allPass,
  anglesFromMatrix,
  evaluate,
  faceBox,
  lightingFromPixels,
  primaryTip,
  type FaceInput,
  type FrameInput,
  type Point,
} from "@/lib/client/capture/checks";

/* ---- builders ---------------------------------------------------------- */

const rad = (d: number) => (d * Math.PI) / 180;

/** Column-major 4×4 for R = Ry(yaw)·Rx(pitch)·Rz(roll). */
function matrix(yaw: number, pitch: number, roll: number): number[] {
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(rad(yaw)), Math.sin(rad(yaw)), Math.cos(rad(pitch)), Math.sin(rad(pitch)), Math.cos(rad(roll)), Math.sin(rad(roll))];
  const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
  const Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
  const mul = (a: number[][], b: number[][]) => a.map((row) => [0, 1, 2].map((j) => row.reduce((s, v, k) => s + v * b[k]![j]!, 0)));
  const R = mul(mul(Ry, Rx), Rz);
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) out[c * 4 + r] = R[r]![c]!;
  out[15] = 1;
  return out;
}

/** 478 landmarks whose extremes define the box. */
function landmarks(minX: number, maxX: number, minY: number, maxY: number): Point[] {
  const pts: Point[] = Array.from({ length: 478 }, () => ({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }));
  pts[1] = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }; // nose tip
  pts[10] = { x: (minX + maxX) / 2, y: minY };
  pts[152] = { x: (minX + maxX) / 2, y: maxY };
  pts[234] = { x: minX, y: (minY + maxY) / 2 };
  pts[454] = { x: maxX, y: (minY + maxY) / 2 };
  return pts;
}

const goodFace = (over: Partial<FaceInput> = {}): FaceInput => ({
  landmarks: landmarks(0.32, 0.68, 0.2, 0.55),
  matrix: matrix(2, -3, 1),
  ...over,
});

const shoulders = (vis = 0.9, y = 0.9): Point[] => {
  const pose: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  pose[11] = { x: 0.3, y, visibility: vis };
  pose[12] = { x: 0.7, y, visibility: vis };
  return pose;
};

const goodFrame = (over: Partial<FrameInput> = {}): FrameInput => ({
  width: 720,
  height: 960,
  faces: [goodFace()],
  pose: shoulders(),
  lighting: { mean: 0.55, imbalance: 0.05 },
  ...over,
});

const failing = (frame: FrameInput) => evaluate(frame).filter((r) => !r.ok);

/* ---- tests ------------------------------------------------------------- */

describe("anglesFromMatrix", () => {
  it("recovers known yaw, pitch and roll from a rotation matrix", () => {
    for (const [yaw, pitch, roll] of [
      [0, 0, 0],
      [20, 0, 0],
      [-35, 5, 0],
      [0, 12, -4],
      [10, -8, 15],
      [-25, 10, -12],
    ] as const) {
      const got = anglesFromMatrix(matrix(yaw, pitch, roll));
      expect(got.yaw).toBeCloseTo(yaw, 5);
      expect(got.pitch).toBeCloseTo(pitch, 5);
      expect(got.roll).toBeCloseTo(roll, 5);
    }
  });
});

describe("evaluate", () => {
  it("passes a well-framed, front-facing, evenly lit photo with shoulders showing", () => {
    const results = evaluate(goodFrame());
    expect(results.map((r) => r.id)).toEqual(["oneFace", "pose", "size", "spacing", "shoulders", "lighting"]);
    expect(allPass(results)).toBe(true);
    expect(primaryTip(results)).toBeUndefined();
  });

  it("asks for a face when there is none, and nothing else", () => {
    const results = evaluate(goodFrame({ faces: [] }));
    expect(primaryTip(results)).toBe("noFace");
    expect(results.filter((r) => r.ok)).toEqual([]);
  });

  it("asks for only you in the frame when there are two faces", () => {
    expect(primaryTip(evaluate(goodFrame({ faces: [goodFace(), goodFace()] })))).toBe("manyFaces");
  });

  it("tells you to look straight when the head is turned or tilted up/down", () => {
    expect(primaryTip(evaluate(goodFrame({ faces: [goodFace({ matrix: matrix(30, 0, 0) })] })))).toBe("lookStraight");
    expect(primaryTip(evaluate(goodFrame({ faces: [goodFace({ matrix: matrix(0, 12, 0) })] })))).toBe("lookStraight");
  });

  it("tells you to level your head when only the roll is off", () => {
    expect(primaryTip(evaluate(goodFrame({ faces: [goodFace({ matrix: matrix(0, 0, 14) })] })))).toBe("levelHead");
  });

  it("accepts angles just inside every limit and rejects just outside", () => {
    const inside = matrix(THRESHOLDS.yawDeg - 0.5, THRESHOLDS.pitchDeg - 0.5, THRESHOLDS.rollDeg - 0.5);
    const outside = matrix(THRESHOLDS.yawDeg + 0.5, 0, 0);
    expect(allPass(evaluate(goodFrame({ faces: [goodFace({ matrix: inside })] })))).toBe(true);
    expect(allPass(evaluate(goodFrame({ faces: [goodFace({ matrix: outside })] })))).toBe(false);
  });

  it("measures face size against the long side of the frame (portrait and landscape alike)", () => {
    // 0.14 of a 720 px width = 101 px of a 960 px long side = 0.105 → too small.
    const small = goodFrame({ faces: [goodFace({ landmarks: landmarks(0.43, 0.57, 0.3, 0.45) })] });
    expect(primaryTip(evaluate(small))).toBe("closer");
    // Landscape: the same 0.14 of a 1280 wide frame is 179 px of 1280 = 0.14 → still too small.
    const landscape = goodFrame({ width: 1280, height: 720, faces: [goodFace({ landmarks: landmarks(0.43, 0.57, 0.3, 0.6) })] });
    expect(primaryTip(evaluate(landscape))).toBe("closer");
  });

  it("asks you to move back when the head touches the top or the chin sits too low", () => {
    expect(primaryTip(evaluate(goodFrame({ faces: [goodFace({ landmarks: landmarks(0.32, 0.68, 0.02, 0.4) })] })))).toBe("back");
    expect(primaryTip(evaluate(goodFrame({ faces: [goodFace({ landmarks: landmarks(0.32, 0.68, 0.45, 0.9) })] })))).toBe("back");
  });

  it("asks to show your shoulders when they are hidden, faint, or out of the frame", () => {
    expect(primaryTip(evaluate(goodFrame({ pose: shoulders(0.2) })))).toBe("shoulders");
    expect(primaryTip(evaluate(goodFrame({ pose: shoulders(0.9, 1.05) })))).toBe("shoulders");
    const oneMissing = shoulders();
    oneMissing[12] = { x: 1.2, y: 0.9, visibility: 0.9 };
    expect(primaryTip(evaluate(goodFrame({ pose: oneMissing })))).toBe("shoulders");
  });

  it("does not trust shoulders the model merely guessed (high visibility, low presence)", () => {
    // Measured: a photo cropped above the shoulders gave visibility 0.89 / 0.95 but presence 0.34 / 0.70.
    const guessed = shoulders();
    guessed[11] = { x: 0.9, y: 0.83, visibility: 0.888, presence: 0.34 };
    guessed[12] = { x: 0.07, y: 0.75, visibility: 0.952, presence: 0.698 };
    expect(primaryTip(evaluate(goodFrame({ pose: guessed })))).toBe("shoulders");

    // ...and the real thing (visibility 0.98, presence 0.86 / 0.93) passes.
    const real = shoulders();
    real[11] = { x: 1.004, y: 0.872, visibility: 0.981, presence: 0.858 };
    real[12] = { x: 0.069, y: 0.885, visibility: 0.984, presence: 0.931 };
    expect(primaryTip(evaluate(goodFrame({ pose: real })))).toBeUndefined();
  });

  it("accepts a shoulder at the very edge of the frame, but not one well outside it", () => {
    // B0: a photo YouCam accepted had a shoulder landmark at x = 1.004.
    const atEdge = shoulders();
    atEdge[12] = { x: 1.004, y: 0.87, visibility: 0.98 };
    expect(primaryTip(evaluate(goodFrame({ pose: atEdge })))).toBeUndefined();
    atEdge[12] = { x: 1.0 + THRESHOLDS.shoulderEdge + 0.02, y: 0.87, visibility: 0.98 };
    expect(primaryTip(evaluate(goodFrame({ pose: atEdge })))).toBe("shoulders");
  });

  it("asks for better light when the face is dark, washed out or lit from one side", () => {
    for (const lighting of [
      { mean: 0.2, imbalance: 0.05 },
      { mean: 0.92, imbalance: 0.05 },
      { mean: 0.55, imbalance: 0.3 },
    ]) {
      expect(primaryTip(evaluate(goodFrame({ lighting })))).toBe("light");
    }
  });

  it("gives one tip at a time, in the order things should be fixed", () => {
    const everythingWrong = goodFrame({
      faces: [goodFace({ matrix: matrix(30, 0, 0), landmarks: landmarks(0.45, 0.55, 0.02, 0.2) })],
      pose: shoulders(0.1),
      lighting: { mean: 0.1, imbalance: 0.5 },
    });
    expect(failing(everythingWrong).length).toBeGreaterThan(3);
    expect(primaryTip(evaluate(everythingWrong))).toBe("lookStraight");
  });

  it("skips the checks whose data isn't available (pose model or lighting not run)", () => {
    const ids = evaluate(goodFrame({ pose: undefined, lighting: undefined })).map((r) => r.id);
    expect(ids).toEqual(["oneFace", "pose", "size", "spacing"]);
  });
});

describe("faceBox", () => {
  it("finds the extremes of the landmarks", () => {
    expect(faceBox(landmarks(0.3, 0.7, 0.2, 0.6))).toEqual({ minX: 0.3, maxX: 0.7, minY: 0.2, maxY: 0.6 });
  });
});

describe("lightingFromPixels", () => {
  const image = (w: number, h: number, left: number, right: number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = x < w / 2 ? left : right;
        data.set([v, v, v, 255], (y * w + x) * 4);
      }
    return data;
  };
  const box = { minX: 0, maxX: 1, minY: 0, maxY: 1 };

  it("reads even light as bright and balanced", () => {
    const { mean, imbalance } = lightingFromPixels(image(40, 40, 140, 140), 40, 40, box);
    expect(mean).toBeCloseTo(140 / 255, 2);
    expect(imbalance).toBeCloseTo(0, 3);
  });

  it("notices light from one side", () => {
    const { imbalance } = lightingFromPixels(image(40, 40, 60, 200), 40, 40, box);
    expect(imbalance).toBeCloseTo((200 - 60) / 255, 2);
  });
});

describe("SteadyTracker", () => {
  const nose = (x: number, y: number): Point => ({ x, y });

  it("reports how long the nose has stayed put, and restarts when it moves", () => {
    const t = new SteadyTracker();
    expect(t.push(0, nose(0.5, 0.4), 0.75)).toBe(0);
    expect(t.push(500, nose(0.502, 0.401), 0.75)).toBe(500);
    expect(t.push(1000, nose(0.5, 0.4), 0.75)).toBe(1000);
    expect(t.push(1100, nose(0.6, 0.5), 0.75)).toBe(0); // moved: start again
    expect(t.push(1600, nose(0.6, 0.5), 0.75)).toBe(500);
  });

  it("resets when the face is lost", () => {
    const t = new SteadyTracker();
    t.push(0, nose(0.5, 0.4), 0.75);
    expect(t.push(500, undefined, 0.75)).toBe(0);
    expect(t.push(900, nose(0.5, 0.4), 0.75)).toBe(0);
  });
});
