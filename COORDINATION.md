# 🧭 QuantDeus Coordination Protocol

## Execution-first mode

QuantDeus now coordinates the six public pillars through **executable GitHub tasks**, not periodic six-pillar news-report Issues.

The canonical queue is `🧭 QuantDeus Six-Pillar Execution Board`. Each pillar points to one concrete task with an observable artifact and acceptance checklist. Tasks marked `exec:connector` are intended for the GitHub connector / Control Tower to execute through file changes, issue operations, tests, reviews, or other verifiable repository actions.

The old Pulse headline reports are legacy history. The replacement workflow does **not** create a new report Issue every scheduled run. It maintains the task queue and refreshes the coordination hub only when state changes.

Production publication, spending, secrets, irreversible actions and sensitive outreach still require explicit human approval.

QuantDeus Coordinator turns **governance-approved** GitHub Issues into an opt-in human coordination layer. The governance gate runs before the Coordinator.

## Governance: proposal before task

Only QuantDeus chat **owner/admin** may directly put work into the real agent queue.

Participants use the community path:

1. `/propose <agent> <idea>` in QuantDeus Store bot creates a `[PROPOSAL]` Issue.
2. Participants vote `yes/no` in Telegram (the website exposes the same vote buttons).
3. Telegram user IDs are not written to GitHub; votes use pseudonymous HMAC voter markers.
4. When the configured quorum is reached and YES > NO, a chat admin may run `/promote #N`.
5. Promotion marks the proposal `governance:passed`; only then may it become `coord:task`.

Direct admin work uses `/task <agent> <task>`.

A manually opened `[TASK]` Issue from a non-admin is **not** accepted as executable work. `scripts/governance-gate.js` converts it to `[PROPOSAL]`, strips task-state labels, and routes it through voting.

The target is one of the real agents registered in `coordination/agents.json` (Coordinator, Six-Pillar Executor, Strategic Hub, Orchestrator, six pillar agents, or Control Tower).

## Contributor commands

Post one of these commands as an Issue comment:

- `/take` — claim a free task.
- `/release` — release a task you own.
- `/block reason` — mark your task blocked and request human help.
- `/ready` — return your task to the ready queue.
- `/done` — mark your task complete and close the Issue.

The bot stores the claimant in a hidden metadata marker in the Issue body. It does not assign work to a person unless that person explicitly uses `/take`.

## Hourly coordination

The coordinator runs every hour and also reacts to Issue and Issue-comment events. It maintains `🧭 QuantDeus Coordination Hub` with counts and a live task table.

Active tasks older than 72 hours are marked `coord:stale` and `coord:human` so stalled work becomes visible.

## External channels

External notifications are opt-in. Configure any of these repository Actions secrets:

- `QUANTDEUS_DISCORD_WEBHOOK`
- `QUANTDEUS_SLACK_WEBHOOK`
- `QUANTDEUS_GENERIC_WEBHOOK`
- `QUANTDEUS_TELEGRAM_BOT_TOKEN` together with `QUANTDEUS_TELEGRAM_CHAT_ID`

When configured, the coordinator sends a compact digest only when the task-state digest changes. If no external secret is configured, no message leaves GitHub.

## Agent-to-human workflow

Trusted QuantDeus repository agents may create `[TASK]` Issues when they detect work that needs a person: source verification, expert review, translation, experiment reproduction, outreach preparation, or implementation. Community-originated work enters as `[PROPOSAL]` first. Humans claim those tasks voluntarily with `/take`. The Coordinator tracks ownership, blockage and completion and exposes the whole queue through the Coordination Hub.
