# Asset provenance

Every image in the product or the submission is listed here with how it was made and under what terms.

## AI-generated sample people and headwear (26 Oct 2026)

- **Generator:** YouCam AI Image Generator V2.0, text-to-image (`POST /s2s/v2.0/task/text-to-image/youcam`, model `youcam-image-v2`), 1 unit each, through our own YouCam API account. Use is governed by the [YouCam API terms](https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api).
- **Prompts:** exactly as in `scripts/spike-1-generate-assets.mjs` (`prompt_extend: false`).
- **Not real people.** Shown in the product as "AI-generated sample person".

| File | Subject | Size |
|---|---|---|
| `spike-assets/persona-a-meera.jpg` | Woman ~40, shoulder-length dark straight hair | 1104×1472 |
| `spike-assets/persona-b-amara.jpg` | Woman ~32, shoulder-length coily hair | 1104×1472 |
| `spike-assets/persona-c-daniel.jpg` | Man ~30, medium-length wavy hair, beard | 1104×1472 |
| `spike-assets/persona-d-grace.jpg` | Woman ~60, grey bob with fringe | 1104×1472 |
| `spike-assets/headwear-beanie.jpg` | Grey knitted beanie (product) | 1328×1328 |
| `spike-assets/headwear-cap.jpg` | Navy baseball cap (product) | 1328×1328 |
| `spike-assets/headwear-sunhat.jpg` | Beige bucket sun hat (product) | 1328×1328 |
| `spike-assets/headwrap-turban.jpg` | Terracotta pre-tied turban head wrap (product) | 1328×1328 |
| `spike-assets/ref-coily-chin.jpg` | Style reference: chin-length type 4C coily cut (prompt in `spike/stage3-coily.mjs`) | 1104×1472 |

Results generated from these (hairstyle, colour, brows) are in `spike-assets/results/`, each named `<persona>__<style>.jpg`; all were produced by the YouCam API.

## Hairstyle templates

Style thumbnails come from YouCam's hair-transfer template list (`GET /s2s/v2.1/task/template/hair-transfer`), Perfect Corp assets used through the API they belong to.

## Style references for textured hair (26 Oct 2026, B4)

Generated with YouCam AI Image Generator V2.0 (`scripts/build-style-refs.mjs`, 1 unit each, 9 units, same terms as above). Not real people. Used only as the **hair reference** in Hair Style custom mode (`ref_file_id`, `hair_color: 'src'`), never shown as a person in the product (the UI shows the user's own photo with the new style). Prompts are in the script.

| File | Style |
|---|---|
| `public/catalog/refs/twa-short.jpg` | Very short coily (teeny weeny afro) |
| `public/catalog/refs/tapered-coils.jpg` | Short tapered coily cut |
| `public/catalog/refs/coily-shoulder.jpg` | Shoulder-length 4C coils |
| `public/catalog/refs/curly-chin.jpg` | Chin-length 3C curly bob |
| `public/catalog/refs/curly-shoulder.jpg` | Shoulder-length 3B curls |
| `public/catalog/refs/locs-shoulder.jpg` | Shoulder-length locs |
| `public/catalog/refs/box-braids-shoulder.jpg` | Shoulder-length box braids |
| `public/catalog/refs/m-coily-crop.jpg` | Man: short coily crop, tapered sides |
| `public/catalog/refs/m-curly-top.jpg` | Man: short curly top, faded sides |

Template thumbnails in `public/catalog/thumbs/` are YouCam's own (Perfect Corp assets used through the API). **Style tags** (length, fringe, parting, texture, care, price, wig notes) were assigned by eye from the thumbnails on 26 Oct and are marked `reviewed: false` until a human checks them.

## Demo results (26 Oct 2026, B5)

`public/demo/<person>/` holds each AI-generated sample person's baseline (JPEG, long side 1024) and their **genuine YouCam results** (Hair Style v2.1, Hair Color v2.0, Makeup VTO v2.0, run through our own pipeline in live mode by `scripts/build-demo-personas.ts`). `public/demo/manifest.json` records, for every image, the spec, units, duration, YouCam task ids and timestamps. Results were saved as JPEG q90 (YouCam returns PNG for colour steps). Four regrowth stages reuse an identical earlier result and say so in their `note`. In the product they are labelled "AI-generated sample person · results made earlier with YouCam".
