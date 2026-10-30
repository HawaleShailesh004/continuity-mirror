# 0004. Job ids are capability tokens

**Status:** accepted (B3)

**Context.** A person can lose their session cookie (cleared data, a private window, a second device) while a job is running, and results are only fetchable for about two hours.

**Decision.** `GET /api/jobs/:id` and `/result` do not check the session. A job id is 96 bits of randomness and is only ever given to the person who created the job. The receipt, deletes and budgets stay per session.

**Consequences.** A person can resume after losing their cookie. Anyone who learns a job id can fetch that one result for its remaining lifetime; ids are not guessable or listed anywhere. If this proves too loose, bind result fetches to the session and accept that cookie loss orphans jobs.
