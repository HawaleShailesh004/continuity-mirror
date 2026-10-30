/*
 * Result check, browser half (elite-plan B2). Measures an image with two MediaPipe models that run
 * on the device: Face Landmarker (geometry) and the hair segmenter (a hair mask, then colour).
 * Both are self-hosted under /mediapipe and loaded lazily, so only the screens that check results pay
 * for them (~4.5 MB, one time). Nothing here is sent anywhere; the check never needs the network
 * after the models load.
 */
import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import type { Point } from "../capture/checks";
import { sampleHair, type HairSample } from "./colour";
import type { Size } from "./face";

const BASE = "/mediapipe";
/** Long side the analysis runs at. YouCam results are 768 × 1024; baselines are scaled to match. */
const LONG_SIDE = 1024;

type Models = { face: FaceLandmarker; hair: ImageSegmenter };
let loading: Promise<Models> | undefined;

async function create(delegate: "GPU" | "CPU"): Promise<Models> {
  const { FaceLandmarker, FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
  const face = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${BASE}/face_landmarker.task`, delegate },
    runningMode: "IMAGE",
    numFaces: 1,
  });
  const hair = await ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${BASE}/hair_segmenter.tflite`, delegate },
    runningMode: "IMAGE",
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  return { face, hair };
}

export function loadCheckModels(): Promise<Models> {
  loading ??= create("GPU")
    .catch(() => create("CPU"))
    .catch((error) => {
      loading = undefined; // allow a retry
      throw error;
    });
  return loading;
}

export type Measurement = {
  size: Size;
  /** The one face's landmarks, or null if no single face was found. */
  landmarks: Point[] | null;
  /** Trimmed-median hair colour, or null if no hair was found. */
  hair: HairSample | null;
};

async function decode(source: Blob | string): Promise<ImageBitmap> {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  return createImageBitmap(blob);
}

/** Landmarks and hair colour of one image. `source` is a Blob or a same-origin URL. */
export async function measure(source: Blob | string): Promise<Measurement> {
  const { face, hair } = await loadCheckModels();
  const bitmap = await decode(source);
  try {
    const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const size = { width: canvas.width, height: canvas.height };

    const faces = face.detect(canvas).faceLandmarks;
    const landmarks = faces.length === 1 ? (faces[0] as Point[]) : null;

    const segmented = hair.segment(canvas);
    // The model's classes are [background, hair]; the hair mask is the last one.
    const masks = segmented.confidenceMasks;
    const mask = masks?.[masks.length - 1]?.getAsFloat32Array();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const sample = mask && mask.length === canvas.width * canvas.height ? sampleHair(pixels, mask) : null;
    segmented.close();
    return { size, landmarks, hair: sample };
  } finally {
    bitmap.close();
  }
}
