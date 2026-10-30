# Runbook

How to operate Continuity Mirror, especially from 2 Nov (judging) to the end of the judging period. Deploy steps are in [DEPLOY.md](DEPLOY.md).
Admin calls need `ADMIN_TOKEN`; never paste it into chat, a ticket or a commit. In the examples, `$APP` is the deployed URL.

## Where to look first

| What | How |
|---|---|
| Is it up, is live generation on, how many units does a session have | `curl $APP/api/status` (`live`, `reason`, `mode`, `capabilities`) |
| Real YouCam balance, units spent by kind, jobs by outcome, YouCam error counts, latency | `curl -H "Authorization: Bearer $ADMIN_TOKEN" $APP/api/admin/metrics` |
| Logs | Vercel → Logs. One JSON line per event (`api`, `job.created`, `job.failed`, `webhook.*`, `share.*`, `youcam.retry`). Filter on `level:error`. They never contain photos, URLs, IPs or cookies |
| Does the whole thing work end to end | `pnpm smoke:live -- --url $APP --route` (spends 3 units) |

`status.mode` must say `live` in production. If it says `mock`, `YOUCAM_MODE` is wrong and results carry a "MOCK" watermark.

## The numbers to know

| | |
|---|---|
| Units | A style route costs 3 (template styles: transfer + colour restore) or 2 (reference styles); a colour or brows job costs 1. YouCam's errors are free and are refunded to the session |
| Per session / per address | 24 units, 48 per day |
| Breaker | Live generation turns itself off when the real balance falls below `UNIT_FLOOR` (150). `status.live` is false with `reason: "units_low"` and the app offers the sample people |
| Speed | A route takes about 27 s (p95 37 s); a colour job about 10 s; brows about 14 s |
| YouCam calls | About 5 per route job. We spend at most 200 per 5 minutes (YouCam's limit is 250) |
| Capacity | About 40 route jobs per 5 minutes ≈ 13 people running three paths. Beyond that jobs slow down (median 6.7 min in a simulated 25-person rush) but finish. **Sample mode uses no YouCam calls**, so judges can always use it |
| Sessions' API limits | 150 calls/min per session, 400/min per address, 8 uploads/min, 10 job creates/min, 5 share creates/hour |

## Situations

### YouCam is down or slow during judging
1. `curl $APP/api/status`: `live` stays true until the breaker or a switch changes it, so this won't show it. Check the metrics (`youcamErrors`, `jobsByStatus.failed`) and the logs for `youcam.retry` and `YOUCAM_UNAVAILABLE`.
2. If jobs are failing, switch live generation off: `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" -d '{"enabled":false}' $APP/api/admin/live`. The app then offers the sample people (genuine, precomputed results) and new uploads get a calm "not right now". Turn it on again with `{"enabled":true}`.
3. Failed jobs were refunded, so nobody has lost units.

### Units are running low
- Check the balance in the metrics (`balance`). The breaker will stop live generation at 150 so the judging reserve is never spent by accident.
- To raise the reserve or top up: the YouCam console (`yce.makeupar.com`) or the optional social-post bonus (500 units per platform). To spend into the reserve on purpose, lower `UNIT_FLOOR` in the environment and redeploy.

### Someone is abusing the live path
- Per-session and per-address limits already cap spend (24 and 48 units). To stop everything immediately, use the kill switch above.
- To refuse a single address, there is no block list; the cheapest lever is lowering `IP_DAILY_UNIT_CAP` and redeploying.

### The YouCam key leaked or must be rotated
1. Create a new key in the YouCam console, update `YOUCAM_API_KEY` in Vercel, redeploy, and revoke the old one.
2. Run `pnpm check:secrets` on a fresh build (it scans the client bundle for the key's name and value).
3. Run the smoke test.

### The webhook
Polling is the primary mechanism; the webhook only speeds jobs up. If it isn't registered or its payload is unrecognised, nothing breaks. After registering it, make one real job and look in the logs for `webhook.advanced` (working) or `webhook.unrecognised` (it prints the payload's field **names**, never values). Send that line to whoever maintains `taskIdOf` in `lib/server/jobs/webhook.ts` and record the shape in `docs/YOUCAM_FACTS.md`.

### A share link must disappear now
The owner can revoke it from the app. If you must remove one without the owner key, delete its record and images with the cleanup job after setting its expiry in the past, or delete the Redis keys `share:<token>*` and the blobs under `shares/<token>/`. The daily cleanup also removes any image whose record is gone. To run the cleanup by hand: `curl -H "Authorization: Bearer $CRON_SECRET" $APP/api/cron/cleanup`.

### Judges can't get through the live path at all
Tell them to use "Try with a sample person". That path never calls YouCam and shows genuine results with their real task ids ("How this was made").

### Everything looks fine but a result image is wrong
Colour results depend on the hair colour picked from the photo, and its **hue** matters more than anything (`docs/adr/0001-route-pipelines.md`). Re-running with the colour-family default instead of the sampled colour is the first thing to try.

## Environment variables

Validated at startup by `lib/server/env.ts`: a bad configuration refuses to start and names the variable (never the value).

| Variable | Needed | Notes |
|---|---|---|
| `YOUCAM_MODE` | yes in production: `live` | default `mock`; `replay` serves recorded fixtures |
| `YOUCAM_API_BASE`, `YOUCAM_API_KEY` | yes when `live` | India-region host `https://yce-api-01.makeupar.com`. The key is server-only: never `NEXT_PUBLIC_` |
| `SESSION_SECRET`, `IP_HASH_SALT` | on Vercel | 32+ random bytes / 8+ chars. Changing them signs everyone out and resets address-based limits |
| `KV_DRIVER=upstash`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | yes | memory KV is per instance and would split state |
| `ADMIN_TOKEN` | yes | 16+ chars; without it the admin routes refuse everyone |
| `YOUCAM_WEBHOOK_SECRET` | optional | `whsec_…` from the console's Webhook Management page |
| `CAP_SHARES=true`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET` | only to enable share links | the app refuses to start with `CAP_SHARES=true` on Vercel unless all three and `KV_DRIVER=upstash` are set |
| `CAP_BROWS` (true), `CAP_REGROWTH` (true), `CAP_HEADWEAR`, `CAP_SCARF` (false) | optional | `status.capabilities` mirrors them; the UI hides what is off |
| `UNIT_FLOOR` (150), `SESSION_UNIT_CAP` (24), `IP_DAILY_UNIT_CAP` (48), `LIVE_GENERATION_ENABLED` (true) | optional | the KV kill switch overrides `LIVE_GENERATION_ENABLED` |
| `PUBLIC_BASE_URL` | optional | used to build share links; otherwise the request's own origin |
| `NEXT_PUBLIC_API_MOCKS` | **must be unset or 0** | `1` serves the API from the browser (MSW) and would show fake results |

## Before the deadline (Mon 2 Nov, 10:15 PM IST)

- [ ] Production deployed from the final commit; `curl $APP/api/status` shows `mode: live`, `live: true`.
- [ ] `pnpm smoke:live -- --url $APP --route` passes (3 units).
- [ ] `pnpm check:secrets` clean on the production build; `docs/API.md` is up to date (`pnpm api:docs` shows no diff).
- [ ] Balance checked in the metrics and comfortably above `UNIT_FLOOR` + the reserve you want for judges.
- [ ] Share links tested on the production URL, or `CAP_SHARES` left off on purpose.
- [ ] Open the site in a clean browser (private window, phone): sample person works with no upload, live upload works, offline plan opens.
- [ ] `ADMIN_TOKEN` and `CRON_SECRET` are stored somewhere only you can read them.
