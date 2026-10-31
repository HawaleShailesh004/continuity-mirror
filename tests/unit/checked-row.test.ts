import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckedRow } from "@/components/cm/checked-row";
import { copy } from "@/content/copy/checked";
import type { ResultCheck } from "@/lib/client/check/judge";

const base: ResultCheck = {
  outcome: "checked",
  face: { status: "unchanged", drift: 0.004 },
  colour: { status: "drifted", baselineHex: "#2A1D18", resultHex: "#1B170D", deltaE: 5.4 },
  checkedAt: "2026-11-01T00:00:00.000Z",
};
const adjusted: ResultCheck = { ...base, repaired: { state: "adjusted", deltaEAfter: 1.2 } };

describe("CheckedRow", () => {
  it("says the colour was adjusted after a successful repair (stored as outcome 'checked' + repaired.adjusted)", () => {
    const html = renderToStaticMarkup(createElement(CheckedRow, { check: adjusted }));
    expect(html).toContain(copy.colourAdjusted);
    expect(html).toContain(copy.title);
  });

  it("words the title for samples and offers the first version only when asked", () => {
    const plain = renderToStaticMarkup(createElement(CheckedRow, { check: adjusted, sample: true }));
    expect(plain).toContain(copy.titleSample);
    expect(plain).not.toContain(copy.seeFirst);

    const toggle = renderToStaticMarkup(createElement(CheckedRow, { check: adjusted, sample: true, firstVersion: { showing: false, onToggle: () => {} } }));
    expect(toggle).toContain(copy.seeFirst);
    expect(toggle).toContain('aria-pressed="false"');

    const showing = renderToStaticMarkup(createElement(CheckedRow, { check: adjusted, sample: true, firstVersion: { showing: true, onToggle: () => {} } }));
    expect(showing).toContain(copy.seeAdjusted);
    expect(showing).toContain('aria-pressed="true"');
  });

  it("does not offer the toggle when nothing was adjusted", () => {
    const html = renderToStaticMarkup(createElement(CheckedRow, { check: { ...base, colour: { ...base.colour, status: "kept" } }, firstVersion: { showing: false, onToggle: () => {} } }));
    expect(html).not.toContain(copy.seeFirst);
  });
});
