import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { catalog, colours, estimateUnits, planSteps, styles } from "@/lib/catalog";
import { JobSpec } from "@/lib/contracts/api";
import { BrowDarkness, BrowShape, ColourFamily, HairLength, IdentitySnapshot, Parting, Texture, type ChangedDimension } from "@/lib/contracts/domain";
import { LENGTHS, TEXTURE_PREFERENCE, ownColour, planAlternatives, planRegrowth, planRoutes, toJobSpec } from "@/lib/planner";

const arbSnapshot = fc.record({
  colourFamily: fc.constantFrom(...ColourFamily.options),
  hairHex: fc.option(fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, "0").toUpperCase()}`), { nil: undefined }),
  length: fc.constantFrom(...HairLength.options),
  parting: fc.constantFrom(...Parting.options),
  fringe: fc.boolean(),
  texture: fc.constantFrom(...Texture.options),
  brows: fc.record({ shape: fc.constantFrom(...BrowShape.options), darkness: fc.constantFrom(...BrowDarkness.options) }),
  beard: fc.option(fc.constantFrom("none", "stubble", "short", "full" as const), { nil: undefined }),
  note: fc.option(fc.string({ maxLength: 140 }), { nil: undefined }),
}) as fc.Arbitrary<IdentitySnapshot>;

const arbDimension = fc.constantFrom<ChangedDimension>("length", "colour", "fringe", "texture");
const arbAudience = fc.constantFrom<"female" | "male" | "all" | undefined>("female", "male", "all", undefined);
const style = (id: string) => styles.find((s) => s.id === id)!;
const idx = (l: string) => LENGTHS.indexOf(l as (typeof LENGTHS)[number]);

describe("planRoutes (property tests over every snapshot)", () => {
  it("always gives exactly three routes, in order, with valid ids and a valid colour", () => {
    fc.assert(
      fc.property(arbSnapshot, arbDimension, arbAudience, (snap, newChapter, audience) => {
        const routes = planRoutes(snap, { newChapter, audience });
        expect(routes.map((r) => r.routeKey)).toEqual(["closest", "easier", "new-chapter"]);
        for (const r of routes) {
          expect(styles.some((s) => s.id === r.styleId)).toBe(true);
          if (r.colour.source === "own") expect(r.colour.hex).toMatch(/^#[0-9A-F]{6}$/);
          if (r.colour.source === "preset") expect(colours.some((c) => c.id === (r.colour as { presetId: string }).presetId)).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("is deterministic", () => {
    fc.assert(fc.property(arbSnapshot, arbDimension, (snap, newChapter) => {
      expect(planRoutes(snap, { newChapter })).toEqual(planRoutes(structuredClone(snap), { newChapter }));
    }));
  });

  it("easier is never longer than closest, and is a different style", () => {
    fc.assert(
      fc.property(arbSnapshot, arbAudience, (snap, audience) => {
        const [closest, easier] = planRoutes(snap, { audience });
        expect(idx(style(easier!.styleId).length)).toBeLessThanOrEqual(idx(style(closest!.styleId).length));
        expect(easier!.styleId).not.toBe(closest!.styleId);
      }),
      { numRuns: 500 },
    );
  });

  it("closest and easier keep the user's colour and texture preferences; coily never gets other textures", () => {
    fc.assert(
      fc.property(arbSnapshot, arbAudience, (snap, audience) => {
        const [closest, easier] = planRoutes(snap, { audience });
        for (const r of [closest!, easier!]) {
          expect(r.colour).toEqual(ownColour(snap));
          if (snap.texture === "coily") expect(style(r.styleId).texture).toBe("coily");
          // Whenever the pool allows, only compatible textures are offered.
          expect(TEXTURE_PREFERENCE[snap.texture]).toContain(style(r.styleId).texture);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("closest is as close to the snapshot's length as the pool allows", () => {
    fc.assert(
      fc.property(arbSnapshot, (snap) => {
        const [closest] = planRoutes(snap, { audience: "all" });
        const best = Math.min(...styles.filter((s) => TEXTURE_PREFERENCE[snap.texture].includes(s.texture)).map((s) => Math.abs(idx(s.length) - idx(snap.length))));
        expect(Math.abs(idx(style(closest!.styleId).length) - idx(snap.length))).toBe(best);
      }),
      { numRuns: 300 },
    );
  });

  it("new chapter changes exactly one dimension, and says which", () => {
    fc.assert(
      fc.property(arbSnapshot, arbDimension, arbAudience, (snap, newChapter, audience) => {
        const [closest, , chapter] = planRoutes(snap, { newChapter, audience });
        const a = style(closest!.styleId);
        const b = style(chapter!.styleId);
        const diffs = (["length", "fringe", "texture"] as const).filter((d) => a[d] !== b[d]);
        const colourChanged = JSON.stringify(chapter!.colour) !== JSON.stringify(closest!.colour);
        const changed = [...diffs, ...(colourChanged ? ["colour" as const] : [])];
        expect(changed).toEqual([chapter!.changedDimension]);
        // Falls back to colour only when the catalog has nothing for the requested dimension.
        if (chapter!.changedDimension !== newChapter) expect(chapter!.changedDimension).toBe("colour");
      }),
      { numRuns: 500 },
    );
  });

  it("new chapter colour differs from the user's colour family", () => {
    fc.assert(
      fc.property(arbSnapshot, (snap) => {
        const chapter = planRoutes(snap).at(2)!;
        if (chapter.colour.source !== "preset") return;
        const id = chapter.colour.presetId;
        expect(colours.find((c) => c.id === id)!.family).not.toBe(snap.colourFamily);
      }),
      { numRuns: 300 },
    );
  });

  it("a beard steers to male-compatible styles by default, without inferring anything else", () => {
    fc.assert(
      fc.property(arbSnapshot, (snap) => {
        const bearded = { ...snap, beard: "full" as const };
        const [closest] = planRoutes(bearded);
        expect(["male", "all"]).toContain(style(closest!.styleId).audience);
      }),
      { numRuns: 200 },
    );
  });

  it("every planned route becomes a valid job spec the pipeline accepts, within the session budget", () => {
    fc.assert(
      fc.property(arbSnapshot, arbDimension, (snap, newChapter) => {
        let units = 0;
        for (const r of planRoutes(snap, { newChapter })) {
          const spec = JobSpec.parse(toJobSpec(r));
          expect(planSteps(spec, catalog).length).toBeGreaterThan(0);
          units += estimateUnits(spec, catalog);
        }
        expect(units).toBeLessThanOrEqual(9); // three routes of at most 3 units each
      }),
      { numRuns: 300 },
    );
  });
});

describe("planRoutes (exhaustive)", () => {
  it("holds every invariant for every length × parting × fringe × texture × beard × audience × dimension", () => {
    let cases = 0;
    for (const length of HairLength.options)
      for (const parting of Parting.options)
        for (const fringe of [false, true])
          for (const texture of Texture.options)
            for (const beard of [undefined, "none", "full"] as const)
              for (const audience of ["female", "male", "all", undefined] as const)
                for (const newChapter of ["length", "colour", "fringe", "texture"] as const) {
                  const snap = IdentitySnapshot.parse({ colourFamily: "brown", length, parting, fringe, texture, brows: { shape: "straight", darkness: "medium" }, beard });
                  const [closest, easier, chapter] = planRoutes(snap, { audience, newChapter });
                  const where = JSON.stringify({ length, parting, fringe, texture, beard, audience, newChapter });
                  expect(idx(style(easier!.styleId).length), where).toBeLessThanOrEqual(idx(style(closest!.styleId).length));
                  expect(easier!.styleId, where).not.toBe(closest!.styleId);
                  expect(TEXTURE_PREFERENCE[texture], where).toContain(style(closest!.styleId).texture);
                  expect(chapter!.changedDimension, where).toBeDefined();
                  // Locs and braids are a different look: never "closest" or "easier".
                  expect(style(closest!.styleId).protective, where).toBe(false);
                  expect(style(easier!.styleId).protective, where).toBe(false);
                  cases++;
                }
    expect(cases).toBe(5 * 4 * 2 * 4 * 3 * 4 * 4);
  });
});

describe("planRoutes (examples)", () => {
  const meera = IdentitySnapshot.parse({ colourFamily: "dark-brown", length: "shoulder", parting: "left", fringe: false, texture: "straight", brows: { shape: "soft-arch", darkness: "dark" } });
  const amara = IdentitySnapshot.parse({ colourFamily: "black", hairHex: "#1c1714", length: "shoulder", parting: "none", fringe: false, texture: "coily", brows: { shape: "soft-arch", darkness: "dark" } });
  const daniel = IdentitySnapshot.parse({ colourFamily: "brown", length: "short", parting: "none", fringe: false, texture: "wavy", brows: { shape: "straight", darkness: "dark" }, beard: "short" });

  it("Meera: a shoulder-length straight style, a shorter easier one, then colour changed", () => {
    const [closest, easier, chapter] = planRoutes(meera);
    expect(style(closest!.styleId)).toMatchObject({ length: "shoulder", texture: "straight" });
    expect(idx(style(easier!.styleId).length)).toBeLessThan(idx("shoulder"));
    expect(chapter).toMatchObject({ styleId: closest!.styleId, changedDimension: "colour", colour: { source: "preset" } });
  });

  it("Amara: only coily styles, in her own picked colour; reference styles take the 2-unit pipeline", () => {
    const routes = planRoutes(amara);
    for (const r of routes) expect(style(r.styleId).texture).toBe("coily");
    expect(routes[0]!.colour).toEqual({ source: "own", hex: "#1C1714" });
    const refUnits = estimateUnits(JobSpec.parse(toJobSpec(routes[0]!)), catalog);
    expect(refUnits).toBe(style(routes[0]!.styleId).style.source === "reference" ? 2 : 3);
  });

  it("Daniel (beard): short male-compatible styles, never a long one", () => {
    const [closest, easier] = planRoutes(daniel);
    for (const r of [closest!, easier!]) {
      expect(["male", "all"]).toContain(style(r.styleId).audience);
      expect(["buzz", "short"]).toContain(style(r.styleId).length);
    }
  });

  it("new chapter by length picks the nearest other length with the same fringe and texture", () => {
    const [closest, , chapter] = planRoutes(meera, { newChapter: "length" });
    expect(chapter).toMatchObject({ changedDimension: "length", colour: { source: "own" } });
    const a = style(closest!.styleId);
    const b = style(chapter!.styleId);
    expect(b.length).not.toBe(a.length);
    expect(b).toMatchObject({ fringe: a.fringe, texture: a.texture });
  });

  it("prefer forces the demo styles; unknown or too-long preferences are ignored", () => {
    const [closest, easier] = planRoutes(meera, { prefer: { closest: "short-bob", easier: "french-bob" } });
    expect([closest!.styleId, easier!.styleId]).toEqual(["short-bob", "french-bob"]);
    const [c2, e2] = planRoutes(meera, { prefer: { closest: "nope", easier: "f-long-wavy" } });
    expect(c2!.styleId).not.toBe("nope");
    expect(idx(style(e2!.styleId).length)).toBeLessThanOrEqual(idx(style(c2!.styleId).length));
  });

  it("works with a tiny catalog and falls back without throwing", () => {
    const one = { styles: [styles[0]!], colours };
    const routes = planRoutes(meera, { catalog: one, newChapter: "length" });
    expect(routes).toHaveLength(3);
    expect(routes.every((r) => r.styleId === styles[0]!.id)).toBe(true);
    expect(routes[2]!.changedDimension).toBe("colour");
  });
});

describe("planRegrowth", () => {
  it("climbs from very short to chin length, never repeating a style when it can avoid it", () => {
    fc.assert(
      fc.property(arbSnapshot, arbAudience, (snap, audience) => {
        const stages = planRegrowth(snap, { audience });
        expect(stages.map((s) => s.routeId)).toEqual(["regrowth-3m", "regrowth-6m", "regrowth-12m"]);
        const lengths = stages.map((s) => idx(style(s.styleId).length));
        expect(lengths[0]!).toBeLessThanOrEqual(lengths[1]!);
        expect(lengths[1]!).toBeLessThanOrEqual(lengths[2]!);
        expect(lengths[2]!).toBeLessThanOrEqual(idx("chin"));
        expect(new Set(stages.map((s) => s.styleId)).size).toBeGreaterThanOrEqual(2);
        for (const s of stages) expect(s.colour).toEqual(ownColour(snap));
      }),
      { numRuns: 300 },
    );
  });

  it("keeps coily hair coily", () => {
    const snap = IdentitySnapshot.parse({ colourFamily: "black", length: "shoulder", parting: "none", fringe: false, texture: "coily", brows: { shape: "straight", darkness: "dark" } });
    for (const s of planRegrowth(snap)) expect(style(s.styleId).texture).toBe("coily");
  });
});

describe("protective styles", () => {
  const amara = IdentitySnapshot.parse({ colourFamily: "black", length: "shoulder", parting: "none", fringe: false, texture: "coily", brows: { shape: "soft-arch", darkness: "dark" } });

  it("Amara's closest is her own natural texture, not braids or locs, but braids are offered as a variant", () => {
    const [closest, easier] = planRoutes(amara);
    expect(style(closest!.styleId)).toMatchObject({ texture: "coily", protective: false, length: "shoulder" });
    expect(style(easier!.styleId).protective).toBe(false);
    const alts = planAlternatives(amara, closest!, { max: 6 });
    expect(alts.some((id) => style(id).protective)).toBe(true);
  });

  it("flags exactly the locs and braids styles", () => {
    expect(styles.filter((s) => s.protective).map((s) => s.id).sort()).toEqual(["box-braids-shoulder", "locs-shoulder"]);
  });
});

describe("planAlternatives", () => {
  it("offers at most six other styles from the same texture class, nearest length first", () => {
    fc.assert(
      fc.property(arbSnapshot, fc.integer({ min: 1, max: 20 }), (snap, max) => {
        const [closest] = planRoutes(snap);
        const alts = planAlternatives(snap, closest!, { max });
        expect(alts.length).toBeLessThanOrEqual(6);
        expect(alts.length).toBeLessThanOrEqual(max);
        expect(new Set(alts).size).toBe(alts.length);
        expect(alts).not.toContain(closest!.styleId);
        for (const id of alts) expect(TEXTURE_PREFERENCE[snap.texture]).toContain(style(id).texture);
        const base = idx(style(closest!.styleId).length);
        const dist = alts.map((id) => Math.abs(idx(style(id).length) - base));
        expect(dist).toEqual([...dist].sort((a, b) => a - b));
      }),
      { numRuns: 200 },
    );
  });
});
