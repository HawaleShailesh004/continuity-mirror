# YouCam API — verified facts

Source of truth for agents. Only things observed against the live API go here, each with its date.
Raw responses live in `spike-output/` (gitignored); scrubbed copies move to `tests/fixtures/youcam/` in B1.

## Account (26 Oct 2026)

- Host: `https://yce-api-01.makeupar.com` (India-region account). Auth: `Authorization: Bearer <YOUCAM_API_KEY>` works on v1.0 and v2.x routes.
- `YOUCAM_SECRET_KEY` (RSA public key) is not needed for v2 calls.
- Balance: `GET /s2s/v1.0/client/credit` →
  `{ status: 200, results: [{ id, type: "ApiPaygToken", amount: 1000, amount_dec: 1000, expiry: 1800835199000 }] }`
  Remaining units = sum of `results[].amount`. Expiry is epoch ms (Jan 2027).
- Read-only calls (credit, feature-cost, template list) cost **0 units** (balance 1000 before and after).

## Feature costs (`GET /s2s/v2.0/credit/feature-cost`)

Shape: `{ status, result: { skus: [{ description, amount, unit: "result_image", proc_unit, run_task_url }] } }`.
The list returned **20 SKUs** and does **not** include Hair Color, Makeup VTO, Hat or Scarf. Costs for those must be measured from balance deltas in B0 part 2 (docs say 1 / 1 / 2 / 2).

| Units | Feature | Path |
|---:|---|---|
| 2 | Hair Style V2.0 Preset (templates) | `/s2s/v2.1/task/hair-transfer` |
| 2 | Hair Style V2.0 Custom (ref image) | `/s2s/v2.1/task/hair-transfer` |
| 1 | Hair Style V1.0 | `/s2s/v2.0/task/hair-style` |
| 1 | Wavy Hair | `/s2s/v2.0/task/hair-curl` |
| 2 | Hair Volume | `/s2s/v2.0/task/hair-vol` |
| 1 | Bangs | `/s2s/v2.0/task/hair-bang` |
| 1 | Hair Extension | `/s2s/v2.0/task/hair-ext` |
| 1 | Image Generator V2.0 text-to-image | `/s2s/v2.0/task/text-to-image/youcam` |
| 1 | Image Generator V2.0 image-to-image | `/s2s/v2.0/task/image-to-image/youcam` |

## Hair-transfer templates (`GET /s2s/v2.1/task/template/hair-transfer`)

- `page_size` max is **below 50** (50 → `400 InvalidParameters "page_size is above the allowed maximum."`); 20 works.
- Paging: response `data.next_token` → pass as `starting_token`. 6 pages, **116 templates**.
- Template fields: `id`, `thumb` (CDN jpg), `title`, `category_name` (`Male` | `Female`), **`keep_users_color`** (boolean).
- `keep_users_color: true` on **71 / 116** (Female 62, Male 9). So own-colour preservation is a **per-template property**, not a request flag.
- Thumbnails downloaded to `spike-output/thumbnails/<id>.jpg`.

### Implications

- **Closest-to-me** and **Easier** routes use only `keep_users_color: true` templates → 1 step, 2 units.
- Templates with `keep_users_color: false` impose their own colour; use them only for **New chapter** (colour change intended), or follow with a Hair Color step (to be tested).
- **Excluded from the catalog:** `male_bald`, `female_bald` (product rule: no bald simulation), and novelty colours (`all_pink_blue_fade`, `all_split_rainbow`, `all_highlight_wave_rainbow`, `female_neon_root_black_hair`, `female_pixie_pink`, `all_violet_space_buns`, …) unless a user picks them under New chapter.
- **Regrowth ladder is possible** with own-colour templates: `all_buzz_cut` / `female_buzz_cut` → `all_pixie` / `all_wispy_fringe_pixie` / `all_short_feather_cut` → `all_bixie_cut` / `all_short_bob` → `all_french_bob` / `all_bobcut`.
- **Textured hair options** with own colour: `male_afro`, `all_dreadlocks`, `female_bouncy_curls`, `female_bobcut_curly`, `female_long_spiral_curls`, `all_curly_double_buns`, `all_spiral_buns`, `all_baby_braids`, `all_bubble_braids`, `female_two_braids`. (`female_afro` imposes colour.)
- **Men** with own colour: `male_textured_comma`, `male_afro`, `male_wavy_undercut`, `male_tousled_cut`, `all_side_swept_undercut`, `all_buzz_cut`, `all_tousled_waves`, `all_hippie_wave`.

