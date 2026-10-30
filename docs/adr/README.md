# Architecture decision records

Short records of choices that shaped the system and the reasons, so they can be revisited on purpose rather than by accident.
Format: context, decision, consequences. Contract changes after the freeze (Tue 27 Oct, 1 PM IST) get a record here and a line in `lib/contracts/CHANGELOG.md`.

| # | Decision |
|---|---|
| [0001](0001-route-pipelines.md) | Style routes run hair-transfer then a colour restore with the person's own hex; textured styles use reference images |
| [0002](0002-job-engine.md) | A poll-driven job engine on a shared KV, with a sliding YouCam call budget and per-step timeouts |
| [0003](0003-privacy-architecture.md) | No face images stored on our side, except opt-in, expiring, revocable share links |
| [0004](0004-job-ids-are-capabilities.md) | Job ids are unguessable capability tokens, not session-bound |
| [0005](0005-no-headwear-brow-record.md) | Headwear and scarf previews are out; brows lead with a Brow Record |
| [0006](0006-content-security-policy.md) | A static CSP with inline scripts allowed and hash-listed styles |
| [0007](0007-mock-and-replay-modes.md) | Three YouCam adapters (live, mock, replay) and a stateless mock |
