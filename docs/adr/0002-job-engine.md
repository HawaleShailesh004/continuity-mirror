# 0002. A poll-driven job engine with a shared call budget

**Status:** accepted (B3, hardened in B7)

**Context.** The app runs on serverless functions with no long-lived process. YouCam tasks take 10–40 s, and its rate limit is 250 calls per 300 s per token (and per IP). Several people, and several browser tabs per person, can poll the same job.

**Decision.**
- Job state lives in the KV (Upstash in production, memory locally). It is advanced by whoever polls (`GET /api/jobs/:id`) or by the webhook, behind a per-job lock (`SET NX`), through one function (`advance`).
- Polls within 4 s of the last real check are answered from the KV. The first check waits 5 s after submit (a step never finishes sooner). Result: about **5 YouCam calls per route job** (measured in `tests/integration/load.test.ts`).
- Every real YouCam call (submit or poll) spends from one **sliding-window** budget of 200 per 300 s shared by all instances. A fixed window would let 2× through at a boundary (the load test saw 280 in one span). When the budget is spent, jobs wait; they do not fail.
- The 180 s timeout runs **per step** and excludes time we imposed by throttling. Before failing a timed-out step the engine asks YouCam once more, so a result that was ready while the tab was closed is accepted.
- Units are reserved when a job is created and refunded when YouCam rejects it (its errors are free). A timeout keeps the reservation, because YouCam may still charge.

**Consequences.** Capacity is a number we can state: about 40 route jobs per 5 minutes (roughly 13 people running three paths). Beyond that, jobs slow down (median 6.7 min in a simulated 25-person rush) but complete. Sample mode uses no YouCam calls at all, so judges are never throttled. The webhook payload shape is unverified (we read only a task id and then ask YouCam), so polling is the primary mechanism.
