import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { reachPlanWithLook } from "./helpers";

/*
 * The Brow Record on a sample person. It runs the real face model on the
 * baseline to find the brows, so (like capture.spec.ts) it runs alone.
 */
const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();

test("brow record: found on the photo, a recipe saved to the plan, a third page in the pack", async ({ page }) => {
  test.slow();
  await reachPlanWithLook(page);
  // Everything the brow flow does stays on this device: it must not send anything anywhere.
  const sent: string[] = [];
  page.on("request", (r) => r.method() !== "GET" && !new URL(r.url()).pathname.startsWith("/__nextjs") && sent.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await page.getByRole("link", { name: "Open brow record" }).click();
  await expect(page.getByRole("heading", { name: "Brow record", level: 1 })).toBeVisible();

  // The face model finds the brows, so this is the person's own crop, not a guess.
  await expect(page.getByText("Found your brows on your photo.")).toBeVisible({ timeout: 90_000 });
  const crop = page.getByAltText("Close-up of your own brows, cut from your photo").first();
  await expect(crop).toBeVisible();
  const box = (await crop.boundingBox())!;
  expect(box.width / box.height).toBeGreaterThan(1.8); // wide and short, like brows
  expect(box.width / box.height).toBeLessThan(2.6);
  await expect(page.getByText("This close-up is not sent anywhere.")).toBeVisible();

  // Practice steps are ours, and say so; the outside advice is cited.
  await expect(page.getByText("Our suggestions.")).toBeVisible();
  await expect(page.getByRole("link", { name: /American Cancer Society: Make-up tips/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Breast Cancer Now/ })).toBeVisible();

  // Choose a shape and colour; add a note.
  await page.getByRole("radio", { name: "High arch", exact: true }).click();
  await page.getByRole("radio", { name: /^High arch, balanced/ }).click();
  await page.getByRole("radio", { name: "Medium" }).click();
  await page.getByLabel("Anything to tell a make-up artist or fitter?").fill("My left brow sits a little higher.");
  await page.waitForTimeout(600);
  expect((await axe(page)).violations).toEqual([]);

  // The preview is secondary and says so; a sample shows the genuine earlier one.
  await page.getByRole("button", { name: "Show the preview" }).click();
  await expect(page.getByAltText(/^Preview: your brows with the/)).toBeVisible();
  await expect(page.getByText(/This sample preview was made earlier with/)).toBeVisible();
  await expect(page.getByText("A preview made with AI. Real brows will look different.")).toBeVisible();

  await page.getByRole("button", { name: "Save brow recipe" }).click();
  await expect(page.getByText("Saved in your plan")).toBeVisible();

  // A reload keeps the record and the choices.
  await page.reload();
  await expect(page.getByRole("radio", { name: "High arch", exact: true })).toBeChecked();
  await expect(page.getByLabel("Anything to tell a make-up artist or fitter?")).toHaveValue("My left brow sits a little higher.");

  // The plan shows it, and the pack gets a brow page.
  await page.getByRole("link", { name: "Back to my plan" }).click();
  await expect(page.getByRole("heading", { name: "Brow recipe" })).toBeVisible();
  await expect(page.getByText("High arch, balanced", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("My left brow sits a little higher.").filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: "Create consultation pack" }).click();
  await expect(page.getByText("Your brow record: a close-up of your brows")).toBeVisible();
  await expect(page.getByText("Your pack is ready")).toBeVisible({ timeout: 90_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download PDF" }).click()]);
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(20_000);
  expect(sent, "the brow close-up and recipe never leave the device").toEqual([]);
});
