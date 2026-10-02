# QuantDeus Mirror Swarm Repair Plane

The Mirror Swarm is an independent Vercel AI SDK repair plane for the primary QuantDeus/OpenClaw swarm.

## Why it exists

The canonical QA Self-Heal lane uses OpenClaw. If OpenClaw itself, its tool loop, or its provider path is degraded, that repair lane can share the same failure domain.

Mirror Swarm intentionally uses a separate execution path:

```
Vercel Cron (:37 every hour)
  -> protected /api/quantdeus/mirror-wake
  -> GitHub workflow_dispatch
  -> deterministic local QA + recent main Actions failures
  -> sleep when healthy
  -> GitHub OIDC
  -> Vercel /api/quantdeus/mirror
  -> Mirror Sherlock
  -> Mirror Tuvok
  -> Mirror Tasksmith
  -> Mirror QA
  -> draft repair PR OR repair Issue
  -> normal QuantDeus QA / review / merge policy
```

GitHub remains the source of truth. Vercel owns the mirror wake-up schedule.

## Wake-up rule

The Vercel project `quantdeus` schedules:

```cron
37 * * * *
```

Vercel calls `GET /api/quantdeus/mirror-wake`. The endpoint is fail-closed behind the existing `CRON_SECRET`, uses the server-side `QUANTDEUS_GITHUB_TOKEN`, and dispatches `.github/workflows/mirror-swarm-repair.yml` on `main`.

The wake endpoint refuses to start a second mirror cycle while one is already queued or running.

The GitHub workflow then runs deterministic validators and scans recent `main` Actions failures. For a normal `vercel-cron` pulse, the model plane stays asleep when:
- syntax validator is green;
- contract validator is green;
- OpenClaw office validator is green; and
- there are no repair-worthy main Actions failures from the last three hours.

A manual `workflow_dispatch` still wakes the mirror for an explicit test, even when the deterministic pulse is green.

The :37 offset keeps the mirror away from the primary hourly swarm's :00 slot and reduces runtime contention.

## Modes

### shadow

Diagnose and return a finding. Do not mutate GitHub.

### repair

The mirror may create exactly one bounded artifact:
- a **draft PR** when a small low/medium-risk code repair is independently approved; or
- a **repair Issue** when evidence is insufficient, the safe patch surface is unavailable, or the change belongs to a protected area.

The mirror never merges its own PR.

## Independent roles

- **Mirror Sherlock** — root-cause diagnosis and suspect-file selection.
- **Mirror Tuvok** — adversarial challenge, transient-failure filtering and safety review.
- **Mirror Tasksmith** — minimum full-file replacement for at most two existing files.
- **Mirror QA** — independent patch review before any draft PR is created.

This mirror is an auxiliary repair plane, not four new canonical QuantDeus employees. The canonical registry remains 26 agents.

## Hard guardrails

Mirror-created repairs:
- never write directly to `main`;
- never auto-merge;
- modify at most two existing files;
- do not add dependencies;
- do not edit secrets, credentials or billing;
- do not edit doctrine, manifesto, canonical agent/homunculus registries or `AGENTS.md`;
- do not edit QA validators to make failures disappear;
- do not edit GitHub OIDC, OpenClaw trusted/auth gates, Telegram auth, or the mirror's own workflow/endpoint;
- do not claim a repair until GitHub contains the resulting draft PR/Issue;
- still require the normal primary QA/Static Smoke/review path before merge.

## Runtime

Vercel project: `quantdeus`  
Wake endpoint: `GET /api/quantdeus/mirror-wake`  
Mirror endpoint: `POST /api/quantdeus/mirror`  
GitHub workflow: `.github/workflows/mirror-swarm-repair.yml`  
OIDC audience: `quantdeus-vercel-mirror`

Existing required runtime variables:
- `CRON_SECRET` — authenticates the Vercel Cron wake request.
- `QUANTDEUS_GITHUB_TOKEN` — dispatches the mirror GitHub workflow from the protected Vercel endpoint.

Optional environment variable:
- `QD_MIRROR_MODEL` — overrides the Vercel AI Gateway model used by the mirror. No model secret is stored in the repository.

## Failure-domain rule

Mirror Swarm must stay operationally separate from OpenClaw. Do not change the mirror into a thin wrapper around `/api/quantdeus/openclaw`; that would recreate the same single point of failure it is designed to cover.
