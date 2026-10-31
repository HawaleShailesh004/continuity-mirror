import { expect, test } from "@playwright/test";

/*
 * Win plan T8: the hero's "after" side switches between genuine results for the same sample person.
 * It starts on New chapter, the pills choose a look (a radio group with roving focus), and it only
 * auto-advances when motion is allowed and nobody has touched it.
 */
test.describe("landing hero", () => {
  test("starts on New chapter and the pills choose a look", async ({ page }) => {
    await page.goto("/");
    const badge = page.getByTestId("hero-look");
    await expect(badge).toHaveText("New chapter");

    await page.getByRole("radio", { name: "Familiar, easier" }).click();
    await expect(badge).toHaveText("Familiar, easier");
    await expect(page.getByRole("radio", { name: "Familiar, easier" })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("radio", { name: /^Regrowth/ }).click();
    await expect(page.getByText("A possibility, not a prediction").filter({ visible: true })).toBeVisible();
  });

  test("arrow keys move the selection and wrap", async ({ page }) => {
    await page.goto("/");
    const closest = page.getByRole("radio", { name: "Closest to me" });
    const easier = page.getByRole("radio", { name: "Familiar, easier" });
    await closest.click();
    await closest.press("ArrowRight");
    await expect(easier).toHaveAttribute("aria-checked", "true");
    await expect(easier).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft"); // wraps to the last pill
    await expect(page.getByRole("radio", { name: /^Regrowth/ })).toHaveAttribute("aria-checked", "true");
  });

  test("with reduced motion it stays where it started", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(5000);
    await expect(page.getByTestId("hero-look")).toHaveText("New chapter");
  });

  test("with motion it moves on by itself, and stops for good once touched", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const badge = page.getByTestId("hero-look");
    await expect(badge).toHaveText("New chapter");
    await expect(badge).toHaveText("Regrowth, about 6 months", { timeout: 9000 });

    await page.getByRole("radio", { name: "Closest to me" }).click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(4500);
    await expect(badge).toHaveText("Closest to me");
  });
});
