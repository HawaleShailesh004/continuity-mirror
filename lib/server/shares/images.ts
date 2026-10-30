import "server-only";
import sharp from "sharp";
import { sniffImage } from "@/lib/contracts/mocks/image";
import { ApiError } from "../http/errors";

// Share images are results the owner already has on their device. They are re-encoded so nothing but
// pixels is stored: no EXIF (GPS, device), no embedded profiles, one predictable format.
export const SHARE_IMAGE_MAX_BYTES = 2_000_000;
export const SHARE_BODY_MAX_BYTES = 4_400_000; // Vercel's function body limit is 4.5 MB
const MIN_SHORT_SIDE = 256;
const MAX_LONG_SIDE = 1024;
const MAX_INPUT_PIXELS = 40_000_000;

export async function prepareShareImage(input: Uint8Array): Promise<Buffer> {
  if (input.byteLength > SHARE_IMAGE_MAX_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE");
  const sniffed = sniffImage(input);
  if (sniffed.type === "unknown" || sniffed.type === "heic") throw new ApiError("IMAGE_FORMAT", sniffed.type === "heic" ? { details: { hint: "heic" } } : {});
  try {
    const meta = await sharp(input, { limitInputPixels: false }).metadata();
    const upright = meta.autoOrient ?? { width: meta.width, height: meta.height };
    if (meta.width * meta.height > MAX_INPUT_PIXELS) throw new ApiError("PAYLOAD_TOO_LARGE");
    if (Math.min(upright.width, upright.height) < MIN_SHORT_SIDE) throw new ApiError("IMAGE_TOO_SMALL");
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, autoOrient: true })
      .resize({ width: MAX_LONG_SIDE, height: MAX_LONG_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("IMAGE_FORMAT");
  }
}
