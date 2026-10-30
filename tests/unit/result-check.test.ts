import { describe, expect, it } from "vitest";
import { deltaE2000, hexToLab, labToHex, repairColour, rgbToLab, sampleHair } from "@/lib/client/check/colour";
import { eyeDistance, faceDrift } from "@/lib/client/check/face";
import { judge } from "@/lib/client/check/judge";
import type { Point } from "@/lib/client/capture/checks";

describe("CIELAB", () => {
  it("maps black, white and red to their known coordinates", () => {
    expect(rgbToLab(0, 0, 0).l).toBeCloseTo(0, 1);
    expect(rgbToLab(255, 255, 255).l).toBeCloseTo(100, 1);
    const red = rgbToLab(255, 0, 0);
    expect(red.l).toBeCloseTo(53.24, 1);
    expect(red.a).toBeCloseTo(80.09, 1);
    expect(red.b).toBeCloseTo(67.2, 1);
  });

  it("round-trips a hex colour", () => {
    for (const hex of ["#2A1D18", "#C8A27C", "#FFFFFF", "#000000", "#7FA6DB"]) expect(labToHex(hexToLab(hex))).toBe(hex);
  });
});

describe("deltaE2000", () => {
  // Reference pairs from Sharma, Wu & Dalal (2005), "The CIEDE2000 colour-difference formula".
  it.each([
    [{ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ l: 50, a: 3.1571, b: -77.2803 }, { l: 50, a: 0, b: -82.7485 }, 2.8615],
    [{ l: 50, a: 2.5, b: 0 }, { l: 50, a: 0, b: -2.5 }, 4.3065],
    [{ l: 50, a: 2.5, b: 0 }, { l: 73, a: 25, b: -18 }, 27.1492],
  ])("matches the published value %#", (p, q, expected) => {
    expect(deltaE2000(p, q)).toBeCloseTo(expected, 3);
    expect(deltaE2000(q, p)).toBeCloseTo(expected, 3);
  });

  it("is zero for the same colour", () => {
    expect(deltaE2000(hexToLab("#2A1D18"), hexToLab("#2A1D18"))).toBe(0);
  });

  it("reads brown-to-blue-black as a clear difference", () => {
    expect(deltaE2000(hexToLab("#4A3226"), hexToLab("#14181F"))).toBeGreaterThan(10);
  });
});

describe("repairColour", () => {
  it("aims past the target, away from the drift", () => {
    const target = hexToLab("#211B13");
    const lighter = repairColour(target, hexToLab("#30291E"));
    expect(lighter.l).toBeLessThan(target.l);
    const darker = repairColour(hexToLab("#99968D"), hexToLab("#6C5549"));
    expect(darker.l).toBeGreaterThan(hexToLab("#99968D").l);
  });

  it("does nothing when there is no drift, and never leaves the lightness range", () => {
    const t = hexToLab("#4A3226");
    expect(repairColour(t, t)).toEqual(t);
    expect(repairColour({ l: 3, a: 0, b: 0 }, { l: 60, a: 0, b: 0 }).l).toBe(2);
    expect(repairColour({ l: 97, a: 0, b: 0 }, { l: 10, a: 0, b: 0 }).l).toBe(98);
  });
});

describe("sampleHair", () => {
  const W = 20;
  const H = 20;
  function image(fill: (i: number) => [number, number, number]) {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) px.set([...fill(i), 255], i * 4);
    return px;
  }

  it("measures the masked region only", () => {
    const px = image((i) => (i < 200 ? [74, 50, 38] : [200, 220, 240]));
    const mask = Float32Array.from({ length: W * H }, (_, i) => (i < 200 ? 1 : 0));
    const hair = sampleHair(px, mask)!;
    expect(hair.hex).toBe("#4A3226");
    expect(hair.coverage).toBeCloseTo(0.5, 5);
  });

  it("ignores specular highlights and the darkest shadow pixels", () => {
    // 20 % bright highlights, 5 % near-black, rest brown: the median should stay brown.
    const px = image((i) => (i % 20 === 0 ? [20, 14, 12] : i % 5 === 1 ? [250, 240, 230] : [74, 50, 38]));
    const mask = new Float32Array(W * H).fill(1);
    const hair = sampleHair(px, mask)!;
    expect(deltaE2000(hair.lab, hexToLab("#4A3226"))).toBeLessThan(2);
  });

  it("returns null when there is almost no hair", () => {
    const px = image(() => [74, 50, 38]);
    const mask = new Float32Array(W * H);
    mask[0] = 1;
    expect(sampleHair(px, mask)).toBeNull();
  });
});

