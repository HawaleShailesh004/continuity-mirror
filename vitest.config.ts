import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}` },
      // `server-only` throws outside the react-server condition; tests run server code directly.
      { find: /^server-only$/, replacement: `${root}tests/support/empty.ts` },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts"],
    environment: "node",
    // Generous: CI runners and busy laptops (browser tests running alongside) are slow, and a few
    // integration tests decode and re-encode images or simulate minutes of polling.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["lib/server/**", "lib/contracts/**", "lib/planner/**"],
    },
  },
});
