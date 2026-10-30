# Contracts changelog

Every change to `lib/contracts` after the freeze (Tue 27 Oct 2026, 1 PM IST) gets a line here and an ADR in `docs/adr/`. MSW handlers change in the same commit.

## 0.1.0 · Mon 26 Oct 2026 (B1, pre-freeze)

First version, from the backend plan §3 adjusted to the B0 facts:

- `RouteSpec.colour` is `{source: 'own', hex} | {source: 'template'} | {source: 'preset', presetId, mode}`. The plan's `keepOwnColour` + optional preset is replaced, because own colour now needs the user's hex (B0: templates drift darker/cooler; a Hair Color pass with the user's hex restores it).
- No `headwear` job kind, and step kinds are `hair-transfer | hair-color | makeup-vto` (B0: Hat/Scarf generate whole new scenes). `capabilities.headwear`/`scarf` stay in status, always false for now.
- `BrowsSpec` takes `colourHex` + `intensity` instead of a `colourId`.
- `attempt` is on every spec kind (re-rolls).
- `GET /api/jobs/:id` returns `{ job }` (same as create).
- `Job.provenance` is per step: `{ mode, steps: [{ kind, endpoint, apiVersion, params, youcamTaskId, finishedAt }] }`.
- New: `Job.resultExpiresAt`, `Job.baselineId`, `Job.clientRequestId`, `Job.updatedAt`; `StatusResponse.mode`, `.limits`, `.serverTime`; `CreateBaselineResponse.expiresAt`.
- New error codes: `NOT_READY` (409, result requested too early) and `FEATURE_DISABLED` (403, capability off).
- `POST /api/baselines` answers 201 when new, 200 when reused.
- Mock scenarios added beyond the plan: `budget_exhausted`, `live_disabled`, `partial_failure`, `expired`.

## 0.1.1 · Mon 26 Oct 2026 (B4, pre-freeze, additive)

- `domain.ts`: export the `ChangedDimension` type (the schema already existed). No wire change.

## 0.1.2 · Mon 26 Oct 2026 (B5, pre-freeze, additive)

- New `lib/contracts/demo.ts`: `DemoManifest` (shape of `public/demo/manifest.json`: personas with items, failures, reference checks). Browser-safe, not part of `/api`.
- `lib/contracts/mocks/fixtures.ts`: Daniel's snapshot texture `wavy` → `curly`; `hairHex` added for Meera (`#2A1D18`) and Daniel (`#402E22`). This changes what the planner returns for the sample people.
- `StyleCatalogItem.protective` (default false; locs and braids): never "closest" or "easier".

## 0.1.3 · Mon 26 Oct 2026 (B6, pre-freeze)

- `CreateShareMeta.consent: true` is required (the owner agrees the images are stored until expiry or revocation). **Breaking for any client that already posts to /api/shares.**
- `PrivacyReceipt.serverStoresImages` is now a boolean: true only while the session has a live share link (was the constant `false`, which would have been untrue once shares exist).
- Real share routes replace the MockBackend stub: `GET /api/shares/:token/items/:key` serves the images (the manifest's `imageUrl`), unknown/malformed/expired/revoked tokens all return 410, and `GET /api/cron/cleanup` (Bearer `CRON_SECRET`) removes expired shares.
- `status.capabilities.shares` is true by default locally and false on Vercel until configured.

## 0.2.0 · Fri 30 Oct 2026 (B2 result check, post-freeze, additive; docs/adr/0008)

- New job kind `repair` (`RepairSpec`: `{ kind: 'repair', fromJobId, colourHex }`) in `JobSpec` and `JobKind`. One `hair-color` step, 1 unit, over an earlier job's result (`src_file_url` filled server-side from that job; the URL never leaves the server). The source must be a finished `route` or `colour` job of the same baseline inside its result window; otherwise `NOT_FOUND`, `NOT_READY`, `EXPIRED` or `VALIDATION_FAILED`. A repair of a repair is refused.
- Existing clients are unaffected: no field of any existing type changed, and `repair` jobs are only ever created by `lib/client/check/run.ts`.
- `docs/API.md` and `docs/openapi.json` regenerated; the mock backend serves a repair job with its source's image.
