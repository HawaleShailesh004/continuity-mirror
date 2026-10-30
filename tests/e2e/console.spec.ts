import { expect, test } from "@playwright/test";
import { routes } from "./routes";

/*
 * No route may log a console error or throw: that catches hydration
 * mismatches, missing imports and failed requests that axe can't see.
 */
for (const route of routes) {
  test(`no console errors · ${route}`, async ({ page }) => {
    const problems: string[] = [];
    // A share link that has ended answers 410 by design; the browser logs every non-2xx as a console error.
    const expectedGone = route.startsWith("/share/");
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      if (expectedGone && msg.text().includes("status of 410")) return;
      problems.push(msg.text().slice(0, 300));
    });
    page.on("pageerror", (err) => problems.push(`pageerror: ${err.message.slice(0, 300)}`));

    await page.goto(route, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    expect(problems, problems.join("\n---\n")).toEqual([]);
  });
}
