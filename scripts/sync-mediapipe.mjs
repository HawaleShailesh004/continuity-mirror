#!/usr/bin/env node
/*
 * Self-host the MediaPipe WASM runtime (frontend plan §2, §6): the capture
 * screen loads everything from our own origin, so a strict CSP can say
 * `default-src 'self'` and the camera frames never touch a third-party CDN.
 *
 * Copies the two variants the loader picks between (SIMD and no-SIMD) from
 * node_modules into public/mediapipe/wasm/ (git-ignored: 13 MB each). The two
 * model files in public/mediapipe/ are committed.
 * Runs before `dev` and `build`, and can be run by hand: pnpm mediapipe:sync
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = join(root, "public", "mediapipe", "wasm");

const FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

if (!existsSync(from)) {
  console.error("sync-mediapipe: @mediapipe/tasks-vision is not installed (run pnpm install)");
  process.exit(1);
}

mkdirSync(to, { recursive: true });
let copied = 0;
for (const name of FILES) {
  const src = join(from, name);
  const dest = join(to, name);
  if (existsSync(dest) && statSync(dest).size === statSync(src).size) continue;
  copyFileSync(src, dest);
  copied++;
}

for (const model of ["face_landmarker.task", "pose_landmarker_lite.task"]) {
  if (!existsSync(join(root, "public", "mediapipe", model))) {
    console.error(`sync-mediapipe: missing public/mediapipe/${model} (it is committed; see docs/THIRD_PARTY.md)`);
    process.exit(1);
  }
}

const version = JSON.parse(readFileSync(join(from, "..", "package.json"), "utf8")).version;
console.log(`sync-mediapipe: tasks-vision ${version}, ${copied ? `${copied} file(s) copied` : "already up to date"}`);
