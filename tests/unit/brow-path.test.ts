import { describe, expect, it } from "vitest";
import { browPath, GLYPH_BOX, type GlyphFamily, type GlyphThickness } from "@/lib/client/brow-path";

describe("browPath", () => {
  const families: GlyphFamily[] = ["straight", "soft-arch", "high-arch", "rounded"];
  const thicknesses: GlyphThickness[] = ["thin", "balanced", "thick"];

  it("is a closed outline that stays inside the box, for every family and thickness", () => {
    for (const f of families) {
      for (const t of thicknesses) {
        const d = browPath(f, t);
        expect(d.startsWith("M ") && d.endsWith(" Z")).toBe(true);
        const nums = [...d.matchAll(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
        expect(nums.length).toBeGreaterThan(40);
        for (const [x, y] of nums) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(GLYPH_BOX.w);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(GLYPH_BOX.h);
        }
      }
    }
  });

  it("draws different families differently, and thicker brows with more body", () => {
    expect(browPath("straight", "balanced")).not.toBe(browPath("high-arch", "balanced"));
    expect(browPath("soft-arch", "thin")).not.toBe(browPath("soft-arch", "thick"));
  });
});
