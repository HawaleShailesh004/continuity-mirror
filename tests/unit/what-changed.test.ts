import { describe, expect, it } from "vitest";
import { colours, styles } from "@/lib/catalog";
import { whatChanged } from "@/lib/client/what-changed";
import type { IdentitySnapshot } from "@/lib/contracts";

const meera: IdentitySnapshot = {
  colourFamily: "dark-brown",
  length: "shoulder",
  parting: "left",
  fringe: false,
  texture: "straight",
  brows: { shape: "soft-arch", darkness: "dark" },
};
const own = { source: "own", hex: "#2A1D18" } as const;
const bob = { length: "chin", texture: "straight", fringe: false, parting: "left" } as const;

describe("whatChanged", () => {
  it("says what stayed the same when only the colour is the person's own", () => {
    const r = whatChanged({ ...bob, length: "shoulder" }, own, meera, colours);
    expect(r.changes).toEqual([]);
    expect(r.line).toMatch(/same/i);
  });

  it("names a shorter length and keeps the colour note", () => {
    const r = whatChanged(bob, own, meera, colours);
    expect(r.changes[0]).toMatch(/shorter/i);
    expect(r.line).toMatch(/shorter/i);
  });

  it("names a colour change by its preset label", () => {
    const preset = colours[0]!;
    const r = whatChanged({ ...bob, length: "shoulder" }, { source: "preset", presetId: preset.id, mode: "full" }, meera, colours);
    expect(r.line.toLowerCase()).toContain(preset.label.toLowerCase());
  });

  it("notices a fringe being added or dropped", () => {
    expect(whatChanged({ ...bob, length: "shoulder", fringe: true }, own, meera, colours).changes).toContainEqual(expect.stringMatching(/fringe/i));
    expect(whatChanged({ ...bob, length: "shoulder", fringe: false }, own, { ...meera, fringe: true }, colours).changes).toContainEqual(expect.stringMatching(/fringe/i));
  });

  it("never returns more than three changes and always some words", () => {
    for (const s of styles) {
      const r = whatChanged(s, own, meera, colours);
      expect(r.changes.length).toBeLessThanOrEqual(3);
      expect(r.line.length).toBeGreaterThan(3);
    }
  });

  it("names a different parting, after the colour note, and only when both partings are known", () => {
    const centre = styles.find((s) => s.id === "f-medium-straight")!;
    expect(whatChanged(centre, own, meera, colours).line).toBe("Centre parting · Your colour kept");
    expect(whatChanged({ ...centre, parting: "none" }, own, meera, colours).changes).toEqual([]);
    expect(whatChanged(centre, own, { ...meera, parting: "none" }, colours).changes).toEqual([]);
  });
});
