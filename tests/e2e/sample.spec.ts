import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

/*
 * The sample-person journey from the landing page to a downloaded PDF and
 * "delete everything": genuine precomputed results (public/demo), no API
 * generation, everything stored on the device.
 */
const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();

async function reachPaths(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Try with a sample person" }).click();
  await page.getByRole("button", { name: "I understand, continue" }).click();
  await expect(page.getByRole("heading", { name: "What makes your hair look like you?" })).toBeVisible();
  await page.getByRole("button", { name: "See my three paths" }).click();
  await expect(page.getByRole("heading", { name: "Your three paths", level: 1 })).toBeVisible();
}

test.describe("sample person", () => {
  test("results are instant and genuine, with their real task ids and the required label", async ({ page }) => {
    await reachPaths(page);
    // No waiting for generation: all three are there at once.
    for (const name of ["Closest to me", "Familiar, easier", "New chapter"]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible({ timeout: 5000 });
    }
    // Count what is on screen: a page left behind by navigation stays in the DOM, hidden.
    await expect(page.getByText("Style direction, not exact wig fit").filter({ visible: true })).toHaveCount(3);
    await expect(page.getByText("AI-generated sample person").filter({ visible: true })).toBeVisible();
    // No units are spent on a sample, so no budget is shown.
    await expect(page.getByText(/more previews? available/)).toHaveCount(0);

    await page.getByRole("button", { name: "How this was made" }).click();
    await expect(page.getByText("Made live with YouCam")).toBeVisible();
    await expect(page.getByText("/s2s/v2.1/task/hair-transfer").first()).toBeVisible();
  });

  test("F9: the plan's words use the person's own answers, not the template's", async ({ page }) => {
    // Meera's snapshot says a left parting and no fringe; her saved looks must be asked for that way.
    await page.goto("/start/consent?sample=1");
    await page.getByRole("radio", { name: /Meera/ }).click();
    await page.getByRole("button", { name: "I understand, continue" }).click();
    await page.getByRole("button", { name: "See my three paths" }).click();
    await page.getByRole("link", { name: "Closest to me", exact: true }).click();
    await page.getByRole("button", { name: "Save to my plan" }).click();
    await page.getByRole("link", { name: /Open my plan, 1 look saved/ }).click();
    const ask = page.getByRole("region", { name: "What to ask for" });
    await expect(ask.getByText(/left parting/).first()).toBeVisible();
    await expect(ask.getByText(/no fringe/).first()).toBeVisible();
    await expect(page.getByText(/centre parting/i).filter({ visible: true })).toHaveCount(0);
  });

  test("save looks → plan → pack PDF → privacy → delete everything", async ({ page }) => {
    test.slow();
    await reachPaths(page);

    // Save two looks.
    await page.getByRole("link", { name: "Closest to me", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Closest to me", level: 1 })).toBeVisible();
    await page.getByRole("radio", { name: "Yes" }).click();
    await page.getByRole("button", { name: "Save to my plan" }).click();
    await expect(page.getByRole("link", { name: /Open my plan, 1 look saved/ })).toBeVisible();
    await page.getByRole("link", { name: "Familiar, easier", exact: true }).click();
    // Wait for the NEXT path to be showing, or the click below would un-save the first one.
    await expect(page.getByRole("heading", { name: "Familiar, easier", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Save to my plan" }).click();
    await expect(page.getByRole("link", { name: /Open my plan, 2 looks saved/ })).toBeVisible();

    // Plan: real saved looks, shop language, filters that stick.
    await page.getByRole("link", { name: /Open my plan, 2 looks saved/ }).click();
    await expect(page.getByRole("heading", { name: "My plan", level: 1 })).toBeVisible();
    await expect(page.getByRole("list").filter({ has: page.getByText("Style direction, not exact wig fit").first() }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "What to ask for" })).toBeVisible();
    await page.getByRole("radio", { name: "Canada" }).click();
    // Money help: every entry says when it was checked and links its source.
    await expect(page.getByText(/^Checked \d/).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^Source/ }).first()).toBeVisible();
    await page.getByRole("checkbox", { name: "Book a wig fitter" }).click();
    await page.waitForTimeout(600);
    expect((await axe(page)).violations).toEqual([]);

    await page.reload();
    await expect(page.getByRole("radio", { name: "Canada" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Book a wig fitter" })).toBeChecked();

    // The pack: a real PDF, made on this device.
    await page.getByRole("link", { name: "Create consultation pack" }).click();
    await expect(page.getByText("Your pack is ready")).toBeVisible({ timeout: 90_000 });
    expect((await axe(page)).violations).toEqual([]);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download PDF" }).click()]);
    const path = await download.path();
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(20_000); // photos are in it
    expect(download.suggestedFilename()).toBe("consultation-pack.pdf");

    // Privacy: an honest receipt, then everything goes.
    await page.goto("/privacy");
    await expect(page.getByText(/1 photo · \d+ previews/)).toBeVisible();
    await page.waitForTimeout(600);
    expect((await axe(page)).violations).toEqual([]);
    await page.getByRole("button", { name: "Delete everything" }).click();
    await page.getByRole("button", { name: "Yes, delete everything" }).click();
    await expect(page.getByRole("heading", { name: "Everything is deleted" })).toBeVisible();

    // Nothing is left on the device.
    await page.goto("/plan");
    await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
    await page.goto("/paths");
    await expect(page).toHaveURL(/\/start\/capture/);
  });
});
