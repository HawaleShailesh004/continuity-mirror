# 0007. Three YouCam adapters, and a stateless mock

**Status:** accepted (B1–B3)

**Context.** Most development and all tests must spend no units, and a deployed preview must work without a key.

**Decision.** One `YouCamAdapter` interface with `live` (real HTTP), `mock` (3–8 s latency, free errors, results are the person's own photo with a large "MOCK" watermark, so they can't pass for real ones) and `replay` (recorded responses from `tests/fixtures/youcam`). `YOUCAM_MODE` defaults to `mock`. Tests never call the live API; only `scripts/build-style-refs.mjs`, `scripts/build-demo-personas.ts` and `scripts/smoke-live.ts` can, and each logs and caps its units. The mock encodes a task's state in its id, so any serverless instance can poll it.

**Consequences.** `/api/status` reports `mode`, and the UI says when results aren't real. The mock can't reproduce YouCam's real quirks (PNG colour results, hue sensitivity), which is why B5 ran the real stack once and kept the results as the demo.
