import { describe, expect, it } from "vitest";
import { styles } from "@/lib/catalog";
import { askForLine, shapeOnly } from "@/lib/client/ask-for";
import type { IdentitySnapshot } from "@/lib/contracts";

const meera: IdentitySnapshot = {
  colourFamily: "dark-brown",
  length: "shoulder",
  parting: "left",
  fringe: false,
  texture: "straight",
  brows: { shape: "soft-arch", darkness: "dark" },
};
const style = (id: string) => styles.find((s) => s.id === id)!;

describe("askForLine (F9)", () => {
  it("uses the person's parting, not the template's", () => {
    // f-medium-straight's template says "centre parting"; Meera's snapshot says Left.
    const line = askForLine(style("f-medium-straight"), meera, true);
    expect(line).toContain("left parting");
    expect(line).not.toMatch(/centre/i);
    expect(line).toContain("Shoulder-length straight");
  });

  it("uses the person's fringe answer in both directions", () => {
    expect(askForLine(style("f-hush-cut"), meera, false)).toMatch(/no fringe/);
    expect(askForLine(style("f-hush-cut"), meera, false)).not.toMatch(/curtain/);
    expect(askForLine(style("f-modern-mid-part-bob"), { ...meera, fringe: true, parting: "none" }, false)).toMatch(/with a fringe/);
  });

  it("names the person's colour only when the look keeps it", () => {
    expect(askForLine(style("f-medium-straight"), meera, true)).toContain("dark brown");
    expect(askForLine(style("f-medium-straight"), meera, false)).not.toContain("dark brown");
  });

  it("never carries a template parting or fringe word into any style", () => {
    const person: IdentitySnapshot = { ...meera, parting: "none", fringe: false };
    for (const s of styles) {
      const shape = shapeOnly(s.askFor);
      expect(shape, s.id).not.toMatch(/parting|fringe|bangs/i);
      expect(shape.length, s.id).toBeGreaterThan(4);
      expect(shape, s.id).not.toMatch(/,\s*$|\s{2}|\band\s*$/);
      expect(askForLine(s, person, false), s.id).not.toMatch(/parting|bangs/i);
    }
  });

  it("falls back to the template's shape alone without answers", () => {
    expect(askForLine(style("f-medium-straight"), null, false)).toBe("Shoulder-length straight");
  });
});
