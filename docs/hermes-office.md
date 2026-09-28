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
