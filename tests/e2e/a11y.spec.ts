import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { routes } from "./routes";

/*
 * axe on every route, light and dark, mobile and desktop (frontend plan §8, §11).
 * Gate: zero violations at WCAG 2.2 AA. Reduced motion is on (playwright.config)
 * so entrance animations have settled when axe measures contrast.
 */

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe · ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    for (const route of routes) {
      test(route, async ({ page }) => {
        await page.goto(route, { waitUntil: "networkidle" });
        // Let motion's lazy features load and the page settle.
        await page.waitForTimeout(600);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          // The Next.js dev indicator is not part of our UI.
          .exclude("nextjs-portal")
          .analyze();

        const summary = results.violations.map(
          (v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`,
        );
        expect(summary, summary.join("\n")).toEqual([]);
      });
    }
  });
}
