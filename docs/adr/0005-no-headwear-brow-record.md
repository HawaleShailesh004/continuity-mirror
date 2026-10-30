# 0005. No generated headwear; brows lead with a Brow Record

**Status:** accepted (26 Oct 2026, B0 stage 2, confirmed B5)

**Context.** YouCam's Hat and Scarf try-ons generate a whole new scene (new outfit and background, 896×1152) instead of editing the photo, and the scarf landed on the neck, not the head. The eyebrow try-on is nearly invisible on brows that are still there (confirmed again at intensity 85 in B5).

**Decision.** `CAP_HEADWEAR` and `CAP_SCARF` stay false and there is no headwear job kind; headwear is written guidance in the plan. Brows become a **Brow Record**: a crop of the person's own brows, the closest of 17 verified YouCam shapes, the colour, and how-to steps. The try-on preview is kept but carries a note that it is subtle.

**Consequences.** The baseline stays beside every result (the product's core rule). A module the master plan listed as P1 is dropped; the roadmap slide keeps it.
