# 0008. Check every result on the device, and repair a drifted colour once

**Status:** accepted (30 Oct 2026, B2)

**Context.** A route's promise is "you, with different hair". Template styles can turn a dark brown into blue-black, and custom-mode references can render darker or warmer than the photo; the user's tapped hex is a poor guide because the light casts it. Nothing in the pipeline looked at the result, so a drifted one was shown as a match. Round-one winners graded their results (passed / needs review / passed after repair).

**Decision.**
1. After a result is stored, measure it on the device with MediaPipe: Face Landmarker (is the face geometry unchanged?) and a hair segmenter (is the hair still the baseline's colour, CIEDE2000 on a trimmed median?). No image leaves the device for this, and no score is shown or stored beyond the outcome.
2. Only routes that promised the user's own colour are judged on colour; deliberate colour changes and hair too short to measure are skipped.
3. If the colour drifted (ΔE > 4), request **one** Hair Color pass (`RepairSpec`, 1 unit) with a colour one proportional step past the baseline's measured hair, away from the drift. The server only repairs a finished route or colour result of the same baseline, and never a repair.
4. Measure the repaired image; keep it only if the colour is closer and the face is unchanged. Otherwise put the first image back. The first image is stored beside the repaired one.
5. Routes restore with the measured hex when one exists, so fewer results drift to begin with.

**Consequences.** About two in five own-colour results (7 of 18 stored samples) drift, so a repair costs 1 extra unit on those; the check and repair run after the user already has the image and never block it. A repair can come back worse about one run in ten; step 4 makes that harmless. The face check is a geometry check with a thin margin (0.010 genuine against 0.017 for a different person), so it is described as that, and a flag only offers another try, never a repair. Mock mode (`NEXT_PUBLIC_API_MOCKS=1`) turns the check off because its stand-in images are other people. Evidence: `docs/EVAL.md`; observations: `docs/YOUCAM_FACTS.md` (B2).
