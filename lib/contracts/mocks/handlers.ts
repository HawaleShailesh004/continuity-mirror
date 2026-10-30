import { http } from "msw";
import type { MockBackend } from "./backend";

/** MSW handlers for the whole /api surface, backed by one MockBackend instance. */
export function createHandlers(backend: MockBackend) {
  return [http.all("*/api/*", ({ request }) => backend.handle(request))];
}
