import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { sniffImage } from "@/lib/contracts/mocks/image";
import { ApiError } from "../http/errors";

// The one image every YouCam endpoint gets (docs/YOUCAM_FACTS.md): JPEG, long side 1024, upright,
// metadata stripped. Hair-transfer is the strictest consumer (JPG only, long side ≤ 1024).
export const UPLOAD_MAX_BYTES = 4_000_000;
export const MIN_SHORT_SIDE = 512;
export const LONG_SIDE = 1024;
const MAX_INPUT_PIXELS = 40_000_000; // decompression-bomb guard (a 12 MP phone photo is fine)
const ACCEPTED = new Set(["jpeg", "png", "webp"]);

export type NormalisedImage = { jpeg: Buffer; width: number; height: number; baselineId: string };

export async function normaliseImage(input: Uint8Array): Promise<NormalisedImage> {
  if (input.byteLength > UPLOAD_MAX_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE");
  // Phones send HEIC; tell the client specifically so it can convert or ask for JPG/PNG.
  if (sniffImage(input).type === "heic") throw new ApiError("IMAGE_FORMAT", { details: { hint: "heic" } });

  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    // Header only (no decode), so no pixel limit here; it's checked explicitly below.
    meta = await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    throw new ApiError("IMAGE_FORMAT");
  }
  if (meta.format === "heif") throw new ApiError("IMAGE_FORMAT", { details: { hint: "heic" } });
  if (!ACCEPTED.has(meta.format)) throw new ApiError("IMAGE_FORMAT");
  if (meta.width * meta.height > MAX_INPUT_PIXELS) throw new ApiError("PAYLOAD_TOO_LARGE");

  const upright = meta.autoOrient ?? { width: meta.width, height: meta.height };
  if (Math.min(upright.width, upright.height) < MIN_SHORT_SIDE) throw new ApiError("IMAGE_TOO_SMALL");

  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, autoOrient: true })
      .resize({ width: LONG_SIDE, height: LONG_SIDE, fit: "inside" })
      .flatten({ background: "#ffffff" }) // PNG/WebP transparency → white, JPEG has no alpha
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height, baselineId: createHash("sha256").update(data).digest("hex") };
  } catch {
    throw new ApiError("IMAGE_FORMAT");
  }
}
