# QuantDeus Hermes AI Office

QuantDeus can run every canonical homunculus as an isolated **Hermes Agent profile** while keeping GitHub as the source of truth.

## Architecture

```text
Human CEO
   ↓
Seven of Nine — Hermes orchestrator profile
   ↓
Hermes Kanban board: quantdeus
   ↓
26 isolated Hermes profiles (one per coordination/agents.json id)
   ↓
QA profiles → evidence / repair
   ↓
GitHub Issues / PRs / commits remain canonical
```

Hermes is the execution/coordination runtime, not a replacement for the QuantDeus registry.

## Why this maps well

- **Profiles** give every agent isolated config, memory, sessions and SOUL instructions.
- **Kanban** is the shared durable multi-agent office board.
- **Seven of Nine** owns dispatch/orchestration.
- **Profile descriptions** let Hermes route decomposed work to the right specialist.
- **Dashboard** gives the human-visible office UI with lanes by profile.
- **Vercel Sandbox** is the preferred isolated terminal backend.
- No worker model is pinned in the repository; provider and model must be supplied explicitly at runtime.

## Runtime prerequisites

Install a current Hermes Agent release on a persistent host, then provide secrets only in the runtime environment.

Default path:

```bash
export OLLAMA_API_KEY=...
export VERCEL_TOKEN=...
export VERCEL_PROJECT_ID=...
export VERCEL_TEAM_ID=...
node scripts/hermes-office-bootstrap.js
```

Alternative OpenRouter runtime:

```bash
export HERMES_MODEL_PROVIDER=openrouter
export HERMES_MODEL=openrouter/free
export OPENROUTER_API_KEY=...
node scripts/hermes-office-bootstrap.js
```

For local testing without Vercel Sandbox:

```bash
export HERMES_TERMINAL_BACKEND=docker
export OLLAMA_API_KEY=...
node scripts/hermes-office-bootstrap.js
```

No API key, token or Hermes state belongs in Git.

## Start the office

```bash
hermes -p seven-of-nine gateway start
hermes -p seven-of-nine dashboard
```

The dashboard exposes the Kanban view. Seven's gateway owns the dispatcher; workers are spawned from the 26 named profiles as cards become ready.

Useful commands:

```bash
hermes kanban --board quantdeus list
hermes kanban --board quantdeus stats
hermes kanban --board quantdeus create "Audit the current site agent mutation path" --assignee qa-contract
```

## GitHub boundary

Hermes memory and Kanban state are operational runtime state. They do **not** override GitHub.

A result counts as a repository mutation only when an observable GitHub Issue, PR, commit, review or Actions artifact exists. This prevents the failure mode where an LLM says “Issue created” without a real API mutation.

## Telegram boundary

Do not run a second Hermes Telegram gateway against the existing QuantDeus bot token. One Telegram bot token must have one active gateway owner. The existing GitHub Actions / Telegram path can remain the transport layer while Hermes is introduced as the office runtime.

## Validation

```bash
node scripts/qa/hermes-office-validator.js
node --check scripts/hermes-office-bootstrap.js
```


## Connected chat + Evolution

The repository includes `scripts/hermes-office-client.js`. When GitHub Actions receives `HERMES_API_URL` and `HERMES_API_KEY`, ordinary Command Center and Telegram agent turns are sent to the actual named Hermes profile. If the remote office is unavailable, the existing repo-grounded path remains the fallback.

The Hermes host exposes its authenticated OpenAI-compatible API. The bridge calls:

`/p/<profile>/v1/chat/completions`

The host should be reachable over protected HTTPS. Every profile keeps isolated Hermes state; Seven remains the office orchestrator and can delegate persistent work through Kanban.

### GitHub MCP

Bootstrap adds the official `github/github-mcp-server` to every profile when `GITHUB_PERSONAL_ACCESS_TOKEN` exists. The token value is not committed; the Docker MCP process inherits it from the Hermes host environment. The default contract requests the full GitHub MCP toolset, while the credential scopes remain the actual authority boundary.

### Playwright

Bootstrap adds Microsoft's `@playwright/mcp@latest` to every profile. Use it for deterministic accessibility-tree browser interaction, testing and legitimate project-service account setup.

### Evolution

Each legacy Hermes profile keeps skills, browser, code execution, delegation and connection management. Unattended Hermes cron creation is disabled; scheduled autonomous QuantDeus execution belongs to native OpenClaw Gateway automations. Agent-created skills are security-scanned, writes remain autonomous, and the mutation ledger remains available for manual legacy sessions.

Project-local skills:
- `quantdeus-autonomy`
- `quantdeus-playwright-ops`
- `quantdeus-connections-evolution`

Full policy: `coordination/hermes-evolution.json`.


## Canonical cloud host: Vercel Sandbox

The production office no longer requires a separately managed Hermes server or Replit/VPS. The canonical route is:

`GitHub Command Center / Telegram → GitHub Actions OIDC → quantdeus.vercel.app/api/quantdeus/hermes → persistent Vercel Sandbox quantdeus-hermes-office → named Hermes profile → GitHub MCP / Playwright / skills / cron`.

The Sandbox is a persistent cloud PC. Its filesystem is snapshotted when the session stops, so Hermes profile memory, skills, Kanban state and configuration survive between chat turns. Processes do not need to stay alive: every request resumes the sandbox, refreshes the repository, runs a one-shot `hermes -p <profile> -z ...`, then stops/snapshots the VM.

Inference is fail-closed: no repository-default model or anonymous provider route is permitted.

Hermes profiles only add an OpenRouter fallback when an explicit runtime credential is present; no unhealthy or unverified provider is inserted automatically.

The request-scoped Hermes/Office Sandboxes still stop and resume, so they do not own recurring cadence. Automatic Hermes fleet scheduling is retired and the obsolete `.github/workflows/hermes-office-cron.yml` workflow remains removed. QuantDeus now runs a separate persistent named Sandbox, `quantdeus-openclaw-scheduler`, whose loopback OpenClaw Gateway owns recurring work through native SQLite-backed automations. Because Vercel Hobby caps one continuous Sandbox session at 45 minutes, `.github/workflows/openclaw-native-watchdog.yml` is a liveness/auth relay only: it resumes/rotates that scheduler session and drains its allowlisted dispatch spool with a short-lived Actions token. The executor workflows themselves are `workflow_dispatch`/event-driven and no longer own recurring GitHub cron schedules.

GitHub access is also short-lived. The calling GitHub Actions run passes its repository-scoped `GITHUB_TOKEN` to the Sandbox only for that Hermes turn, and the official remote GitHub MCP reads it from `MCP_GITHUB_API_KEY`. No long-lived GitHub token is written into the repository or persistent Hermes configuration.

The direct `HERMES_API_URL/HERMES_API_KEY` mode remains an optional override for private deployments, but it is not required by QuantDeus production.
