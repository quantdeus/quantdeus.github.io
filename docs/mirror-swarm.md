# QuantDeus Mirror Swarm Repair Plane

The Mirror Swarm is an independent Vercel AI SDK repair plane for the primary QuantDeus/OpenClaw swarm.

## Why it exists

The canonical QA Self-Heal lane uses OpenClaw. If OpenClaw itself, its tool loop, or its provider path is degraded, that repair lane can share the same failure domain.

Mirror Swarm intentionally uses a separate execution path:

```
GitHub Actions schedule (:37 every hour)
  -> deterministic local QA + recent main Actions failures
  -> sleep when healthy
  -> GitHub OIDC
  -> Vercel POST /api/quantdeus/mirror
  -> Mirror Sherlock
  -> Mirror Tuvok
  -> Mirror Tasksmith
  -> Mirror QA
  -> draft repair PR OR repair Issue
  -> normal QuantDeus QA / review / merge policy
```

GitHub remains the source of truth and owns the wake schedule. Vercel owns the independent AI mirror execution plane.

## Wake-up rule

The workflow `.github/workflows/mirror-swarm-repair.yml` runs at:

```cron
37 * * * *
```

The :37 offset keeps the mirror away from the primary hourly swarm's :00 slot and reduces runtime contention.

Each scheduled pulse first runs deterministic validators and scans recent `main` Actions failures. The Vercel AI mirror stays asleep when:
- syntax validator is green;
- contract validator is green;
- OpenClaw office validator is green; and
- there are no repair-worthy `main` Actions failures from the last three hours.

When the pulse detects a repair-worthy condition, the Action obtains a GitHub OIDC token for audience `quantdeus-vercel-mirror` and calls `POST /api/quantdeus/mirror` on Vercel.

A manual `workflow_dispatch` always wakes the mirror for an explicit test, even when the deterministic pulse is green.

This Actions -> Vercel design is intentional for the current Hobby deployment:
- it does not require hourly Vercel Cron support;
- it keeps the deployment at the 12 Serverless Function limit;
- it still executes the independent mirror brain on Vercel.

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
Mirror endpoint: `POST /api/quantdeus/mirror`  
GitHub workflow: `.github/workflows/mirror-swarm-repair.yml`  
OIDC audience: `quantdeus-vercel-mirror`

The scheduled Action supplies its ephemeral GitHub token to the Vercel mirror only for the bounded repair operation. The repository does not store that token.

Optional Vercel environment variable:
- `QD_MIRROR_MODEL` — overrides the Vercel AI Gateway model used by the mirror.

## Failure-domain rule

Mirror Swarm must stay operationally separate from OpenClaw. Do not change the mirror into a thin wrapper around `/api/quantdeus/openclaw`; that would recreate the same single point of failure it is designed to cover.
