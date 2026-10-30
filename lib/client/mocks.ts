/*
 * Optional in-browser API mocks (MSW), for building and testing without a
 * backend. On only when NEXT_PUBLIC_API_MOCKS=1; otherwise this whole module
 * is dead code and `msw` never reaches the production bundle.
 *
 * `api.ts` awaits `whenMocksReady()` before every request, so the first call
 * can never race the service worker. Scenarios: `?mock=<scenario>` and
 * `?mockLatency=0` in the URL (remembered), or `window.cmMock` in the console
 * (see docs/API.md, "Mocks").
 */
let started: Promise<void> | undefined;

export function whenMocksReady(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // The env check is written inline so the bundler replaces it with a constant
  // and drops the import entirely when mocks are off: `msw` never ships.
  if (process.env.NEXT_PUBLIC_API_MOCKS === "1") {
    started ??= import("@/lib/contracts/mocks/browser").then((mod) => mod.startMockWorker()).then(() => undefined);
    return started;
  }
  return Promise.resolve();
}
