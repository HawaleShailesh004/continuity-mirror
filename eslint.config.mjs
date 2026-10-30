import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Server code must never reach the client bundle.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/client/**/*.{ts,tsx}"],
    ignores: ["app/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/lib/server/*", "@/lib/server"], message: "lib/server is server-only." }] },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "public/mockServiceWorker.js",
    // MediaPipe's WASM loader, copied from node_modules by scripts/sync-mediapipe.mjs
    "public/mediapipe/**",
    "test-results/**",
    // B0 spike material (plain Node scripts, generated output)
    "spike/**",
    "spike-output/**",
    "spike-assets/**",
    "scripts/spike-*.mjs",
  ]),
]);

export default eslintConfig;