## Stage 1 results (26 Oct, 12 units; raw logs in `spike-output/stage1/`)

**Upload:** `POST /s2s/v2.0/file` with `{ files: [{ content_type, file_name, file_size }] }` → `data.files[0].file_id` + `requests[0]` (PUT url + headers). Works for hair-transfer.

**Hair-transfer:** `POST /s2s/v2.1/task/hair-transfer { src_file_id, template_id }` → poll `GET .../{task_id}`.

| Persona | Template | Result | Time | Units |
|---|---|---|---|---|
| Meera (dark brown, straight) | `all_short_bob` | ✅ realistic; identity intact; **colour darker/cooler (brown → near black)**; template added a fringe | 7 s | 2 |
| Amara (black, coily) | `female_bobcut_curly` | ✅ realistic; **texture changed coily → loose waves; colour shifted to blue-grey** | 7 s | 2 |
| Daniel (brown, curly) | `male_textured_comma` | ✅ realistic; beard intact; colour darker; texture curly → wavy | 10 s | 2 |
| Grace (silver) | `all_pixie` | ✅ realistic; **silver → steel blue-grey** | 7 s | 2 |

- Output = **768 × 1024 JPEG, same size as the 1024-long-side input** → before/after compare aligns pixel for pixel.
- `keep_users_color: true` keeps the colour *family* only; results trend darker and cooler. Texture comes from the template.
- **Errors are free:** a no-face input returned `error_no_face` and cost **0 units**.
- **The API is more lenient than the docs:** a face-only crop with no shoulders and a 35°-rotated photo both **succeeded and were charged 2 units each**. So client-side capture checks protect quality and units; the API won't reject these for us.

### Decisions from stage 1

1. **Colour fidelity step:** routes that promise "your colour" add a Hair Color pass on the hair-transfer output (to be verified in stage 2) → 3 units per route.
2. **Texture-aware planner:** curly/coily snapshots only get curl-texture templates; stage 2 tests textured templates on Amara.
3. The "Does this still feel like you?" cue checklist is the honest safeguard for remaining drift; copy says "colour and texture may differ slightly".

## Stage 2 results (26 Oct, 14 units; logs in `spike-output/stage2/`, sheets `spike-output/sheet-s2-*.jpg`)

**One upload, many endpoints: confirmed.** The stage-1 `file_id`s (from `POST /s2s/v2.0/file`) worked for hair-transfer, hair-color, makeup-vto, hat and scarf.

| Test | Request | Result | Units |
|---|---|---|---|
| Colour restore, chained by URL | `POST /s2s/v2.0/task/hair-color { src_file_url: <hair-transfer result url>, pattern: { name: 'full' }, palettes: [{ color: '#1C1714', color_intensity: 80, shine_intensity: 20 }] }` | ✅ **Excellent.** Amara's blue-grey back to warm natural black; style untouched | 1 |
| Colour restore, re-uploaded result | same with `src_file_id`, `#BEBDB8` | ✅ **Excellent.** Grace's steel-blue back to natural silver | 1 |
| Textured template | `female_bouncy_curls` on Amara | ⚠️ Realistic, but long loose curls (not coily), much longer than baseline; **hallucinated earrings** | 2 |
| Textured template | `female_long_spiral_curls` on Amara | ⚠️ Long loose curls, not coily; colour drifts grey | 2 |
| Brows | `makeup-vto` eyebrows `Straight1` / `SoftArch1`, `#2B1E16`, intensity 60 | ⚠️ Nearly invisible on someone who already has brows; slight overall face brightening | 1 + 1 |
| Hat | `hat { ref_file_id, gender, style }` beanie / cap | ❌ **Not a try-on:** generates a new full-body lifestyle scene (new outfit, street background, 896×1152). Face recognisable but small | 2 + 2 |
| Scarf as head wrap | `scarf` with the turban ref | ❌ Same scene generation; **scarf worn on the neck**, not the head | 2 |

