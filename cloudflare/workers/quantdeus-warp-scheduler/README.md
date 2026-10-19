# QuantDeus Warp Scheduler — Gemma 4

This directory is the version-controlled source for the Cloudflare Worker currently named `quantdeus-warp-scheduler`.

## Runtime contract

- Primary model: `@cf/google/gemma-4-26b-a4b-it`
- Fallback model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- Trigger: `*/10 * * * *` (every 10 minutes)
- Daily AI inference-attempt cap: 100 (primary and fallback attempts are counted separately)
- Bindings: `AI` (Workers AI) and `DB` (existing D1 database)
- GitHub remains the source of truth for task definitions; generated plans remain drafts requiring scientific review.

The scheduler tries Gemma 4 first. If that inference call throws, it tries Llama 3.3 and records the model actually used in `warp_reports.model` and the successful tick log. Each inference attempt consumes one daily quota unit, including fallback. If the quota is exhausted after a failed Gemma attempt, the scheduler skips the fallback rather than exceeding the cap.

## Deployment and verification

Do not paste API tokens into the repository, Issues, PRs, or chat. Use the authorized Cloudflare deployment identity and the existing account.

Before deploying:
1. Confirm the account's Workers AI binding can run the Gemma model with a small Russian prompt.
2. Confirm the target Worker still has the `AI` and `DB` bindings.
3. Confirm the cron remains `*/10 * * * *` and the daily inference-attempt cap remains 100.
4. Run static syntax validation on `worker.mjs`.

After deploying:
1. Read the Worker settings and verify both bindings remain present.
2. Verify the schedule is still `*/10 * * * *`.
3. Inspect the next scheduler tick and D1 `warp_reports.model`; it should show Gemma 4 when the primary call succeeds, or Llama 3.3 when fallback was used.
4. Confirm a generated report is labelled as a draft and remains in `needs_human_review` unless the existing QA rules explicitly classify it otherwise.
5. If inference or QA fails, inspect the logged event and restore the previous Worker version rather than silently changing quotas or disabling review.

## Current deployment status

This PR adds the canonical source and operating checklist. It does **not** itself deploy code to Cloudflare. The live Worker must be updated through the authorized deployment path and then verified against the checklist above.
