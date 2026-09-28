# QuantDeus Agents + Vercel Swarm Dispatcher README

This file is the operational README for QuantDeus agents, the Vercel Swarm Dispatcher, and automation runtimes interacting with this repository.

## Source of truth

Canonical repository: `quantdeus/quantdeus.github.io`

Before acting, read the fresh `main` state, especially:
- `coordination/civilization-doctrine.json`
- canonical manifesto: `Dropbox /quantdeus/QuantDeus_Manifest_Neon_Horizon_v3.0.pdf` (`neon-horizon-v3`)
- `coordination/cron-context.md`
- `coordination/agents.json`
- `coordination/homunculi.json`
- `coordination/growth/contributor-recruitment.md`
- open Issues, PRs, Actions and blockers.

GitHub stores state. External integrations transport messages.

All agents and Vercel runtimes inherit the active manifesto reference from the doctrine/registries. The v3 manifesto is the active constitutional document; v2 remains a historical archive and must not be treated as the current charter.

## Telegram growth mandate

When a person appears relevant to a real QuantDeus need, Growth agents and Vercel Swarm Dispatcher should prefer a path that brings them into the QuantDeus Telegram community and then toward a small useful contribution.

Canonical loop:

`DISCOVER → QUALIFY → MATCH TO ISSUE → INVITE → TELEGRAM → ONBOARD → FIRST CONTRIBUTION → ACTIVE CONTRIBUTOR`

Roles:
- **Unity** — discover and qualify contributors; match them to concrete tasks.
- **Synthesis** — package the invitation and explain the task clearly.
- **Archivist** — maintain onboarding, discoverability and contribution entry points.
- **Herald** — send personalized outreach/follow-up through approved channels.
- **GitHub Actions Telegram Bot / external dispatcher** — coordinate the same loop using GitHub for state and Telegram Bot API for transport.

## GitHub Actions → Telegram Bot API

Canonical transport:

`GitHub task/recruitment state → GitHub Actions Telegram Bot → Telegram Bot API → Telegram`

Runtime rules:
1. Read the bot token only from Actions secrets (`TELEGRAM_BOT_TOKEN`; legacy alias supported).
2. Never commit tokens, chat IDs that should remain private, or raw Telegram user IDs.
3. Use direct Bot API calls for replies and approved invitations.
4. Route incoming Telegram text to the canonical agent registry; explicit `/agent <id>` overrides automatic routing.
5. Record project work in GitHub Issues/PRs; Telegram remains the conversation surface.
6. If a join link is required, read it from runtime configuration such as `QUANTDEUS_TELEGRAM_INVITE_URL`.
7. Record only public-safe delivery state back in GitHub.

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

If GitHub Actions, Telegram Bot API, the target conversation or the invite URL is unavailable:
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

## Deputy coordinator

`seven-of-nine` is the Deputy AI Chief of Staff / Swarm Efficiency Officer. She runs immediately after Coordinator, scans GitHub work for blocked/stale WIP and review bottlenecks, and emits one deduplicated efficiency directive to the coordination hub. Her rule is **Borg efficiency, human agency**: optimize flow without bypassing QA, human approval, EXIT or voluntary participation.

## Swarm mediation and science officers

- `emh` — **Swarm Mediation & Diplomacy Officer**. Converts repeated disagreement into facts, shared interests, options, one owner and one testable next step. It does not diagnose people and cannot override human decisions.
- `sherlock` — **Science Officer / Scientific Investigation Lead**. Uses deduction, induction, abduction, anomaly detection, competing hypotheses and falsification. It must distinguish observed fact, inference, working hypothesis and speculation.
- `tuvok` — **Deputy Science Officer / Logic & Epistemic Integrity Officer**. Audits premises, contradictions, hidden assumptions and certainty language. Plausible is not verified.

Operational sequence in the coordinator cycle:

`Coordinator → Seven of Nine → EMH → Sherlock → Tuvok → Strategic Hub`

The research operations role remains with `orchestrator`; Sherlock and Tuvok improve scientific reasoning quality rather than replacing execution routing.

## Browser Homunculus

`Browser Homunculus` is a bounded web-execution worker owned by `control-tower`; it is not a 27th canonical registry agent.

Canonical route:

`Vercel dispatcher → approved GitHub Issue → Browser Homunculus Action → agent-browser/Chrome → Issue result`

Rules:
1. GitHub remains source of truth; Vercel queues tasks but does not invent completion.
2. Browser targets are restricted by an explicit allowed-domain list.
3. Credentials come only from GitHub Actions Secrets via approved secret slots; never place passwords/tokens in Issues.
4. Stop for CAPTCHA, anti-bot challenges, 2FA, passkeys, SMS/email verification, payments, purchases or irreversible commitments; create a human handoff instead of bypassing the gate.
5. Do not store screenshots after secret credentials are entered.
6. Natural-language browser control requires Vercel AI Gateway; deterministic structured steps work without an LLM.

Implementation: `scripts/browser-homunculus.js`, `.github/workflows/browser-homunculus.yml`, `vercel-dispatcher/api/quantdeus/browser.js`.

## Human control

Safe reversible analysis, Issue/comment/label work, docs, branches, PR preparation, QA and ordinary Telegram replies may be automated.

Human approval remains required for spending, legal commitments, secrets, irreversible changes, sensitive external outreach, promises of payment/employment/equity/partnership, critical production actions and public-significant merge/publish.

## Success metric

Do not optimize for number of messages.

Optimize for:

`qualified person → Telegram community → understandable task → first useful contribution`

A recruitment action is useful only when it produces a truthful, traceable movement through that funnel.

## Swarm review convergence

All 26 agents may challenge each other's work. Material findings must converge through `FIND → VERIFY → OWNER → PATCH/TRACK → RECHECK → DONE`.

Canonical protocol: `coordination/swarm-review-protocol.md`.

Post-merge P1/P2 findings become bounded repair Issues instead of being left as dead comments on already-merged PRs. Comment volume is not progress; verified artifacts are.
