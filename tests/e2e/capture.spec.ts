import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pickFile } from "./helpers";

/*
 * The capture screen end to end, with a fake camera: a canvas streams a sample
 * person's photo (good, shoulders cropped out, tilted) in place of getUserMedia.
 * Real MediaPipe runs on those frames in the browser. Promises under test:
 *   - the right instruction is given for what is wrong;
 *   - a photo that fails our checks never reaches the API (no units spent);
 *   - a good photo goes through, and nothing leaves our own origin.
 * Uses the in-browser mock API (NEXT_PUBLIC_API_MOCKS=1, see playwright.config.ts).
 */
type Camera = "good" | "noShoulders" | "tilted" | "denied";

async function fakeCamera(page: Page, kind: Camera) {
  await page.addInitScript((kind) => {
    navigator.mediaDevices.getUserMedia = async () => {
      if (kind === "denied") throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      const img = new Image();
      img.src = "/mock/personas/amara.jpg";
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 960;
      const ctx = canvas.getContext("2d")!;
      const draw = () => {
        ctx.save();
        ctx.fillStyle = "#888";
        ctx.fillRect(0, 0, 720, 960);
        if (kind === "tilted") {
          ctx.translate(360, 480);
          ctx.rotate((20 * Math.PI) / 180);
          ctx.drawImage(img, -360, -480, 720, 960);
        } else if (kind === "noShoulders") {
          // Same framing, but the picture stops above the shoulders (grey below).
          ctx.drawImage(img, 0, 0, 768, 700, 0, 0, 720, 656);
        } else {
          ctx.drawImage(img, 0, 0, 720, 960);
        }
        ctx.restore();
      };
      // A timer, not requestAnimationFrame: rAF stalls in tabs that aren't visible,
      // and the stream would then stay at its 2×2 placeholder size.
      draw();
      setInterval(draw, 66);
      return canvas.captureStream(15);
    };
  }, kind);
}

async function useMockApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("cm:mock:scenario", "ok");
    localStorage.setItem("cm:mock:latency", "0");
  });
}

/** Count real calls to the API for baselines (the mock worker answers them in the page). */
function trackBaselineUploads(page: Page) {
  const uploads: string[] = [];
  page.on("request", (r) => r.method() === "POST" && r.url().includes("/api/baselines") && uploads.push(r.url()));
  return uploads;
}

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();

test.describe("capture", () => {
  test.slow(); // real MediaPipe models load in the browser
  // Each test runs the models on the CPU in its own browser; run them one at a time per project.
  test.describe.configure({ mode: "serial" });

  test("camera: guided checks tick, the countdown takes the photo, the snapshot starts empty", async ({ page }) => {
    await useMockApi(page);
    await fakeCamera(page, "good");
    // Anything that isn't our own origin (blob:/data: are in-page, not network).
    const ours = new URL(test.info().project.use.baseURL ?? "http://localhost:3100").origin;
    const foreign: string[] = [];
    page.on("request", (r) => /^https?:/.test(r.url()) && new URL(r.url()).origin !== ours && foreign.push(r.url()));

    await page.goto("/start/capture");
    // Checks are live once the models are loaded.
    await expect(page.getByText("That’s it. Hold still for a moment.")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("list", { name: "What we look for" })).toBeVisible();
    for (const label of ["Just you in the frame", "Facing the camera", "Close enough", "Shoulders showing"]) {
      await expect(page.getByRole("list", { name: "What we look for" }).getByText(label, { exact: true })).toBeVisible();
    }
    expect((await axe(page)).violations).toEqual([]);

    // Held steady, so the 3-2-1 runs and the photo is taken by itself.
    await expect(page.getByRole("heading", { name: "Use this photo?" })).toBeVisible({ timeout: 30_000 });
    expect((await axe(page)).violations).toEqual([]);

    const uploads = trackBaselineUploads(page);
    await page.getByRole("button", { name: "Use this photo" }).click();
    await expect(page.getByRole("heading", { name: "What makes your hair look like you?" })).toBeVisible({ timeout: 20_000 });
    expect(uploads.length).toBe(1);

    // A real person's snapshot starts empty: nothing is guessed about their hair.
    await expect(page.getByRole("radio", { name: "Black" })).not.toBeChecked();
    const next = page.getByRole("button", { name: "See my three paths" });
    await expect(next).toBeDisabled();
    for (const name of ["Dark brown", "Shoulder length", "No parting", "No fringe", "Straight", "Soft arch", "Dark"]) {
      await page.getByRole("radio", { name, exact: true }).first().click();
    }
    await expect(next).toBeEnabled();

    expect(foreign, "nothing may leave our own origin").toEqual([]);
  });

  test("camera: cropped shoulders get a live tip, and a blocked photo never reaches the API", async ({ page }) => {
    await useMockApi(page);
    await fakeCamera(page, "noShoulders");
    const uploads = trackBaselineUploads(page);

    await page.goto("/start/capture");
    await expect(page.getByText("Show your shoulders", { exact: true }).first()).toBeVisible({ timeout: 90_000 });

    // The shutter is always there; our checks still stop a photo that can't be used.
    await page.getByRole("button", { name: "Take photo" }).click();
    await expect(page.getByRole("heading", { name: "Use this photo?" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Show your shoulders" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use this photo" })).toBeDisabled();
    expect((await axe(page)).violations).toEqual([]);
    expect(uploads).toHaveLength(0);

    // Retake goes back to the live camera.
    await page.getByRole("button", { name: "Retake photo" }).first().click();
    await expect(page.getByRole("button", { name: "Take photo" })).toBeVisible();
  });

  test("camera: a tilted head is told to level it", async ({ page }) => {
    await fakeCamera(page, "tilted");
    await page.goto("/start/capture");
    await expect(page.getByText("Level your head", { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  });

  test("camera: permission denied is calm and offers the upload", async ({ page }) => {
    await fakeCamera(page, "denied");
    await page.goto("/start/capture");
    await expect(page.getByRole("heading", { name: "Camera access is off" })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    await page.getByRole("button", { name: "Choose a photo instead" }).click();
    await expect(page.getByRole("heading", { name: "Choose a photo" })).toBeVisible();
  });

  test("upload: a good photo passes, a photo with no face is stopped, HEIC is explained", async ({ page }) => {
    await useMockApi(page);
    const uploads = trackBaselineUploads(page);
    await page.goto("/start/capture");
    await page.getByRole("radio", { name: "Upload" }).click();

    // No face: blocked before any API call.
    await pickFile(page, { name: "wall.jpg", type: "image/jpeg", draw: "grey" });
    await expect(page.getByRole("heading", { name: "Use this photo?" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("heading", { name: "We couldn’t see your face clearly" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use this photo" })).toBeDisabled();
    expect(uploads).toHaveLength(0);
    await page.getByRole("button", { name: "Choose a different photo" }).first().click();

    // HEIC: explained, nothing decoded.
    await pickFile(page, { name: "IMG_0001.heic", type: "image/heic" });
    await expect(page.getByText("That looks like a HEIC photo. Please choose a JPG or PNG instead.")).toBeVisible();

    // A good photo: allowed, and sent exactly once when chosen.
    await pickFile(page, { name: "me.jpg", type: "image/jpeg", draw: "persona" });
    await expect(page.getByRole("heading", { name: "Use this photo?" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Use this photo" })).toBeEnabled();
    await page.getByRole("button", { name: "Use this photo" }).click();
    await expect(page.getByRole("heading", { name: "What makes your hair look like you?" })).toBeVisible({ timeout: 20_000 });
    expect(uploads).toHaveLength(1);
  });
});
