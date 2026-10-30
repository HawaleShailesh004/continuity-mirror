/*
 * Result check, colour half (elite-plan B2). Pure functions: given an image's pixels and a hair mask,
 * measure the hair colour in CIELAB and compare two of them with CIEDE2000. The browser side
 * (lib/client/check/segment.ts) supplies the mask; nothing here needs MediaPipe or a canvas.
 *
 * "Hair colour" is a trimmed median of the masked pixels, not a mean: a median ignores the odd
 * pixel of scalp, background or ear, and trimming the brightest and darkest tails ignores specular
 * shine and the shadow under the hair, which would otherwise make glossy results read as lighter.
 */

export type Lab = { l: number; a: number; b: number };

const srgbToLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

// D65 white point.
const WHITE = { x: 0.95047, y: 1, z: 1.08883 };
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fInv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

export function rgbToLab(r: number, g: number, b: number): Lab {
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / WHITE.x;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / WHITE.y;
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / WHITE.z;
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToRgb(lab: Lab): [number, number, number] {
  const fy = (lab.l + 16) / 116;
  const [x, y, z] = [fInv(fy + lab.a / 500) * WHITE.x, fInv(fy) * WHITE.y, fInv(fy - lab.b / 200) * WHITE.z];
  return [
    linearToSrgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    linearToSrgb(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    linearToSrgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  ];
}

export function labToHex(lab: Lab): string {
  return `#${labToRgb(lab)
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

export function hexToLab(hex: string): Lab {
  const n = Number.parseInt(hex.slice(1), 16);
  return rgbToLab((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/** CIEDE2000 (Sharma, Wu, Dalal 2005). ~2.3 is a just-noticeable difference; ≥ 10 reads as a different colour. */
export function deltaE2000(p: Lab, q: Lab): number {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const c1 = Math.hypot(p.a, p.b);
  const c2 = Math.hypot(q.a, q.b);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1 = (1 + g) * p.a;
  const a2 = (1 + g) * q.a;
  const cp1 = Math.hypot(a1, p.b);
  const cp2 = Math.hypot(a2, q.b);
  const hue = (b: number, a: number) => (b === 0 && a === 0 ? 0 : ((Math.atan2(b, a) * deg) + 360) % 360);
  const h1 = hue(p.b, a1);
  const h2 = hue(q.b, a2);

  const dL = q.l - p.l;
  const dC = cp2 - cp1;
  let dh = 0;
  if (cp1 * cp2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh * rad) / 2);

  const lBar = (p.l + q.l) / 2;
  const cpBar = (cp1 + cp2) / 2;
  let hBar = h1 + h2;
  if (cp1 * cp2 !== 0) {
    if (Math.abs(h1 - h2) > 180) hBar += h1 + h2 < 360 ? 360 : -360;
    hBar /= 2;
  }
  const t = 1 - 0.17 * Math.cos((hBar - 30) * rad) + 0.24 * Math.cos(2 * hBar * rad) + 0.32 * Math.cos((3 * hBar + 6) * rad) - 0.2 * Math.cos((4 * hBar - 63) * rad);
  const sL = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sC = 1 + 0.045 * cpBar;
  const sH = 1 + 0.015 * cpBar * t;
  const rC = 2 * Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7));
  const rT = -Math.sin(2 * 30 * Math.exp(-(((hBar - 275) / 25) ** 2)) * rad) * rC;

  return Math.sqrt((dL / sL) ** 2 + (dC / sC) ** 2 + (dH / sH) ** 2 + rT * (dC / sC) * (dH / sH));
}

/**
 * The colour to ask Hair Color for so a drifted result lands on `target`. A recolour pass keeps some of the
 * lightness it is given, so asking for exactly the target stops short (30 Oct, 10 live repairs of one result:
 * asking for the target gave ΔE 1.5–1.9, asking a step past it, away from the drift, gave 0.8–0.9). One
 * proportional step in CIELAB: target + 0.5 × (target − current), with lightness kept inside 2..98.
 */
export function repairColour(target: Lab, current: Lab, gain = 0.5): Lab {
  const past = (t: number, c: number) => t + gain * (t - c);
  return { l: Math.min(98, Math.max(2, past(target.l, current.l))), a: past(target.a, current.a), b: past(target.b, current.b) };
}

export type HairSample = {
  lab: Lab;
  hex: string;
  /** Pixels that counted, as a fraction of the image. A tiny value means "no hair found". */
  coverage: number;
};

/** Hair masks below this share of the image are treated as "not found" (a bald or cropped frame). */
export const MIN_HAIR_COVERAGE = 0.01;

const median = (sorted: number[]) => sorted[Math.floor(sorted.length / 2)] ?? 0;

/**
 * Trimmed median hair colour of RGBA `pixels` where `mask` (one value 0..1 per pixel) is above 0.5.
 * The darkest `trimDark` and brightest `trimLight` fractions of the masked pixels (by lightness) are dropped first.
 */
export function sampleHair(
  pixels: Uint8ClampedArray | Uint8Array,
  mask: ArrayLike<number>,
  opts: { trimDark?: number; trimLight?: number } = {},
): HairSample | null {
  const { trimDark = 0.05, trimLight = 0.1 } = opts;
  const total = mask.length;
  const picked: Lab[] = [];
  for (let i = 0; i < total; i++) {
    if (mask[i]! <= 0.5) continue;
    picked.push(rgbToLab(pixels[i * 4]!, pixels[i * 4 + 1]!, pixels[i * 4 + 2]!));
  }
  const coverage = picked.length / total;
  if (coverage < MIN_HAIR_COVERAGE) return null;

  picked.sort((x, y) => x.l - y.l);
  const kept = picked.slice(Math.floor(picked.length * trimDark), Math.ceil(picked.length * (1 - trimLight)));
  const lab = {
    l: median(kept.map((p) => p.l)),
    a: median(kept.map((p) => p.a).sort((x, y) => x - y)),
    b: median(kept.map((p) => p.b).sort((x, y) => x - y)),
  };
  return { lab, hex: labToHex(lab), coverage };
}
