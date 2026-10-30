import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { reachPlanWithLook } from "./helpers";

/*
 * F6, the optional modules, on the sample person (genuine precomputed results;
 * the share backend is the in-browser mock API or the real routes, the same
 * contract either way). The face-model part of the Brow Record is in
 * p1-brows.spec.ts, which runs alone because real ML starves everything else.
 */
const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();

const settle = (page: Page) => page.waitForTimeout(600);

/** Console errors and uncaught exceptions on this page: a render loop or a bad image URL shows up here, not in axe. */
function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && problems.push(msg.text().slice(0, 300)));
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message.slice(0, 300)}`));
  return problems;
}

test.describe("partners page", () => {
  test("says what exists and what doesn't, with a real catalogue entry", async ({ page }) => {
    await page.goto("/partners");
    await expect(page.getByRole("heading", { name: "For wig shops and cancer centres", level: 1 })).toBeVisible();
    await expect(page.getByText("It isn’t a service you can sign up for today.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What works today" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What we’d build with you" })).toBeVisible();
    // The example is a real entry from the catalogue, so it cannot drift from the format.
    const example = page.getByLabel("An example style entry");
    await expect(example).toContainText('"id": "short-bob"');
    await expect(example).toContainText('"askFor"');
    await settle(page);
    expect((await axe(page)).violations).toEqual([]);
  });

  test("is reachable from How it works", async ({ page }) => {
    await page.goto("/about");
    await page.getByRole("link", { name: "For wig shops and cancer centres" }).click();
    await expect(page).toHaveURL(/\/partners/);
  });
});

test.describe("helper page", () => {
  test("an unknown or stopped link reads the same, and says nothing about why", async ({ page }) => {
    await page.goto("/share/AAAAAAAAAAAAAAAAAAAAAA");
    await expect(page.getByRole("heading", { name: "This link has ended", level: 1 })).toBeVisible();
    await expect(page.getByText(/ask them for a new one/)).toBeVisible();
    await expect(page.locator("head meta[name=robots]")).toHaveAttribute("content", /noindex/);
    await settle(page);
    expect((await axe(page)).violations).toEqual([]);
  });
});

test.describe("regrowth roadmap", () => {
  test("nothing is shown until asked, then three stages beside the person's own photo", async ({ page }) => {
    test.slow();
    const problems = watchConsole(page);
    await reachPlanWithLook(page);
    await page.getByRole("link", { name: "Open regrowth roadmap" }).click();
    await expect(page.getByRole("heading", { name: "Regrowth roadmap", level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(/Regrowth roadmap/); // the title streams in after a client-side navigation

    // Before asking: words only, a clear way out, and no pictures of stages.
    await expect(page.getByText("A possibility to explore, not a prediction").first()).toBeVisible();
    await expect(page.getByText("You don’t need this to make your plan.")).toBeVisible();
    await expect(page.getByText("Style direction, not exact wig fit").filter({ visible: true })).toHaveCount(0);
    await settle(page);
    expect((await axe(page)).violations).toEqual([]);

    await page.getByRole("button", { name: "Show me" }).click();
    const stages = page.getByRole("list", { name: /Stages from the first months/ });
    await expect(stages.getByRole("heading", { level: 3 })).toHaveText([
      "About 3 months after treatment ends",
      "About 6 months",
      "About a year",
    ]);
    // Each stage is a result: labelled as a style direction, and the baseline is beside it.
    await expect(page.getByText("Style direction, not exact wig fit").filter({ visible: true })).toHaveCount(3);
    await expect(stages.getByAltText("Your photo, before")).toHaveCount(3);
    await expect(page.getByText("A possibility to explore, not a prediction").filter({ visible: true })).toHaveCount(4);
    await settle(page);
    expect((await axe(page)).violations).toEqual([]);

    // A stage joins the plan like any look, and says which stage it is.
    const sixMonths = stages.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "About 6 months" }) });
    await sixMonths.getByRole("button", { name: "Add to my plan", exact: true }).click();
    await expect(sixMonths.getByRole("button", { name: "In my plan", exact: true })).toBeVisible();
    await expect(sixMonths.getByRole("button", { name: "In my plan" })).toHaveAccessibleDescription("About 6 months");
    await page.getByRole("link", { name: "Back to my plan" }).click();
    await expect(page.getByText("Regrowth · 6 months")).toBeVisible();

    // It survives a reload, and the three paths are untouched by it.
    await page.reload();
    await expect(page.getByText("Regrowth · 6 months")).toBeVisible();
    await page.goto("/paths");
    await expect(page.getByRole("link", { name: /^(Closest to me|Familiar, easier|New chapter)$/ })).toHaveCount(3);
    expect(problems, problems.join("; ")).toEqual([]);
  });
});

test.describe("support circle", () => {
  async function createLink(page: Page) {
    await page.getByRole("button", { name: "Create a private link" }).click();
    const create = page.getByRole("button", { name: "Create private link" });
    // Consent is explicit: nothing is ticked, and nothing is made without it.
    await expect(page.getByRole("checkbox", { name: /stored on this app’s server/ })).not.toBeChecked();
    await expect(create).toBeDisabled();
    await page.getByRole("checkbox", { name: /stored on this app’s server/ }).click();
    await expect(create).toBeEnabled();
    await create.click();
    await expect(page.getByText("Your private link is ready")).toBeVisible({ timeout: 30_000 });
    const url = await page.getByRole("textbox", { name: "Private link" }).inputValue();
    expect(url).toMatch(/\/share\/[A-Za-z0-9_-]{22}$/);
    await page.getByRole("button", { name: "Done" }).click();
    return new URL(url).pathname;
  }

  test("make a link, a helper answers, the owner sees it, stopping ends it", async ({ page }) => {
    test.slow();
    const problems = watchConsole(page);
    await reachPlanWithLook(page);
    const path = await createLink(page);

    // The helper's side: their own photo beside the look, one question, an answer.
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Which one feels most like them?", level: 1 })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(1);
    await expect(page.getByText("A style idea made with AI, not a photo")).toBeVisible();
    // Nothing on the helper's page says why the person is choosing a style.
    await expect(page.getByText(/wig|chemo|cancer|treatment|hair loss/i)).toHaveCount(0);
    const send = page.getByRole("button", { name: "Send my answer" });
    await expect(send).toBeDisabled();
    await page.getByRole("radio").first().check({ force: true });
    await page.getByLabel("Add a few words (optional)").fill("This one looks like you <b>most</b>.");
    await settle(page);
    expect((await axe(page)).violations).toEqual([]);
    await send.click();
    await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();

    // Back as the owner: the answer is a count and the note is shown as plain text.
    await page.goto("/plan");
    await expect(page.getByText("1 answer")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("This one looks like you <b>most</b>.")).toBeVisible();
    await expect(page.locator("li b")).toHaveCount(0);
    await settle(page);
    expect((await axe(page)).violations).toEqual([]);

    // Stopping is a confirmed, deliberate step, and it really ends the link.
    await page.getByRole("button", { name: "Stop sharing" }).click();
    await page.getByRole("button", { name: "Yes, stop sharing" }).click();
    await expect(page.getByRole("list", { name: "Your private links" })).toHaveCount(0);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "This link has ended", level: 1 })).toBeVisible();
    // Two known, expected messages; nothing else may log:
    //  - the stopped link answers 410 on purpose;
    //  - on a production build, react-remove-scroll (every Radix/Vaul modal, old and new) injects a scroll-lock
    //    <style> whose hash is not in the CSP's four. That is a security-headers question (ADR 0006), not this module's.
    const known = (p: string) => p.includes("410") || p.includes("Applying inline style violates");
    expect(problems.filter((p) => !known(p)), problems.join("; ")).toEqual([]);
  });

  test("'delete everything' also stops every private link", async ({ page }) => {
    test.slow();
    await reachPlanWithLook(page);
    const path = await createLink(page);
    await page.goto(path);
    await expect(page.getByRole("radio")).toHaveCount(1);

    await page.goto("/privacy");
    await page.getByRole("button", { name: "Delete everything" }).click();
    await page.getByRole("button", { name: "Yes, delete everything" }).click();
    await expect(page.getByRole("heading", { name: "Everything is deleted" })).toBeVisible();

    await page.goto(path);
    await expect(page.getByRole("heading", { name: "This link has ended", level: 1 })).toBeVisible();
  });
});

test.describe("modules the server switches off", () => {
  // Let the real /api/status answer (not the in-browser mock), then change what it says.
  test.use({ serviceWorkers: "block" });

  test("never show: no entry points on the plan, and a direct visit says so calmly", async ({ page }) => {
    test.slow();
    await reachPlanWithLook(page);
    // On: all three entry points are there.
    await expect(page.getByRole("heading", { name: "Brow recipe" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "See how your hair might come back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create a private link" })).toBeVisible();

    await page.route("**/api/status", async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      await route.fulfill({ response, json: { ...json, capabilities: { ...json.capabilities, brows: false, regrowth: false, shares: false } } });
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "My plan", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your situation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Brow recipe" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "See how your hair might come back" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create a private link" })).toHaveCount(0);

    // A direct visit is a calm message with a way back, not an error.
    await page.goto("/regrowth");
    await expect(page.getByRole("heading", { name: "The roadmap isn’t available right now" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to my plan" })).toBeVisible();
  });
});
