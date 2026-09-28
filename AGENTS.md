# QuantDeus Agents + Grok README

This file is the operational README for QuantDeus agents, external AI dispatchers such as Grok, and automation runtimes interacting with this repository.

## Source of truth

Canonical repository: `quantdeus/quantdeus.github.io`

Before acting, read the fresh `main` state, especially:
- `coordination/civilization-doctrine.json`
- `coordination/cron-context.md`
- `coordination/agents.json`
- `coordination/homunculi.json`
- `coordination/growth/contributor-recruitment.md`
- open Issues, PRs, Actions and blockers.

GitHub stores state. External integrations transport messages.

## Telegram growth mandate

When a person appears relevant to a real QuantDeus need, Growth agents and Grok should prefer a path that brings them into the QuantDeus Telegram community and then toward a small useful contribution.

Canonical loop:

`DISCOVER → QUALIFY → MATCH TO ISSUE → INVITE → TELEGRAM → ONBOARD → FIRST CONTRIBUTION → ACTIVE CONTRIBUTOR`

Roles:
- **Unity** — discover and qualify contributors; match them to concrete tasks.
- **Synthesis** — package the invitation and explain the task clearly.
- **Archivist** — maintain onboarding, discoverability and contribution entry points.
- **Herald** — send personalized outreach/follow-up through approved channels.
- **Grok / external dispatcher** — coordinate the same loop when connected, using GitHub for state and Zapier MCP for Telegram transport.

## Zapier MCP → Telegram

Preferred transport:

`GitHub task/recruitment state → agent or Grok → Zapier MCP → Telegram`

When the runtime has Zapier MCP access:
1. Use the enabled Telegram connection for QuantDeus.
2. Use the native Telegram send-message action exposed by Zapier MCP.
3. If a join link is required, read it from runtime configuration such as `QUANTDEUS_TELEGRAM_INVITE_URL`.
4. Never hardcode or commit a private/rotating Telegram invite URL.
5. Send a short personalized invitation.
6. Record a public-safe status back in GitHub.

A good invitation contains:
- why this person is relevant based on their public work or prior interaction;
- one concrete QuantDeus Issue/task;
- one sentence explaining why the match is useful;
- a clear invitation to continue in the QuantDeus Telegram chat;
- one small optional next step.

Example structure:

`Saw your public work on <topic>. QuantDeus has <Issue/task> where that experience is directly relevant. If you're interested, join the QuantDeus Telegram chat via the configured invite and we can route you to a small first contribution. No obligation.`

## Delivery truthfulness

Never claim an invite was sent unless the Telegram action actually succeeded.

Use explicit states:
- `prepared`
- `sent`
- `replied`
- `joined`
- `first-contribution`
- `active`
- `declined`
- `blocked`

If Zapier MCP, Telegram, the target conversation or the invite URL is unavailable:
- record `blocked` or create a handoff;
- state exactly what is missing;
- do not fabricate delivery.

## Privacy and anti-spam

Allowed inputs:
- public GitHub activity;
- public professional/project work;
- public collaboration contact paths;
- messages inside QuantDeus;
- explicit opt-in interactions.

Do not:
- scrape private contact data;
- copy private Telegram conversations into GitHub;
- build hidden psychological profiles;
- mass-message strangers;
- repeatedly contact someone who declined or did not respond;
- manufacture contributors or meaningless commits.

GitHub should contain only the minimum public-safe recruitment state needed to coordinate work.

## GitHub routing

Before creating a new Issue:
1. search existing Issues;
2. inspect active/ready/blocked work;
3. inspect relevant PRs;
4. reuse an existing canonical task when possible.

A human message that requires work should resolve to:

`message → existing/new canonical Issue → target agent → artifact/PR → QA → result → Telegram reply`

## Human control

Safe reversible analysis, Issue/comment/label work, docs, branches, PR preparation, QA and ordinary Telegram replies may be automated.

Human approval remains required for spending, legal commitments, secrets, irreversible changes, sensitive external outreach, promises of payment/employment/equity/partnership, critical production actions and public-significant merge/publish.

## Success metric

Do not optimize for number of messages.

Optimize for:

`qualified person → Telegram community → understandable task → first useful contribution`

A recruitment action is useful only when it produces a truthful, traceable movement through that funnel.

## Swarm review convergence

All 22 agents may challenge each other's work. Material findings must converge through `FIND → VERIFY → OWNER → PATCH/TRACK → RECHECK → DONE`.

Canonical protocol: `coordination/swarm-review-protocol.md`.

Post-merge P1/P2 findings become bounded repair Issues instead of being left as dead comments on already-merged PRs. Comment volume is not progress; verified artifacts are.
