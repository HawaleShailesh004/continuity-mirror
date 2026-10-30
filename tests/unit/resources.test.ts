import { describe, expect, it } from "vitest";
import { insuranceGuides, programmes } from "@/lib/catalog/resources";

const TONE = [/\bpatients?\b/i, /\bfight(ing)?\b/i, /\bbattle\b/i, /\bbrave\b/i, /\bfake\b/i, /natural-looking/i];
const CLAIMS = [/\bdiagnos(e|is|ing)\b/i, /will grow back/i, /\bcures?\b/i, /treatment works/i, /exact (wig )?fit/i, /\bguarantee(d|s)?\b/i];

/** Every string a person would read (URLs are sources, not copy). */
function copyOf(value: unknown, key = ""): string[] {
  if (typeof value === "string") return /url|^id$/i.test(key) ? [] : [value];
  if (Array.isArray(value)) return value.flatMap((v) => copyOf(v, key));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => copyOf(v, k));
  return [];
}

describe("resources data", () => {
  it("covers US, CA, IN and UK, with unique ids", () => {
    expect(new Set(programmes.map((p) => p.country))).toEqual(new Set(["US", "CA", "IN", "UK"]));
    expect(new Set(programmes.map((p) => p.id)).size).toBe(programmes.length);
    expect(new Set(insuranceGuides.map((g) => g.id)).size).toBe(insuranceGuides.length);
  });

  it("every entry has an https source and an as-of date that is not in the future", () => {
    for (const item of [...programmes.map((p) => ({ urls: [p.sourceUrl], asOf: p.asOf })), ...insuranceGuides.map((g) => ({ urls: g.sources.map((s) => s.url), asOf: g.asOf }))]) {
      for (const url of item.urls) expect(url.startsWith("https://")).toBe(true);
      expect(Date.parse(item.asOf)).toBeLessThanOrEqual(Date.now());
    }
  });

  it("the copy follows the tone and claim rules", () => {
    for (const text of copyOf([programmes, insuranceGuides])) {
      for (const rule of [...TONE, ...CLAIMS]) expect(text, `${rule} in "${text}"`).not.toMatch(rule);
    }
  });

  it("marks our own suggestions as guidance and everything else as cited", () => {
    const steps = insuranceGuides.flatMap((g) => g.steps);
    expect(steps.some((s) => s.basis === "guidance")).toBe(true);
    expect(steps.some((s) => s.basis === "cited")).toBe(true);
  });

  it("is compatible with the frontend's Programme type", () => {
    for (const p of programmes) {
      const { id, country, name, summary, sourceUrl, asOf } = p;
      expect([id, country, name, summary, sourceUrl, asOf].every((v) => typeof v === "string")).toBe(true);
    }
  });
});