- Hair Color request: `preset` (enum, e.g. `Chocolate Brown`) **or** `pattern: { name: 'full' | 'ombre', blend_strength, line_offset, coloring_section }` + `palettes: [{ color: '#RRGGBB', color_intensity 0–100, shine_intensity 0–100 }]` (1 entry for full, 2 for ombre). Status values: `running | success | error`; `results.url` valid **2 hours**.
- Makeup VTO accepts `src_file_id` as well as `src_file_url`. Eyebrow catalog: `https://plugins-media.makeupar.com/wcm-saas/patterns/eyebrows.json`, **350 shapes**, each with `label`, `category`, `shape` (e.g. "Soft Arch"), `thickness`, `description`, `thumbnail`.
- Hat/Scarf need `gender: 'female' | 'male'` (required) and optional `style`.
- Latency: hair-transfer/colour/makeup 7–10 s; hat/scarf 13–17 s.

### Decisions from stage 2

1. **Route pipeline = hair-transfer → hair-color with the user's own hex** (chained by `src_file_url`): 3 units, ~15–18 s, faithful colour. The user's hex comes from an **eyedropper on their own photo** ("tap your hair") with the colour-family chip as fallback.
2. **Headwear Lab and head wraps are out of the core** (`CAP_HEADWEAR=false`, `CAP_SCARF=false`): the endpoints restyle the whole scene, which breaks "always beside your baseline". Headwear remains as guidance in the Plan (comfort, fabrics) without generated previews.
3. **Brows become a "Brow Record"** (P1): cropped photo of the user's own brows + the closest catalog shape (by `shape`/`thickness` metadata) + colour hex + how-to. VTO preview optional, at higher intensity, mainly useful once brows thin.
4. **Coily hair is a known limitation** of the template set. Candidate fix to test (≈ 3 units): Hair Style **custom mode** with coily-texture reference images generated by YouCam Image Generator. Until then, the planner offers coily users protective/textured styles and the UI discloses the limitation.

## Stage 3: coily hair via custom mode (26 Oct, 3 units; sheet `spike-output/sheet-s3-coily.jpg`)

- Reference: generated with Image Generator V2.0 (1 unit, 13 s): chin-length type 4C coily cut → `spike-assets/ref-coily-chin.jpg`.
- `POST /s2s/v2.1/task/hair-transfer { src_file_id: <Amara>, ref_file_id: <ref>, hair_color: 'src' }` → ✅ **success, 11 s, 2 units.**
- Result: **coily texture preserved**, new chin-length shape from the reference, identity intact, **own natural black colour kept** (`hair_color: 'src'` works in custom mode, so no colour pass is needed).

### Decision from stage 3

**Custom-reference catalog for textures the templates miss.** For curly/coily (and any style the 116 templates lack), the catalog holds YouCam-generated reference images (≈ 1 unit each, generated once, stored in `public/catalog/refs/`). Routes on them use custom mode + `hair_color: 'src'` → 2 units, faithful colour and texture.

## Fixtures (B1)

Scrubbed copies of every raw response above are in `tests/fixtures/youcam/<group>/<case>.json` (`pnpm fixtures:scrub`; signed URLs → `https://fixtures.invalid/signed/N.jpg`, file/task ids → `fixture-file-N` / `fixture-task-N`). `lib/server/youcam/schemas.ts` is tested against them.

The request bodies above are encoded once in `lib/catalog/pipeline.ts` (`planSteps`), shared by the mocks and the server mapper.

## Still to verify

