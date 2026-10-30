// Minimal, dependency-free image sniffing (magic bytes + header dimensions). Isomorphic.

export type SniffedImage =
  | { type: "jpeg" | "png" | "webp"; width: number; height: number }
  | { type: "heic"; width?: never; height?: never }
  | { type: "unknown"; width?: never; height?: never };

export function sniffImage(buf: Uint8Array): SniffedImage {
  const at = (i: number) => buf[i] ?? 0;
  const ascii = (from: number, len: number) => String.fromCharCode(...buf.subarray(from, from + len));
  const u16be = (i: number) => (at(i) << 8) | at(i + 1);
  const u32be = (i: number) => ((at(i) << 24) | (at(i + 1) << 16) | (at(i + 2) << 8) | at(i + 3)) >>> 0;
  const u16le = (i: number) => at(i) | (at(i + 1) << 8);
  const u24le = (i: number) => at(i) | (at(i + 1) << 8) | (at(i + 2) << 16);

  if (at(0) === 0x89 && ascii(1, 3) === "PNG") return { type: "png", width: u32be(16), height: u32be(20) };

  if (at(0) === 0xff && at(1) === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (at(i) !== 0xff) return { type: "unknown" };
      const marker = at(i + 1);
      // SOF0–SOF15 except DHT (C4), JPG (C8), DAC (CC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: "jpeg", height: u16be(i + 5), width: u16be(i + 7) };
      }
      i += 2 + u16be(i + 2);
    }
    return { type: "unknown" };
  }

  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8X") return { type: "webp", width: u24le(24) + 1, height: u24le(27) + 1 };
    if (chunk === "VP8 ") return { type: "webp", width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = (i: number) => at(21 + i);
      return { type: "webp", width: 1 + (((b(1) & 0x3f) << 8) | b(0)), height: 1 + (((b(3) & 0xf) << 10) | (b(2) << 2) | ((b(1) & 0xc0) >> 6)) };
    }
  }

  if (ascii(4, 4) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(ascii(8, 4))) return { type: "heic" };
  return { type: "unknown" };
}

/** Dimensions after the server's normalisation: JPEG, long side exactly 1024. */
export function normalisedSize(width: number, height: number) {
  const scale = 1024 / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function toBase64(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function sha256Hex(buf: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
