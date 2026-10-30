/*
 * MediaPipe Tasks Vision, self-hosted (public/mediapipe, see
 * scripts/sync-mediapipe.mjs) and loaded lazily: the capture screen is the only
 * place that pays for the ~9 MB of models. Face landmarks (with the head-pose
 * matrix) and a lite pose model (shoulders) run in the browser, so no photo is
 * sent anywhere until it has passed our own checks.
 */
import type { FaceLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { evaluate, faceBox, lightingFromPixels, type CheckResult, type FaceInput, type FrameInput, type Point } from "./checks";

const BASE = "/mediapipe";

export type Detectors = {
  face: FaceLandmarker;
  /** null if the pose model failed to load: the shoulders check is then skipped. */
  pose: PoseLandmarker | null;
  /** Which delegate ended up running ("GPU" or "CPU"), for diagnostics. */
  delegate: "GPU" | "CPU";
};

let loading: Promise<Detectors> | undefined;

async function create(delegate: "GPU" | "CPU"): Promise<Detectors> {
  const { FaceLandmarker, FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);

  const face = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${BASE}/face_landmarker.task`, delegate },
    runningMode: "VIDEO",
    numFaces: 2, // two is enough to say "only you in the frame"
    outputFacialTransformationMatrixes: true,
  });

  let pose: PoseLandmarker | null = null;
  try {
    pose = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}/pose_landmarker_lite.task`, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  } catch (error) {
    // The face checks still work without it; the shoulders check is then skipped.
    console.warn("[capture] pose model unavailable, shoulders won't be checked", error);
    pose = null;
  }
  return { face, pose, delegate };
}

/** Load once per page. GPU first, CPU if the device can't. Rejects if neither works. */
export function loadDetectors(): Promise<Detectors> {
  loading ??= create("GPU")
    .catch(() => create("CPU"))
    .catch((error) => {
      loading = undefined; // allow a retry
      throw error;
    });
  return loading;
}

/* ------------------------------------------------------------------ analysis */

const ANALYSIS_LONG_SIDE = 480;

export type Analysis = {
  results: CheckResult[];
  /** The face box in the analysed frame (normalised), for drawing. */
  box: ReturnType<typeof faceBox> | null;
  /** Nose tip of the single face, for the steadiness tracker. */
  nose: Point | undefined;
  /** All landmarks of the single face (normalised to the analysed frame); the Brow Record finds the brows with them. */
  landmarks: readonly Point[] | undefined;
  /** Width / height of the analysed frame. */
  aspect: number;
};

// Separate scratch canvases: a still is checked while the live preview may still be winding down.
let liveCanvas: HTMLCanvasElement | undefined;
let stillCanvas: HTMLCanvasElement | undefined;
let timestamp = 0;

/** Strictly increasing timestamps in ms, as VIDEO mode requires. */
const nextTimestamp = (now: number) => (timestamp = Math.max(timestamp + 1, Math.round(now)));

function toFace(landmarks: Point[], matrix?: { data: ArrayLike<number> }): FaceInput {
  return { landmarks, matrix: matrix ? Array.from(matrix.data) : undefined };
}

function run(detectors: Detectors, frame: HTMLCanvasElement, now: number, mode: "video" | "image"): Analysis {
  const ts = nextTimestamp(now);
  const faceResult = mode === "video" ? detectors.face.detectForVideo(frame, ts) : detectors.face.detect(frame);
  const poseResult = mode === "video" ? detectors.pose?.detectForVideo(frame, ts) : detectors.pose?.detect(frame);

  const faces = faceResult.faceLandmarks.map((landmarks, i) =>
    toFace(landmarks as Point[], faceResult.facialTransformationMatrixes?.[i]),
  );
  const only = faces.length === 1 ? faces[0]! : undefined;
  const box = only ? faceBox(only.landmarks) : null;

  const ctx = frame.getContext("2d", { willReadFrequently: true });
  const lighting =
    box && ctx
      ? lightingFromPixels(ctx.getImageData(0, 0, frame.width, frame.height).data, frame.width, frame.height, box)
      : undefined;

  const input: FrameInput = {
    width: frame.width,
    height: frame.height,
    faces,
    pose: poseResult ? (poseResult.landmarks[0] as Point[] | undefined) ?? [] : undefined,
    lighting,
  };
  const results = evaluate(input);
  if (process.env.NODE_ENV !== "production") {
    // Dev-only tap for tuning thresholds and for e2e diagnostics: window.__cmCapture
    (window as unknown as Record<string, unknown>).__cmCapture = {
      size: [frame.width, frame.height],
      faceBox: box,
      shoulders: input.pose ? [input.pose[11], input.pose[12]] : null,
      poseCount: input.pose?.length ?? null,
      lighting,
      results,
    };
  }
  // An empty pose list means the model ran and found no body: shoulders fail, not skip.
  return { results, box, nose: only?.landmarks[1], landmarks: only?.landmarks, aspect: frame.width / frame.height };
}

function drawRegion(
  source: CanvasImageSource,
  crop: { sx: number; sy: number; sw: number; sh: number },
  target: HTMLCanvasElement,
): HTMLCanvasElement {
  const scale = ANALYSIS_LONG_SIDE / Math.max(crop.sw, crop.sh);
  target.width = Math.max(1, Math.round(crop.sw * scale));
  target.height = Math.max(1, Math.round(crop.sh * scale));
  target.getContext("2d", { willReadFrequently: true })!.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, target.width, target.height);
  return target;
}

type Crop = { sx: number; sy: number; sw: number; sh: number };

/**
 * Analyse a region of a live video frame. The region is drawn to a small
 * canvas first, so face size, spacing and lighting are all measured on exactly
 * what the user will send.
 */
export function analyseFrame(detectors: Detectors, video: CanvasImageSource, crop: Crop, now: number): Analysis {
  return run(detectors, drawRegion(video, crop, (liveCanvas ??= document.createElement("canvas"))), now, "video");
}

/**
 * Analyse a still (an upload, or a captured photo before it is sent) in
 * MediaPipe's still-image mode, so tracking from the live preview can't
 * influence the verdict. Switches modes and back, so call it from one place at
 * a time.
 */
export async function analyseStill(detectors: Detectors, image: CanvasImageSource, crop: Crop): Promise<Analysis> {
  const set = (runningMode: "IMAGE" | "VIDEO") =>
    Promise.all([detectors.face.setOptions({ runningMode }), detectors.pose?.setOptions({ runningMode })]);
  await set("IMAGE");
  try {
    return run(detectors, drawRegion(image, crop, (stillCanvas ??= document.createElement("canvas"))), performance.now(), "image");
  } finally {
    await set("VIDEO");
  }
}
