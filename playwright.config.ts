import { defineConfig } from "@playwright/test";

/*
 * Frontend e2e / accessibility (frontend plan §11). Mobile (390) and desktop
 * (1280) viewports. Locally it reuses a running `pnpm dev`; CI should run
 * against `pnpm build && pnpm start` by setting E2E_BASE_URL. Journey tests
 * need the build made WITH NEXT_PUBLIC_API_MOCKS=1 (the mock API runs in the browser).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  // The journey tests wait on realistic timing against a dev server that compiles on demand;
  // more than four browsers at once starves them. CI against a production build can raise this.
  workers: process.env.CI ? undefined : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL, reducedMotion: "reduce" },
  projects: [
    { name: "mobile-390", testIgnore: ["**/capture.spec.ts", "**/flow.spec.ts", "**/p1-brows.spec.ts"], use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: "desktop-1280", testIgnore: ["**/capture.spec.ts", "**/flow.spec.ts", "**/p1-brows.spec.ts"], use: { viewport: { width: 1280, height: 900 } } },
    {
      // Real face/pose models run on the CPU in the browser (capture, and the journey tests that
      // start from an uploaded photo), so these files get the machine to themselves: they start only
      // after every other project has finished, and each file runs one test at a time.
      name: "capture",
      testMatch: ["**/capture.spec.ts", "**/flow.spec.ts", "**/p1-brows.spec.ts"],
      fullyParallel: false,
      dependencies: ["mobile-390", "desktop-1280"],
      use: { viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev --port 3100",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        // The journey tests run against the in-browser mock API (MSW).
        env: { NEXT_PUBLIC_API_MOCKS: "1" },
      },
});
