import type { Page } from "@playwright/test";

/** Dispatch a picked file into the upload input (no file dialog needed). */
export async function pickFile(page: Page, file: { name: string; type: string; draw?: "grey" | "persona" }) {
  await page.evaluate(async ({ name, type, draw }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 960;
    const ctx = canvas.getContext("2d")!;
    if (draw === "persona") {
      const img = new Image();
      img.src = "/mock/personas/amara.jpg";
      await img.decode();
      ctx.drawImage(img, 0, 0, 720, 960);
    } else {
      ctx.fillStyle = "#7a8794";
      ctx.fillRect(0, 0, 720, 960);
    }
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
    const input = document.querySelector<HTMLInputElement>('[data-testid="photo-input"]')!;
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], name, { type }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, file);
}

/**
 * A sample person with one look saved, standing on their plan. Starts from the
 * consent screen directly (not the landing page, whose wording changes), then
 * follows the real screens: no shortcuts into the journey's data.
 */
export async function reachPlanWithLook(page: Page, look = "Closest to me") {
  await page.goto("/start/consent?sample=1");
  await page.getByRole("button", { name: "I understand, continue" }).click();
  await page.getByRole("button", { name: "See my three paths" }).click();
  await page.getByRole("link", { name: look, exact: true }).click();
  await page.getByRole("button", { name: "Save to my plan" }).click();
  await page.getByRole("link", { name: /Open my plan, 1 look saved/ }).click();
  await page.getByRole("heading", { name: "My plan", level: 1 }).waitFor();
}

/**
 * Answer the six snapshot tags of a real person (nothing is pre-chosen for them):
 * each tag opens a sheet; a one-choice sheet closes itself, colour and brows have "Done".
 */
export async function answerSnapshot(page: Page) {
  const open = (group: string) => page.getByRole("button", { name: new RegExp(`^(${group}: |Choose ${group.toLowerCase()})`) }).click();
  const choose = (name: string) => page.getByRole("dialog").getByRole("radio", { name, exact: true }).click();
  const done = async () => {
    await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  };
  const single = async (group: string, name: string) => {
    await open(group);
    await choose(name);
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  };
  await open("Hair colour");
  await choose("Dark brown");
  await done();
  await single("Length", "Shoulder length");
  await single("Parting", "No parting");
  await single("Fringe", "No fringe");
  await single("Texture", "Straight");
  await open("Brows");
  await choose("Soft arch");
  await choose("Dark");
  await done();
}
