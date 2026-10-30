// The MSW handlers intercept real fetch calls (as the frontend makes them) and answer from MockBackend.
import { setupServer } from "msw/node";
import { afterAll, beforeAll, expect, it } from "vitest";
import { JobResponse, StatusResponse } from "@/lib/contracts/api";
import { createHandlers } from "@/lib/contracts/mocks/handlers";
import { createNodeMockBackend } from "@/lib/contracts/mocks/node";

const backend = createNodeMockBackend({ latencyScale: 0 });
const server = setupServer(...createHandlers(backend));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

it("serves the contract through fetch", async () => {
  const status = StatusResponse.parse(await (await fetch("http://localhost:3000/api/status")).json());
  expect(status.mode).toBe("mock");

  const persona = await (await fetch("http://localhost:3000/api/status", { headers: { "x-cm-mock-scenario": "live_disabled" } })).json();
  expect(persona.live).toBe(false);
});

it("runs a job instantly with latencyScale 0", async () => {
  const { readFile } = await import("node:fs/promises");
  const form = new FormData();
  form.set("image", new Blob([await readFile("public/mock/personas/grace.jpg")], { type: "image/jpeg" }), "grace.jpg");
  const { baselineId } = await (await fetch("http://localhost:3000/api/baselines", { method: "POST", body: form })).json();
  const res = await fetch("http://localhost:3000/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baselineId, clientRequestId: crypto.randomUUID(), spec: { kind: "route", routeId: "closest", styleId: "pixie", colour: { source: "own", hex: "#BEBDB8" } } }),
  });
  const { job } = JobResponse.parse(await res.json());
  expect(job.status).toBe("succeeded");
  const image = await fetch(`http://localhost:3000/api/jobs/${job.id}/result`);
  expect(image.status).toBe(200);
});