- Error codes beyond `error_no_face` (`error_no_shoulder`, `error_hair_too_short`, …): never observed, because the API accepted our bad inputs. The map in `lib/contracts/errors.ts` follows the docs.
- File lifetime: how long a `file_id` stays usable (the baseline KV TTL assumes ≥ 24 h; the S3 path says `ttl30`).
- Webhook payload capture (B3).

## B4: style references (26 Oct, 9 units; balance 1003 → 994)

- Image Generator V2.0 text-to-image cost **1 unit each**, confirmed by balance delta over 9 runs (`scripts/build-style-refs.mjs`). Prompt recipe: "Photorealistic portrait photograph of a <subject>. Front-facing … framed from above the head to mid-chest, both shoulders visible. Plain light grey studio background …" with a negative prompt excluding hats, earrings, glasses, hands. All 9 results were clean on visual check (no accessories, texture as asked).
- ~~Only `coily-chin` has been run through Hair Style custom mode~~ Superseded by B5 below: all 10 reference styles were run in custom mode and work.
- The eyebrow catalog (350 shapes) is stored at `tests/fixtures/youcam/catalogs/eyebrows.json`. Only 35 shapes carry `shape`/`thickness` metadata; every shape has a `category` (Soft Arch 152, Straight 47, Original 45, High Arch 37, Curved 29, Arrow 13, Drama 13, Upward 9, Thin 5). `lib/catalog/brows.json` lists 17 of them, all with known thickness.

## B5: the live pipeline and the demo people (26 Oct; 130 units, balance 994 → 864)

The in-process stack (route handlers + job engine + **live adapter**) ran 42 real jobs on the four sample people: **0 failures**, and the units charged matched the pipeline estimate for every job (98 predicted, 98 charged; 26 predicted, 26 charged). Raw results and provenance: `public/demo/manifest.json`.

- **Latency, end to end** (3 jobs in parallel, polling every ≥ 3.5 s, so slightly pessimistic): hair-transfer + hair-color p50 **27 s**, p95 37 s (n = 17); hair-transfer alone p50 15 s (n = 7); makeup-vto p50 14 s; hair-color alone p50 10 s. Show "usually 15–40 s" for a route, not 15–25.
- **Colour-step results are PNG** (about 1 MB); hair-transfer and makeup results are JPEG. Output is 768 × 1024 either way. The live adapter labels results by their bytes when storage doesn't say `image/*`. Demo files are stored as true JPEG q90 (7 MB for 46 images instead of 29 MB).
- **Own-colour restore depends on the hex's hue, not on intensity.** Template styles alone turn Meera's dark brown into blue-black. Restoring with `#2B2113` (hue 35°, a yellowish sample) gave an olive, too-light brown; `#2A1D18` (hue 17°) matched her hair. Intensity 80 vs 100 made no visible difference. A "tap your hair" eyedropper can pick up a yellow or green cast from the lighting, so the UI should show the swatch next to the result and offer the colour-family default as the fallback.
- **Ombre works** (first live run: Hair Color `pattern: ombre`, `blend_strength 50`, `line_offset 0`, `coloring_section: top`, two palettes): brown to caramel gave a lighter, warmer result with highlights.
- **Eyebrow VTO stays subtle even at intensity 85 and thickness +20** on brows that are still there (four runs, all nearly identical to the baseline). Confirms B0: lead with the Brow Record.
- **Custom mode with generated references: all 10 reference styles work** (1 in B0, 9 in B5): texture preserved, identity intact, natural colour kept by `hair_color: 'src'` (it can render slightly darker than the original). Template styles still change texture (Daniel's curls became straight hair with `m-tousled-cut`), so the planner prefers curly references for curly hair.
- **Fixture correction:** Daniel's sample tag was "wavy" but his hair is curly; it is now "curly" (his "closest" is the `m-curly-top` reference).
- A transient network failure on the first try of the colour experiment killed the script before any task was created (0 units). The live adapter's retries were exhausted; a rerun worked.
