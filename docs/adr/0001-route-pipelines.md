# 0001. Style routes: transfer, then restore the person's colour

**Status:** accepted (26 Oct 2026, after B0 stages 1–3 and B5)

**Context.** YouCam's Hair Style v2.1 has two modes. Templates (`template_id`) restyle the hair but drift the colour: on our four sample people brown went near-black or blue-black and silver went steel-blue (`docs/YOUCAM_FACTS.md`, stage 1). `keep_users_color: true` only keeps the colour *family*. Templates also change texture, so coily hair became loose waves. Hair Color, chained on the transfer result by URL, restores colour faithfully. Custom mode (`ref_file_id` with `hair_color: 'src'`) keeps both texture and colour in one step.

**Decision.**
- Template styles run `hair-transfer` then `hair-color` with the person's own hex (3 units, about 27 s).
- Reference styles (coily, curly, locs, braids, generated once with YouCam Image Generator) run one custom-mode `hair-transfer` (2 units, about 15 s).
- The request bodies are defined once in `lib/catalog/pipeline.ts` (`planSteps`) and shared by the mocks and the server.
- The hex comes from the person's photo. Its **hue** matters far more than the intensity setting (B5: a yellowish sample rendered olive), so the UI must show the swatch and offer the colour-family default.

**Consequences.** Every route costs 2 or 3 units and about 5 YouCam calls. Coily hair only ever sees coily styles (the planner enforces it), and the UI discloses that template styles can change texture. Locs and braids are "protective" styles: variants only, never "closest".
