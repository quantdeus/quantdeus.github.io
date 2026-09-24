# QuantDeus real-agent chat + governance

Route: `https://quantdeus.github.io/homunculi/`

This surface is a chat/governance twin for the **real QuantDeus agents** registered in `coordination/agents.json`.

## Real agents

The UI mirrors the actual repository workers and their source files:

- QuantDeus Coordinator → `scripts/coordinator.js`
- Six-Pillar Executor → `scripts/pillar-executor.js`
- Strategic Navigation Hub → `scripts/strategic-hub.js`
- Research Orchestrator → `scripts/orchestrator.js`
- Energy / Justice / Unity / Space / Potential / Synthesis agents → `scripts/pillar_01...06_*.js`
- Control Tower / GitHub Connector → `COORDINATION.md`

`/agent <id> <question>` is advisory chat and does **not** mutate the execution queue.

## Governance

Direct task control is restricted to Telegram `owner/admin`:

- `/task <agent> <task>` — admin-only direct task.
- `/promote #N` — admin-only promotion after a successful vote.

Participants use:

- `/propose <agent> <idea>` — creates a `[PROPOSAL]` GitHub Issue.
- `/vote #N yes|no` — records a pseudonymous Telegram vote.
- website 👍/👎 buttons — deep-link to the same Telegram vote.

Default promotion gate is at least **3 total votes** with **YES > NO**; deployment may override it through `PROPOSAL_MIN_VOTES`.

Raw Telegram user IDs are not committed to GitHub. A secret HMAC key derives a stable pseudonymous voter marker so one participant can update their vote without exposing the ID.

## GitHub enforcement

`scripts/governance-gate.js` runs before the existing Coordinator and execution-board refresh.

A non-admin cannot bypass Telegram by manually opening `[TASK]`: the gate converts it to `[PROPOSAL]` and removes `coord:task` / task-state labels.

A promoted proposal receives `governance:passed`; only then does the normal Coordinator admit it into the real `coord:task` queue.

## Identity

Inside Telegram, the web twin reads Telegram Mini App user context. In a normal browser it uses Telegram OIDC when `telegram-public.json` is configured and `https://quantdeus.github.io` is allowed in BotFather.

Privileged actions are never authorized from browser UI state alone; admin mutation commands are enforced in the Telegram backend.

## Conversation storage

The chat mirror continues to use the existing Utterances/GitHub Issue rooms (#112–#115). Governance proposals are separate GitHub Issues and are visible in the web twin.
