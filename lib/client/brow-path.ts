/*
 * A drawing of a brow shape, made from its family and thickness (no catalog
 * code is ever shown). The outline is a closed polyline in a 120 × 44 box: a
 * centre line for the family, offset above and below by a half-thickness that
 * tapers towards the tail. Pure, so it can be tested and drawn anywhere.
 */
export type GlyphFamily = "straight" | "soft-arch" | "high-arch" | "rounded";
export type GlyphThickness = "thin" | "balanced" | "thick";

export const GLYPH_BOX = { w: 120, h: 44 } as const;

const HALF: Record<GlyphThickness, number> = { thin: 2.4, balanced: 4, thick: 6 };
const N = 28;

/** Centre line height (y, down is larger) at u in 0..1 from the front of the brow to the tail. */
function centre(family: GlyphFamily, u: number): number {
  switch (family) {
    case "straight":
      return 26 - 6 * u;
    case "soft-arch":
      return 30 - 14 * (1 - ((u - 0.6) / 0.6) ** 2);
    case "high-arch":
      return 34 - 24 * (1 - Math.abs((u - 0.62) / 0.62) ** 1.6);
    case "rounded":
      return 32 - 16 * Math.sin(Math.PI * u) ** 0.8;
  }
}

export function browPath(family: GlyphFamily, thickness: GlyphThickness): string {
  const xs = Array.from({ length: N + 1 }, (_, i) => i / N);
  const at = (u: number, sign: 1 | -1) => {
    const half = HALF[thickness] * (0.55 + 0.45 * (1 - u) ** 0.8);
    return `${(8 + u * 104).toFixed(1)} ${(centre(family, u) + sign * half).toFixed(1)}`;
  };
  const top = xs.map((u) => at(u, -1));
  const bottom = [...xs].reverse().map((u) => at(u, 1));
  return `M ${[...top, ...bottom].join(" L ")} Z`;
}
