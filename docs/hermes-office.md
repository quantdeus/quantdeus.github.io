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
- Default worker model is **GPT-OSS 120B** via Ollama Cloud; override provider/model at runtime without changing the registry.

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
export HERMES_MODEL=openai/gpt-oss-120b
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

Each legacy Hermes profile keeps skills, browser, code execution, delegation and connection management. Unattended Hermes cron creation is disabled; scheduled autonomous QuantDeus execution belongs to the OpenClaw workflow lane. Agent-created skills are security-scanned, writes remain autonomous, and the mutation ledger remains available for manual legacy sessions.

Project-local skills:
- `quantdeus-autonomy`
- `quantdeus-playwright-ops`
- `quantdeus-connections-evolution`

Full policy: `coordination/hermes-evolution.json`.


## Canonical cloud host: Vercel Sandbox

The production office no longer requires a separately managed Hermes server or Replit/VPS. The canonical route is:

`GitHub Command Center / Telegram → GitHub Actions OIDC → quantdeus.vercel.app/api/quantdeus/hermes → persistent Vercel Sandbox quantdeus-hermes-office → named Hermes profile → GitHub MCP / Playwright / skills / cron`.

The Sandbox is a persistent cloud PC. Its filesystem is snapshotted when the session stops, so Hermes profile memory, skills, Kanban state and configuration survive between chat turns. Processes do not need to stay alive: every request resumes the sandbox, refreshes the repository, runs a one-shot `hermes -p <profile> -z ...`, then stops/snapshots the VM.

Inference is keyless inside Vercel: the function passes its short-lived Vercel OIDC token to Hermes as the Vercel AI Gateway credential. The default model is `openai/gpt-oss-120b`.

Hermes profiles now configure the native `fallback_providers` chain: Vercel AI Gateway models first (`AI_GATEWAY_MODEL`, default `openai/gpt-5-mini`, then `openai/gpt-oss-120b`; override with `HERMES_VERCEL_FALLBACK_MODELS`, maximum three), then OpenRouter/GPT-OSS when an OpenRouter key is supplied for the turn. The route passes the short-lived Vercel project OIDC token as `AI_GATEWAY_API_KEY` only to the running Sandbox command; it is never written to profile config. Native Hermes failover keeps the active conversation and its tools/MCP. If the Hermes run still returns no answer, the endpoint retains the separate text-only Vercel AI Gateway fallback, which cannot claim external actions; the response records its successful model and `vercel-ai-gateway-fallback` execution mode.

Vercel Sandbox is stopped after each request, so its in-process scheduler cannot stay alive. Automatic Hermes fleet scheduling is retired. `.github/workflows/hermes-office-cron.yml` is retained only as a manual legacy fallback (`workflow_dispatch`) and the Vercel Hermes `cron_tick` route rejects scheduled events. The active unattended execution lane is `.github/workflows/quantdeus-hourly-openclaw.yml` → the authenticated Vercel OpenClaw Office. Native OpenClaw automations require a running OpenClaw Gateway and are not emulated through the legacy Hermes pulse.

GitHub access is also short-lived. The calling GitHub Actions run passes its repository-scoped `GITHUB_TOKEN` to the Sandbox only for that Hermes turn, and the official remote GitHub MCP reads it from `MCP_GITHUB_API_KEY`. No long-lived GitHub token is written into the repository or persistent Hermes configuration.

The direct `HERMES_API_URL/HERMES_API_KEY` mode remains an optional override for private deployments, but it is not required by QuantDeus production.
