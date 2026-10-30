import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pickFile } from "./helpers";

/*
 * The sample-person journey end to end against the in-browser mock API (MSW,
 * NEXT_PUBLIC_API_MOCKS=1; see playwright.config.ts). Each test gets a fresh
 * browser context, so IndexedDB and the mock's state start empty.
 *
 * The scenario is chosen before the page loads through the keys MSW reads
 * (lib/contracts/mocks/browser.ts). latency 0 makes jobs finish instantly;
 * latency 1 keeps realistic timing for the reload test.
 */
type Scenario =
  | "ok"
  | "slow"
  | "no_shoulder"
  | "hair_too_short"
  | "unavailable"
  | "budget_exhausted"
  | "live_disabled"
  | "partial_failure";

async function useScenario(page: Page, scenario: Scenario, latency: 0 | 1 = 0) {
  await page.addInitScript(
    ([s, l]) => {
      localStorage.setItem("cm:mock:scenario", s);
      localStorage.setItem("cm:mock:latency", l);
    },
    [scenario, String(latency)] as const,
  );
}

/**
 * Landing → "Use my photo" → upload a photo (real MediaPipe checks, real baseline upload
 * against the mock API) → answer the snapshot, ready to ask for the three paths.
 * Sample people are NOT used here: they carry precomputed results and make no jobs.
 */
async function reachSnapshot(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Use my photo" }).click();
  await page.getByRole("link", { name: "I understand, continue" }).click();
  await page.getByRole("radio", { name: "Upload" }).click();
  await pickFile(page, { name: "me.jpg", type: "image/jpeg", draw: "persona" });
  await expect(page.getByRole("heading", { name: "Use this photo?" })).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Use this photo" }).click();
  await expect(page.getByRole("heading", { name: "What makes your hair look like you?" })).toBeVisible({ timeout: 20_000 });
  for (const name of ["Dark brown", "Shoulder length", "No parting", "No fringe", "Straight", "Soft arch", "Dark"]) {
    await page.getByRole("radio", { name, exact: true }).first().click();
  }
}

async function seeThreePaths(page: Page) {
  await page.getByRole("button", { name: "See my three paths" }).click();
  await expect(page.getByRole("heading", { name: "Your three paths", level: 1 })).toBeVisible();
}

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();

test.describe("sample person journey", () => {
  test("three real jobs finish, the verdict and saved look survive a reload", async ({ page }) => {
    await useScenario(page, "ok");
    await reachSnapshot(page);
    // The audience preference is the user's choice and is remembered.
    await expect(page.getByRole("radio", { name: "All styles" })).toBeChecked();
    await page.getByRole("radio", { name: "Women’s styles" }).click();
    await expect(page.getByRole("radio", { name: "Women’s styles" })).toBeChecked();
    await seeThreePaths(page);

    // All three previews arrive, each with the required label.
    await expect(page.getByRole("link", { name: "Closest to me", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Familiar, easier", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "New chapter", exact: true })).toBeVisible();
    await expect(page.getByText("Style direction, not exact wig fit")).toHaveCount(3);
    await page.waitForTimeout(600);
    expect((await axe(page)).violations).toEqual([]);

    // Compare: answer the verdict, save the look.
    await page.getByRole("link", { name: "Closest to me", exact: true }).click();
    await expect(page.getByText("Does this still feel like you?")).toBeVisible();
    await page.getByRole("radio", { name: "Yes" }).click();
    await page.getByRole("button", { name: "Save to my plan" }).click();
    await expect(page.getByRole("link", { name: /Open my plan, 1 look saved/ })).toBeVisible();
    await page.waitForTimeout(600);
    expect((await axe(page)).violations).toEqual([]);

    // Everything is on the device: a reload keeps the answer, the saved look and the images.
    await page.reload();
    await expect(page.getByRole("radio", { name: "Yes" })).toBeChecked();
    await expect(page.getByRole("link", { name: /Open my plan, 1 look saved/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /Preview: .*your own colour/ })).toBeVisible();
  });

  test("a reload in the middle of generating resumes and finishes", async ({ page }) => {
    test.slow(); // realistic timing (jobs take ~15 s each) while other workers load the dev server
    await useScenario(page, "ok", 1);
    await reachSnapshot(page);
    await seeThreePaths(page);
    await expect(page.getByText("Styling your hair · usually 15 to 40 seconds").first()).toBeVisible();

    await page.reload();

    for (const name of ["Closest to me", "Familiar, easier", "New chapter"]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible({ timeout: 90_000 });
    }
    await expect(page.getByText("Style direction, not exact wig fit")).toHaveCount(3);
  });

  test("one path failing offers its own retry and leaves the others usable", async ({ page }) => {
    await useScenario(page, "partial_failure");
    await reachSnapshot(page);
    await seeThreePaths(page);

    await expect(page.getByRole("link", { name: "Closest to me", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Familiar, easier", exact: true })).toBeVisible();
    const retry = page.getByRole("button", { name: "Try this path again" });
    await expect(retry).toBeVisible();
    await expect(page.getByText("The service is busy")).toBeVisible();

    await retry.click();

    await expect(page.getByRole("link", { name: "New chapter", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Try this path again" })).toHaveCount(0);
  });

  test("a spent session budget says so calmly and keeps the page usable", async ({ page }) => {
    await useScenario(page, "budget_exhausted");
    await reachSnapshot(page);
    await seeThreePaths(page);

    await expect(page.getByText("You’ve used this session’s previews").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Closest to me", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Making your previews" })).toBeDisabled();
  });

  test("a photo the tool rejects explains what to change", async ({ page }) => {
    await useScenario(page, "no_shoulder");
    await reachSnapshot(page);
    await seeThreePaths(page);

    await expect(page.getByText("Show your shoulders").first()).toBeVisible({ timeout: 15_000 });
  });

  test("when live generation is off, the landing page leads with the sample person", async ({ page }) => {
    await useScenario(page, "live_disabled");
    await page.goto("/");

    await expect(page.getByText("Photo previews are paused for now.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Use my photo" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Try with a sample person" })).toBeVisible();
  });
});
