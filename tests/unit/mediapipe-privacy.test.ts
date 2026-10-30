import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * MediaPipe Tasks creates a usage logger unconditionally and POSTs to
 * https://odml.pa.googleapis.com/v1/log every 60 s and on close, with no option
 * to turn it off. Our privacy promise is that nothing leaves the device but the
 * photo the user chooses to send to YouCam, so the dependency is patched
 * (patches/@mediapipe__tasks-vision.patch, registered in pnpm-workspace.yaml) to
 * make that flush a no-op. This test fails loudly if an upgrade drops the patch.
 */
const dir = join(import.meta.dirname, "..", "..", "node_modules", "@mediapipe", "tasks-vision");

describe("MediaPipe telemetry is disabled", () => {
  for (const file of ["vision_bundle.mjs", "vision_bundle.cjs", "vision_bundle.js"]) {
    it(`${file}: the logger's flush returns before it can send`, () => {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source).toContain("flush(t,e){return void t?.();if(this.error)");
    });
  }

  it("the patch is registered", () => {
    const workspace = readFileSync(join(import.meta.dirname, "..", "..", "pnpm-workspace.yaml"), "utf8");
    expect(workspace).toMatch(/@mediapipe\/tasks-vision.*patches\/@mediapipe__tasks-vision\.patch/);
  });

  it("our own code never names a third-party endpoint for the camera path", () => {
    for (const file of ["mediapipe.ts", "engine.ts", "still.ts", "encode.ts"]) {
      const source = readFileSync(join(import.meta.dirname, "..", "..", "lib", "client", "capture", file), "utf8");
      expect(source).not.toMatch(/https?:\/\/(?!localhost)/);
    }
  });
});
