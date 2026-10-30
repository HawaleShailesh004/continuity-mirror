import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/server/http/errors";
import { normaliseImage } from "@/lib/server/images/normalise";

const solid = (width: number, height: number, channels: 3 | 4 = 3) =>
  sharp({ create: { width, height, channels, background: channels === 4 ? { r: 200, g: 120, b: 80, alpha: 0.5 } : { r: 200, g: 120, b: 80 } } });

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return (e as ApiError).body;
  }
}

describe("normaliseImage", () => {
  it("makes a JPEG with long side 1024, keeping aspect ratio", async () => {
    const out = await normaliseImage(await solid(1536, 2048).jpeg().toBuffer());
    expect({ w: out.width, h: out.height }).toEqual({ w: 768, h: 1024 });
    const meta = await sharp(out.jpeg).metadata();
    expect(meta.format).toBe("jpeg");
    expect(out.baselineId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("applies EXIF orientation, then strips all metadata", async () => {
    // Stored landscape 1200×900 with orientation 6 (rotate 90°) → upright portrait.
    const input = await solid(1200, 900).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await normaliseImage(input);
    expect({ w: out.width, h: out.height }).toEqual({ w: 768, h: 1024 });
    const meta = await sharp(out.jpeg).metadata();
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
  });

  it("converts PNG (with alpha) and WebP to JPEG, upscaling small-but-valid images to 1024", async () => {
    const png = await normaliseImage(await solid(600, 800, 4).png().toBuffer());
    expect((await sharp(png.jpeg).metadata()).format).toBe("jpeg");
    expect(Math.max(png.width, png.height)).toBe(1024);
    const webp = await normaliseImage(await solid(800, 600).webp().toBuffer());
    expect({ w: webp.width, h: webp.height }).toEqual({ w: 1024, h: 768 });
  });

  it("is deterministic: same input, same baselineId", async () => {
    const input = await solid(900, 1200).jpeg().toBuffer();
    expect((await normaliseImage(input)).baselineId).toBe((await normaliseImage(input)).baselineId);
  });

  it("rejects too small (short side < 512 after orientation)", async () => {
    expect(await codeOf(normaliseImage(await solid(500, 1600).jpeg().toBuffer()))).toMatchObject({ code: "IMAGE_TOO_SMALL", messageKey: "image.tooSmall" });
  });

  it("rejects too many bytes and pixel bombs", async () => {
    expect(await codeOf(normaliseImage(new Uint8Array(4_000_001)))).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    const bomb = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: "#fff" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(await codeOf(normaliseImage(bomb))).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("rejects HEIC with a hint, and non-images", async () => {
    const heic = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic"), ...new Uint8Array(64)]);
    expect(await codeOf(normaliseImage(heic))).toMatchObject({ code: "IMAGE_FORMAT", details: { hint: "heic" } });
    expect(await codeOf(normaliseImage(new TextEncoder().encode("definitely not an image")))).toMatchObject({ code: "IMAGE_FORMAT" });
    expect(await codeOf(normaliseImage(await solid(800, 800).gif().toBuffer()))).toMatchObject({ code: "IMAGE_FORMAT" });
  });
});
