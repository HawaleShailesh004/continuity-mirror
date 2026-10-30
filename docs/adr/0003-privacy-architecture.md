# 0003. Privacy: nothing stored on our side, except opted-in shares

**Status:** accepted (master plan §2.2, implemented B2–B6)

**Context.** The users are people facing hair loss, uploading a face photo. The product promises privacy and honesty.

**Decision.**
- The baseline is normalised in memory, uploaded to YouCam once, and **only its YouCam file id** is kept (24 h). The bytes are dropped. Results are streamed from YouCam to the browser and kept on the person's device (IndexedDB).
- YouCam keeps uploads and results for up to 30 days under its API terms; we cannot delete those, and say so (`DELETE /api/baselines/:id` returns `upstreamRetentionDays: 30`).
- The one exception is **share links** (P1): explicit `consent: true`, at most 7 days, images re-encoded with all metadata removed, stored in **private** blob storage that only our server can read, deletable at once with an owner key (only its hash is stored), and removed by a daily cleanup. The privacy receipt says `serverStoresImages: true` while a link is live.
- Logs never contain image data, signed URLs, raw IPs, cookies or keys. IPs are salted hashes.

**Consequences.** Losing the owner key means a link can't be revoked early (it still expires). Sample people are AI-generated, so the demo stores no real person's face. Every claim in the UI maps to code and a test in `docs/FACTS.md`.
