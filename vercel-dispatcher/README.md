# QuantDeus Vercel Swarm Dispatcher

Dedicated Vercel runtime for QuantDeus Issue #154.

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
- `QUANTDEUS_GITHUB_TOKEN` — optional for public read bootstrap; required later for approved authenticated GitHub REST fallback. Do not route GitHub writes through Zapier.

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

On Vercel Hobby, native Cron cannot run hourly. Do not bypass the repository's daily GitHub cron policy just to emulate an hourly Vercel schedule. Keep the endpoint deployable and mark hourly scheduling blocked until the Vercel plan/runtime supports the requested cadence or an explicitly approved scheduler is chosen.

## Hard boundary

Zapier MCP remains Telegram-only. Never use Zapier to write GitHub state or as a GitHub fallback.
