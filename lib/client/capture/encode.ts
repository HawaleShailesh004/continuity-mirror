/*
 * Getting pixels ready to send (frontend plan §6): decode with the right
 * orientation, downsize to a long side of 1600, and encode as JPEG ≤ 1.5 MB.
 * Vercel's function body limit is 4.5 MB and the server normalises to 1024
 * anyway, so there is no point sending more.
 */

export const MAX_LONG_SIDE = 1600;
export const MAX_BYTES = 1.5 * 1024 * 1024;

/** Types the server accepts. HEIC is rejected there too; most phones convert to JPEG in the picker. */
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export class UnsupportedImageError extends Error {
  constructor(readonly hint: "heic" | "format") {
    super(`unsupported image (${hint})`);
    this.name = "UnsupportedImageError";
  }
}

/** Decode a picked file with EXIF orientation applied. Throws UnsupportedImageError for HEIC or unreadable files. */
export async function decodeFile(file: File): Promise<ImageBitmap> {
  const type = file.type.toLowerCase();
  if (type.includes("heic") || type.includes("heif") || /\.(heic|heif)$/i.test(file.name)) {
    throw new UnsupportedImageError("heic");
  }
  if (type && !ACCEPTED_TYPES.includes(type as (typeof ACCEPTED_TYPES)[number])) {
    throw new UnsupportedImageError("format");
  }
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UnsupportedImageError("format");
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not encode image"))), "image/jpeg", quality),
  );
}

/**
 * Draw `source` (optionally a crop of it) scaled to fit MAX_LONG_SIDE and
 * encode it as JPEG. Quality steps down from 0.9 until the file fits; if even
 * the lowest quality is too big, the size shrinks and it tries again.
 * Never mirrored: a front camera preview is mirrored on screen only.
 */
export async function encodeForUpload(
  source: CanvasImageSource,
  crop: { sx: number; sy: number; sw: number; sh: number },
): Promise<{ blob: Blob; width: number; height: number }> {
  let scale = Math.min(1, MAX_LONG_SIDE / Math.max(crop.sw, crop.sh));
  const canvas = document.createElement("canvas");

  for (let attempt = 0; attempt < 4; attempt++) {
    canvas.width = Math.max(1, Math.round(crop.sw * scale));
    canvas.height = Math.max(1, Math.round(crop.sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.9, 0.82, 0.74, 0.66, 0.6]) {
      const blob = await toBlob(canvas, quality);
      if (blob.size <= MAX_BYTES) return { blob, width: canvas.width, height: canvas.height };
    }
    scale *= 0.85;
  }
  throw new Error("image could not be made small enough");
}

/** The whole of an image, for uploads (no crop). */
export const wholeImage = (width: number, height: number) => ({ sx: 0, sy: 0, sw: width, sh: height });

/**
 * The centred 3:4 portrait region of a frame. The camera preview shows exactly
 * this region, so what you see is what is checked and what is sent.
 */
export function portraitCrop(width: number, height: number) {
  const aspect = 3 / 4;
  if (width / height > aspect) {
    const sw = height * aspect;
    return { sx: (width - sw) / 2, sy: 0, sw, sh: height };
  }
  const sh = width / aspect;
  return { sx: 0, sy: (height - sh) / 2, sw: width, sh };
}

/**
 * Re-encode a PNG (YouCam's colour step returns ~1 MB PNGs) as a JPEG so the
 * device stores a fraction of the bytes. Anything else, or any failure, is
 * returned untouched: a result is never lost to a failed optimisation.
 */
export async function recompressPng(blob: Blob): Promise<Blob> {
  if (blob.type !== "image/png" || typeof createImageBitmap === "undefined") return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    const jpeg = await toBlob(canvas, 0.92);
    return jpeg.size < blob.size ? jpeg : blob;
  } catch {
    return blob;
  }
}
