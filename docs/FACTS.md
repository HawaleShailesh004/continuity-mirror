# Claim ledger

Every claim the product or the submission makes, traced to the code that enforces it and the test that would catch it breaking.
If you add a claim to the UI or the write-up, add a row here. A claim with no enforcing code and no test must not be made.
(`docs/YOUCAM_FACTS.md` is the separate record of what YouCam's API actually does.)

## Privacy and data

| Claim | Enforced in | Test |
|---|---|---|
| Our server never holds your photo; it keeps only YouCam's file id, for 24 hours | `lib/server/baselines.ts` (`createBaseline` stores `{id, fileId, size}`, drops the bytes) | `tests/integration/baselines.test.ts` › "never stores image bytes in KV" |
| Results go from YouCam to your device and are not stored by us | `lib/server/jobs/results.ts` (streams, writes nothing) | `tests/integration/jobs.test.ts` › "runs hair-transfer → hair-color, then serves the result" |
| YouCam may keep your images for up to 30 days and we can't delete those | `DeleteBaselineResponse.upstreamRetentionDays = 30` (`lib/contracts/api.ts`); YouCam's storage paths carry `ttl30` (`tests/fixtures/youcam`) | `tests/integration/baselines.test.ts` › "forgets the baseline, idempotently, and is honest about upstream retention" |
| "Delete everything" removes our records for you | `deleteBaseline` removes the baseline and this session's jobs | `tests/integration/jobs.test.ts` › "receipt lists this session's baselines and jobs; deleting a baseline removes its jobs" |
| The privacy receipt is a true list of what we hold | `lib/server/status.ts` (`getReceipt`) | same test, and `tests/integration/shares.test.ts` › "the privacy receipt lists this person's live shares" |
| The only images we ever store are share links you chose to create | `lib/server/shares/service.ts`; receipt `serverStoresImages` is true only while a link is live | `tests/integration/shares.test.ts` › "requires explicit consent…", "the privacy receipt…" |
| A share link needs your explicit consent, lasts at most 7 days, and you can end it at any time | `CreateShareMeta` (`consent: true`, `expiresInDays ≤ 7`); `revokeShare` | `tests/integration/shares.test.ts` › "requires explicit consent…", "revoking deletes images, votes and the record at once" |
| Shared images carry no hidden data (location, device) | `lib/server/shares/images.ts` re-encodes and strips metadata | `tests/integration/shares.test.ts` › "strips metadata (EXIF GPS)…" |
| Shared images sit in private storage; only our route can read them | `lib/server/blob/vercel.ts` (`access: 'private'`) | `tests/unit/blob.test.ts` › "writes private, never overwrites…" |
| We keep only a hash of your share's owner key | `createShare` stores `ownerKeyHash` | `tests/integration/shares.test.ts` › "never stores the owner key, only its hash" |
| An expired or deleted link can't be told apart from one that never existed | `loadLive` returns null for all three | `tests/integration/shares.test.ts` › "treats unknown, malformed and expired tokens the same (410)" |
| Expired links and their images are deleted automatically | `cleanupShares` + daily cron (`vercel.json`) | `tests/integration/shares.test.ts` › "daily cleanup" (3 tests) |
| Logs hold no images, URLs, IPs or cookies | `lib/server/log.ts`, `lib/server/http/ip.ts` (salted hash) | `tests/unit/http.test.ts` › "ip hashing" |
| Nothing leaves for a third party from your browser | CSP `connect-src 'self'`, no third-party origin in any directive | `tests/unit/security-headers.test.ts` › "allows no third-party origin anywhere" |
| The YouCam key never reaches the browser | `lib/server/**` is `server-only`; ESLint blocks importing it from client code | `scripts/check-bundle-secrets.ts` (CI step: scans `.next/static` for the key's name and value) |
| The camera is only used on our own site | `Permissions-Policy: camera=(self)` | `tests/unit/security-headers.test.ts` › "allows the camera on our own origin only" |

## Honesty about results

| Claim | Enforced in | Test |
|---|---|---|
| The sample people are AI-generated and their results are genuine YouCam outputs | `public/demo/manifest.json` (live-mode provenance, real task ids); `docs/ASSETS.md` | `tests/unit/demo-manifest.test.ts` › "provenance is genuine…" |
| The demo results match what our planner produces today | `scripts/build-demo-personas.ts` | `tests/unit/demo-manifest.test.ts` › "matches what the planner produces today" |
| "How this was made" shows the real endpoint, parameters and task id | `Job.provenance` (`lib/server/jobs/engine.ts` `toPublicJob`) | `tests/integration/jobs.test.ts` › "runs hair-transfer → hair-color…" |
| Practice (mock) results can never be mistaken for real ones | watermark in `lib/server/youcam/mock.ts`; `status.mode` and `provenance.mode` | `tests/unit/youcam-adapters.test.ts` › "runs a 2-step chain… watermarks results" |
| Routes are chosen by fixed rules, not by an AI or a score | `lib/planner/plan.ts` is pure (no I/O, no randomness) | `tests/unit/planner.test.ts` › "is deterministic", the exhaustive sweep of 7,680 snapshots |
| Coily hair is only ever shown coily styles (templates would change its texture) | `TEXTURE_PREFERENCE` in `lib/planner/plan.ts` | `tests/unit/planner.test.ts` › "closest and easier keep the user's colour and texture preferences" |
| "Easier" is never longer than "closest" | `planRoutes` | `tests/unit/planner.test.ts` › "easier is never longer than closest, and is a different style" |
| A "New chapter" route changes exactly one thing, and says which | `changeOneDimension` | `tests/unit/planner.test.ts` › "new chapter changes exactly one dimension, and says which" |
| Locs and braids are never offered as "closest to you" | `protective` flag, `pickNearest` | `tests/unit/planner.test.ts` › "protective styles" |
| The style catalog uses real YouCam templates only, never a bald one | `lib/catalog/styles.json` built from `youcam-templates.json` | `tests/unit/catalog.test.ts` › "only uses real YouCam templates…", "never includes bald templates" |
| Brow shapes are real YouCam shapes | `lib/catalog/brows.json` | `tests/unit/catalog.test.ts` › "brows catalog" › "lists only real YouCam shapes…" |

## Money help

| Claim | Enforced in | Test |
|---|---|---|
| Every wig programme and insurance step has a source link and the date we checked it | `lib/catalog/resources/*.json`, `resources.ts` schema | `tests/unit/resources.test.ts` › "every entry has an https source and an as-of date…" |
| Steps that are our own suggestion are marked as ours | `basis: "guidance"` | `tests/unit/resources.test.ts` › "marks our own suggestions as guidance…" |
| Programme details we could not open ourselves say so | `checkNote` on the Canadian Cancer Society entry | `tests/unit/resources.test.ts` (schema) and `docs/YOUCAM_FACTS.md` B4 notes |

## Limits and honesty about capacity

| Claim | Enforced in | Test |
|---|---|---|
| A session can spend at most 24 units, an address 48 a day; a rejected result costs nothing | `lib/server/ledger/ledger.ts` | `tests/integration/jobs.test.ts` › "budgets and the breaker", "failures" |
| Live generation turns itself off before the last 150 units | `lib/server/ledger/breaker.ts` | `tests/integration/jobs.test.ts` › "breaker: balance below UNIT_FLOOR…" |
| We never exceed YouCam's rate limit; under heavy load jobs slow down instead of failing | sliding budget in `lib/server/http/ratelimit.ts`, used by `lib/server/jobs/engine.ts` | `tests/integration/load.test.ts` (both tests), `tests/unit/http.test.ts` › "slidingRateLimit" |
| A result that finished while you were away is not lost | `advance` asks YouCam once more before timing out | `tests/integration/jobs.test.ts` › "failures" › "a result that was ready while nobody was polling is accepted, not reported as a timeout" |
| Every error has a plain message key and says whether to retry | `lib/contracts/errors.ts` | `tests/unit/contracts.test.ts` › "errors" |
| Photos YouCam can't use are caught or explained before units are spent | `lib/server/images/normalise.ts`; error map | `tests/unit/normalise.test.ts`; `tests/unit/contracts.test.ts` |

## Interface (frontend)

| Claim | Enforced in | Test |
|---|---|---|
| Every generated image carries "Style direction, not exact wig fit" | `StyleDirectionLabel`; `PhotoFrame`, `PathCard`, `CompareView` and `PlanCard` render it; the guardrail fails CI if a component with `data-generated-image` doesn't reference it | `scripts/guardrail.ts` (CI), `tests/e2e/sample.spec.ts` › "results are instant and genuine…" (3 labels), `tests/e2e/flow.spec.ts` |
| The app never scores, rates or ranks how anyone looks; you judge and we only record your answer | No screen renders a score; `VerdictControl` stores your own yes / not sure / no; banned words (`attractive`, `beauty score`, `looks younger`) | `scripts/guardrail.ts`, `tests/e2e/flow.spec.ts` › "…the verdict and saved look survive a reload" |
| No medical advice, no prediction of hair loss, no cure or treatment claims | Banned phrases (`diagnose`, `predict your hair loss`, `cure`, `treatment works`, `guarantee`) checked over `content/`, `components/`, `app/` | `scripts/guardrail.ts` (CI) |
| A photo that fails our checks is never sent to YouCam, so no units are spent on it | `lib/client/capture/checks.ts` + `still.ts` (`blocking()`); "Use this photo" is disabled while one fails | `tests/unit/capture-checks.test.ts`, `tests/e2e/capture.spec.ts` › "…a blocked photo never reaches the API", "upload: … no face is stopped" |
| Your photo stays on your device until you choose "Use this photo" | `CaptureScreen` uploads only in `use()`; checks run in the browser (MediaPipe, self-hosted) | `tests/e2e/capture.spec.ts` (baseline upload count is 0 until confirmed; "nothing may leave our own origin") |
| The face and pose models don't report anything to Google | `patches/@mediapipe__tasks-vision.patch` makes the usage logger's `flush` a no-op; CSP `connect-src 'self'` as a second guard | `tests/unit/mediapipe-privacy.test.ts` |
| The consultation pack is made on your device; your photos are not uploaded to make it | `components/pdf/consultation-pack.tsx` + `lib/client/pack.ts` (react-pdf in the browser; images passed as data URLs, never fetched) | `tests/e2e/sample.spec.ts` › "…pack PDF…" (runs under the production CSP, `connect-src 'self'`; PDF is real and contains the photos) |
| The pack says which suggestions are ours and where facts come from | `buildPackModel` marks `basis: 'guidance'` steps; `MoneyHelp` shows source link and "Checked <date>" on every entry | `tests/e2e/sample.spec.ts` (Canada entries show "Checked" and a source link) |
| "Delete everything" removes your photos, previews, answers and plan from this device and our records of them | `deleteEverything()` (`lib/client/journey.ts`) → `DELETE /api/baselines/:id`, clears every Dexie table, resets the journey | `tests/e2e/sample.spec.ts` › "…delete everything" (plan empty, `/paths` redirects to capture) |
| The privacy screen is a true receipt | `PrivacyScreen` reads Dexie counts and `GET /api/privacy/receipt`; says plainly when the server can't be reached; `serverStoresImages` decides the wording | `tests/e2e/sample.spec.ts`; server side `tests/integration/jobs.test.ts` (receipt) |
| Sample people are AI-generated and their results were made earlier with the real YouCam | `SampleModeBanner`; `installDemo()` installs the manifest's results with their real task ids; "How this was made" shows them | `tests/unit/client-demo.test.ts`, `tests/e2e/sample.spec.ts` ("AI-generated sample person", "Made live with YouCam") |
| A sample person's paths are exactly the ones their genuine results were made with | `demoRoutes()` reads the specs from the installed results; manifest matches the planner | `tests/unit/client-demo.test.ts` › "plans the paths from the very specs…", `tests/unit/demo-manifest.test.ts` |
| Your answers describe you; nothing about your hair is guessed | Snapshot starts empty for a real person (`toDraft(null)`); the button enables only when every group is answered | `tests/e2e/capture.spec.ts` › "…the snapshot starts empty" |
| Every screen meets WCAG 2.2 AA in light and dark, on phone and desktop | Token contrast gate (`scripts/check-contrast.mjs`); semantic markup, 44 px targets, labelled controls | `tests/e2e/a11y.spec.ts` (axe, every route × light/dark × 2 viewports) and axe on live states in `flow`, `capture`, `sample` specs |
| Nothing on a page logs a console error (no hydration mismatch, no CSP violation) | Run against the production build with its CSP | `tests/e2e/console.spec.ts` |

| The close-up of your brows is cut on your device and not sent anywhere | `cropImage` / `findBrows` (`lib/client/brows.ts`: canvas + the on-device face model); stored in IndexedDB `browRecords` | `tests/e2e/p1-brows.spec.ts` (the whole brow flow makes no non-GET request) |
| The brow practice steps are our suggestions; the outside advice is cited with the date we checked it | `content/copy/brows.ts` (`stepsOurs`, `citeLead`); `content/sources.ts` rows `acs-makeup`, `bcn-brows` (both read on 29 Oct 2026) | `tests/e2e/p1-brows.spec.ts` ("Our suggestions.", both source links) |
| Regrowth stages are possibilities, not predictions, and nothing is made until you ask | `RegrowthScreen` shows words only until "Show me"; every stage carries `regrowth.possibility` | `tests/e2e/p1.spec.ts` › "nothing is shown until asked…" |
| Each regrowth stage and each shared picture has your own photo beside it | `RegrowthStage` (before + stage); `composeShareImage` (`lib/client/share.ts`) | `tests/e2e/p1.spec.ts` (3 "before" photos beside 3 stages); `tests/unit/client-p1.test.ts` › "fits a picture inside its cell without cropping it" |
| A private link is only made after you tick an explicit yes (nothing is pre-ticked) | `ShareForm` (`components/cm/share-sheet.tsx`): the button stays disabled until `consent`; the API also requires `consent: true` | `tests/e2e/p1.spec.ts` › "make a link…" (unticked, disabled, then enabled) |
| "Stop sharing" and "Delete everything" end every private link | `stopSharing` / `stopAllSharing` (`lib/client/share.ts`), called by `deleteEverything()` before the tables are cleared | `tests/unit/client-p1.test.ts` › "stopping a share" (4 tests); `tests/e2e/p1.spec.ts` (link reads "ended" afterwards, both ways) |
| What a helper sees says nothing about why you are choosing a style, and their words are shown as plain text | `content/copy/share.ts` (helper section); `HelperScreen` and `ShareCardView` render notes as text | `tests/e2e/p1.spec.ts` (no "wig / chemo / cancer / treatment / hair loss" on the helper page; `<b>` in a note stays literal) |
| A helper's link is never indexed and does not pass its address on | `app/share/[token]/page.tsx` metadata (`robots: noindex`, `referrer: no-referrer`) | `tests/e2e/p1.spec.ts` › "an unknown or stopped link…" (noindex meta) |
| A module the server switches off never shows | `useCapability()` (`lib/client/hooks.ts`) gates the entry points on Plan; direct visits get a calm message | `tests/e2e/p1.spec.ts` › "modules the server switches off" |
| The partners page makes no claim about partners, numbers or a launch; its example is a real catalogue entry | `app/(app)/partners/page.tsx`; `docs/partner-catalog.schema.json` is generated from the catalogue's own schema | `tests/e2e/p1.spec.ts` › "partners page"; `tests/unit/client-p1.test.ts` › "partner catalogue format" |

## The result check (B2)

| Claim | Enforced in | Test |
|---|---|---|
| The check runs on your device: your photo and the result are measured in the browser and nothing about them is sent | `lib/client/check/measure.ts` (MediaPipe from our own origin, no network call); CSP `connect-src 'self'` | `tests/unit/security-headers.test.ts` › "allows no third-party origin anywhere"; `tests/unit/result-check-run.test.ts` (the check runs on stored blobs with the API mocked) |
| The check never rates a face or how someone looks: it only asks whether the face geometry moved and whether your hair colour stayed yours | `lib/client/check/judge.ts` (two outcomes per image; no score is stored for display) | `tests/unit/result-check.test.ts` › "judge" (7 tests) |
| Colour comes from where the hair is, not a guess: a hair mask, trimmed of highlights and shadow | `sampleHair` (`lib/client/check/colour.ts`) | `tests/unit/result-check.test.ts` › "sampleHair" |
| A colour that was meant to change is never "repaired" | `judge` (`expectOwnColour`) | `tests/unit/result-check.test.ts` › "never repairs a colour the route meant to change" |
| Hair too short to measure is not judged | `THRESHOLDS.minHairCoverage` | `tests/unit/result-check.test.ts` › "skips the colour check when the hair is too short to measure" |
| A drifted colour is repaired once, for 1 unit, and a repair cannot be repaired | `RepairSpec` and `repairSourceUrl` (`lib/server/jobs/engine.ts`) | `tests/integration/jobs.test.ts` › "repair job" (4 tests) |
| A repair can only touch a finished route or colour result of the same photo | `repairSourceUrl` | same, "refuses a source that is unknown, unfinished, from another photo, a brows job, or itself a repair" |
| A repair never leaves a result worse than it found it: if the colour is not closer, the first image is put back | `afterRepair` (`lib/client/check/run.ts`) | `tests/unit/result-check-run.test.ts` › "puts the first image back when the repair did not help" |
| The first image is kept beside a repaired one, and the repair step shows in "How this was made" | `storeResult` (`lib/client/jobs.ts`) | `tests/unit/result-check-run.test.ts` › "a finished repair replaces the source image, keeps the original…" |
| The thresholds and the numbers we quote come from measured results, regenerated by one command | `scripts/eval-check.ts` → `docs/EVAL.md` (`pnpm eval`) | `tests/unit/result-check.test.ts` (the thresholds are exercised through `judge`); the report lists every measurement |

## Not yet claimed here

Offline use and installing the app (F7) have no rows yet. Add them as those ship; until a row exists the claim must not be made.
