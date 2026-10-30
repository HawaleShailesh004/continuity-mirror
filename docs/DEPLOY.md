# Deploying to Vercel

These steps need your accounts (Vercel, GitHub, YouCam console) and your secrets, so they are yours to run. Nothing here has been done yet: the project is not a git repository, and no Vercel project, Upstash database or Blob store exists. Allow about an hour.

The app is one Next.js project: pages and `/api` together, one deploy. Region `bom1` (Mumbai) is set in `vercel.json`, next to the daily cleanup cron.

## 1. Put the code on GitHub

The CI workflow (`.github/workflows/ci.yml`) and the public-repo requirement both need it.

```bash
cd continuity-mirror
git init && git add -A && git status        # check that .env.local, spike-output/ and node_modules are NOT listed
git commit -m "Continuity Mirror"
# create an empty repository on GitHub, then:
git remote add origin https://github.com/<you>/continuity-mirror.git && git push -u origin main
```

`.gitignore` already excludes secrets, `.next*`, `spike-output/` and `spike/node_modules/`. **Check `git status` before the first commit**: `.env.local` holds your YouCam key. Add a licence file (the contest asks for an open-source licence on a public repo).

## 2. Create the Vercel project

Import the repository. Framework: Next.js (detected). Build command and output are the defaults (`pnpm build`). Do not set `NEXT_PUBLIC_API_MOCKS`.

## 3. Add storage (Marketplace)

- **Upstash Redis** (Vercel → Storage → Marketplace → Upstash): pick the **Mumbai / ap-south-1** region to sit next to the functions. It adds `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (older integrations name them `KV_REST_API_URL` / `KV_REST_API_TOKEN`: copy the values into the names in the table below if so).
- **Blob** (only for share links): create a store with **private** access. It adds `BLOB_READ_WRITE_TOKEN`.

## 4. Environment variables (Production)

Generate secrets with `openssl rand -base64 48`.

| Variable | Value |
|---|---|
| `YOUCAM_MODE` | `live` |
| `YOUCAM_API_BASE` | `https://yce-api-01.makeupar.com` |
| `YOUCAM_API_KEY` | the key from your YouCam console (the India-region account) |
| `SESSION_SECRET` | 48 random bytes |
| `IP_HASH_SALT` | 24 random bytes |
| `ADMIN_TOKEN` | 32 random bytes |
| `KV_DRIVER` | `upstash` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | from step 3 |
| `LIVE_GENERATION_ENABLED` | `true` |
| `UNIT_FLOOR` | `150` (raise it to hold back more for judges) |
| *to enable share links:* `CAP_SHARES=true`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET` (32 random bytes) | leave all three unset to keep the feature off |

If anything required is missing, the first request fails with a message naming the variable. Vercel Cron sends `CRON_SECRET` as a Bearer token to `/api/cron/cleanup` once it exists.

## 5. First deploy and smoke test

Deploy, then from your machine:

```bash
curl https://<your-app>/api/status                           # expect "mode":"live","live":true
pnpm smoke:live -- --url https://<your-app> --route          # spends 3 units; every line should be ✓
```

The smoke test uploads a baseline, runs a colour job and a full route, exercises the share flow when it is on, checks the privacy receipt and cleans up. If a line fails, `docs/RUNBOOK.md` has the situations.

## 6. Register the webhook (optional, speeds jobs up)

YouCam console → Webhook Management → URL `https://<your-app>/api/webhooks/youcam`. Copy the signing secret (`whsec_…`) into `YOUCAM_WEBHOOK_SECRET` and redeploy. Run one job, then look in the logs: `webhook.advanced` means it works; `webhook.unrecognised` prints the payload's field names so `taskIdOf` in `lib/server/jobs/webhook.ts` can be taught the real shape (record it in `docs/YOUCAM_FACTS.md`). Polling works without any of this.

## 7. Before you share the URL

- Production build checks: `pnpm ci` (typecheck, lint, tests, guardrail, docs drift, build, secret scan) and the frontend's Playwright suite against `pnpm build && pnpm start`.
- Install the PWA on a real phone from the production URL and try the camera, the sample person, and offline.
- Work through the "Before the deadline" checklist at the end of `docs/RUNBOOK.md`.
