# QuantDeus Vercel Swarm Dispatcher

Dedicated Vercel runtime for QuantDeus Issue #154.

## Canonical manifesto

Active charter: **Манифест Неонового Горизонта — QuantDeus v3.0**  
Canonical archive: `Dropbox /quantdeus/QuantDeus_Manifest_Neon_Horizon_v3.0.pdf`  
Machine ID: `neon-horizon-v3`

The dispatcher must read GitHub as source of truth and inherit the manifesto through the canonical doctrine and agent registries.

## Project root

When importing `quantdeus/quantdeus.github.io` into Vercel, set:

`Root Directory = vercel-dispatcher`

Suggested Vercel project name:

`quantdeus`

## Endpoint

`GET/POST /api/quantdeus/hourly`

The endpoint is fail-closed and requires:

`Authorization: Bearer $CRON_SECRET`

## Required environment variables

- `CRON_SECRET` — required.
- `QUANTDEUS_GITHUB_TOKEN` — optional for public read bootstrap; required later for approved authenticated GitHub REST fallback.

## Current bootstrap behavior

The endpoint:
1. verifies the cron secret;
2. reads the canonical QuantDeus repository;
3. reads open Issues and PRs;
4. returns the current actionable queue;
5. reports `pending_mcp_execution_adapter` rather than pretending execution is complete.

## Hourly scheduling

Preferred when the Vercel plan supports hourly Cron:

```json
{
  "crons": [
    {
      "path": "/api/quantdeus/hourly",
      "schedule": "0 * * * *"
    }
  ]
}
```

If the active Vercel plan cannot provide the requested hourly cadence, keep the endpoint deployable and mark hourly scheduling blocked until the runtime supports it. Telegram transport remains independent in GitHub Actions.

## Telegram boundary\n\nTelegram transport is owned by the GitHub Actions bot and direct Telegram Bot API. The Vercel dispatcher does not need a separate messaging bridge.\n
## Browser execution queue

`POST /api/quantdeus/browser` queues a governance-approved Browser Homunculus task as a GitHub Issue. The actual Chrome session runs in GitHub Actions through `vercel-labs/agent-browser`; GitHub remains the source of truth.

Authentication uses `BROWSER_DISPATCH_SECRET`, falling back to `CRON_SECRET` when a dedicated browser secret is not configured.

Additional optional environment variables:

- `BROWSER_DISPATCH_SECRET` — dedicated bearer secret for the browser queue endpoint.
- `QUANTDEUS_GITHUB_TOKEN` — must be able to create Issues for browser queueing.

Browser credentials are **not** sent through Vercel. Put them in GitHub Actions Secrets (`QD_BROWSER_EMAIL`, `QD_BROWSER_USERNAME`, `QD_BROWSER_PASSWORD`, etc.) and reference only the secret slot name in the task manifest.

See `docs/browser-homunculus.md`.