describe("faceDrift", () => {
  const SIZE = { width: 768, height: 1024 };
  /** A 478-point array whose stable landmarks sit on a plausible, asymmetric face, in pixel units. */
  const FACE: Record<number, [number, number]> = {
    33: [300, 400], 133: [345, 402], 159: [322, 392], 145: [322, 410],
    362: [425, 402], 263: [470, 400], 386: [448, 392], 374: [448, 410],
    6: [384, 400], 1: [384, 470], 98: [360, 490], 327: [408, 490],
    61: [340, 560], 291: [430, 558], 13: [385, 552], 14: [385, 572], 152: [384, 680],
  };
  function landmarks(transform: (x: number, y: number) => [number, number] = (x, y) => [x, y], size = SIZE): Point[] {
    const pts: Point[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    for (const [i, [x, y]] of Object.entries(FACE)) {
      const [tx, ty] = transform(x, y);
      pts[Number(i)] = { x: tx / size.width, y: ty / size.height };
    }
    return pts;
  }

  it("is zero for the same face", () => {
    expect(faceDrift(landmarks(), SIZE, landmarks(), SIZE)).toBeCloseTo(0, 6);
  });

  it("ignores a shift, a tilt and a different scale", () => {
    const [cx, cy] = [384, 500];
    const moved = landmarks((x, y) => {
      const a = (6 * Math.PI) / 180;
      const [dx, dy] = [(x - cx) * 1.15, (y - cy) * 1.15];
      return [cx + 30 + dx * Math.cos(a) - dy * Math.sin(a), cy - 20 + dx * Math.sin(a) + dy * Math.cos(a)];
    });
    expect(faceDrift(landmarks(), SIZE, moved, SIZE)).toBeLessThan(0.001);
  });

  it("notices a mouth that moved", () => {
    const changed = landmarks((x, y) => (y > 540 && y < 600 ? [x, y + 22] : [x, y]));
    expect(faceDrift(landmarks(), SIZE, changed, SIZE)).toBeGreaterThan(0.05);
  });

  it("measures in eye distances, whatever the image size", () => {
    const small = { width: 384, height: 512 };
    const half = landmarks((x, y) => [x / 2, y / 2], small);
    expect(faceDrift(landmarks(), SIZE, half, small)).toBeCloseTo(0, 6);
    expect(eyeDistance(landmarks(), SIZE)).toBeGreaterThan(100);
  });
});

describe("judge", () => {
  const SIZE = { width: 768, height: 1024 };
  const FACE: Record<number, [number, number]> = {
    33: [300, 400], 133: [345, 402], 159: [322, 392], 145: [322, 410],
    362: [425, 402], 263: [470, 400], 386: [448, 392], 374: [448, 410],
    6: [384, 400], 1: [384, 470], 98: [360, 490], 327: [408, 490],
    61: [340, 560], 291: [430, 558], 13: [385, 552], 14: [385, 572], 152: [384, 680],
  };
  const face = (dy = 0): Point[] => {
    const pts: Point[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    for (const [i, [x, y]] of Object.entries(FACE)) pts[Number(i)] = { x: x / SIZE.width, y: (y + (y > 540 && y < 600 ? dy : 0)) / SIZE.height };
    return pts;
  };
  const hair = (hex: string, coverage = 0.25) => ({ lab: hexToLab(hex), hex, coverage });
  const m = (hexValue: string | null, opts: { landmarks?: Point[] | null; coverage?: number } = {}) => ({
    size: SIZE,
    landmarks: opts.landmarks === undefined ? face() : opts.landmarks,
    hair: hexValue ? hair(hexValue, opts.coverage) : null,
  });
  const base = m("#211B13");

  it("passes a result whose face and colour were kept", () => {
    const r = judge(base, m("#251F16"), { expectOwnColour: true });
    expect(r.outcome).toBe("checked");
    expect(r.colour.status).toBe("kept");
    expect(r.face.status).toBe("unchanged");
    expect(r.repairHex).toBeUndefined();
  });

  it("asks for a repair, with the baseline's colour, when own colour drifted", () => {
    const r = judge(base, m("#33261D"), { expectOwnColour: true });
    expect(r.outcome).toBe("repairable");
    expect(r.colour.status).toBe("drifted");
    // Asks for a step darker than the baseline, because the result came back lighter than it.
    expect(r.repairHex).toMatch(/^#[0-9A-F]{6}$/);
    expect(hexToLab(r.repairHex!).l).toBeLessThan(hexToLab("#211B13").l);
  });

  it("never repairs a colour the route meant to change", () => {
    const r = judge(base, m("#6C5549"), { expectOwnColour: false });
    expect(r.outcome).toBe("checked");
    expect(r.colour.status).toBe("skipped");
  });

  it("skips the colour check when the hair is too short to measure", () => {
    const r = judge(base, m("#34251E", { coverage: 0.04 }), { expectOwnColour: true });
    expect(r.colour.status).toBe("skipped");
    expect(r.outcome).toBe("checked");
  });

  it("flags a moved face and does not repair it", () => {
    const r = judge(base, m("#33261D", { landmarks: face(40) }), { expectOwnColour: true });
    expect(r.face.status).toBe("changed");
    expect(r.outcome).toBe("needs-look");
    expect(r.repairHex).toBeUndefined();
  });

  it("claims nothing when a face was not found", () => {
    expect(judge(base, m("#251F16", { landmarks: null }), { expectOwnColour: true }).outcome).toBe("unchecked");
    expect(judge(m("#211B13", { landmarks: null }), m("#251F16"), { expectOwnColour: true }).outcome).toBe("unchecked");
  });

  it("claims nothing about colour when no hair was found", () => {
    const r = judge(base, m(null), { expectOwnColour: true });
    expect(r.colour.status).toBe("skipped");
    expect(r.outcome).toBe("checked");
  });
});
