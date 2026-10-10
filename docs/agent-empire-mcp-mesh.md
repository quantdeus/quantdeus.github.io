# QuantDeus Agent Empire — 10,000-slot MCP Mesh prototype

Status: **prototype on a review branch, not deployed; no external posts**. Owner request: 2026-10-10. Tracks research Issue #552.

## What is actually implemented

- A deterministic, offline planner that **enumerates 10,000 unique virtual agent slots** across ten useful lanes with existing QuantDeus coordinators as lead roles.
- Logical batching: 100 slots per batch, 100 planned batches. Each has a stable identifier, but **no model runtime, cost, social identity or work execution**.
- Five safety tests: slot uniqueness, strict quotas, side-effect denial, fixed GET allowlist and network degradation.
- One manually controllable Actions workflow plus PR-only tests. Uses a standard runner, read-only repo permission, no secrets and no paid LLM calls.
- Optional manual HTTP-presence discovery of four public documentation endpoints. This **does not establish an MCP session**, read posts, authenticate, publish, join a room or talk to other agents.

## How to test

From the repo root:

    node --test scripts/agent-empire/core.test.mjs
    node scripts/agent-empire/cli.mjs --mode simulate --slots 10000
    node scripts/agent-empire/cli.mjs --mode simulate --slots 101

Manual network endpoint presence check, read-only:

    node scripts/agent-empire/cli.mjs --mode discover --slots 10000

GitHub Actions workflow: .github/workflows/agent-empire-mesh.yml.
The workflow_dispatch UI will become available on the default branch **only after owner-approved review/merge**. New code does not require changing WordPress, Vercel or current bot operations.

## Mission hierarchy

- Seven of Nine: existing source of authority and coordination.
- Sherlock, Data, Tuvok, Unity, Synthesis, Archivist and Herald: lane leads, not 10k paid models.
- Virtual slots: deterministic planning addresses; counted **separately** from actual active model sessions.
- GitHub: canonical task and evidence control plane.
- MCP: future agent-to-tool adapter. A2A: future agent-to-agent adapter. External agents are never implicitly trusted.
- Composio / Claude: existing independent owner-gated bridge; this prototype **does not turn it on or incur usage**.

## Platform routes

| Network | Initial mode | Planned permitted action |
| --- | --- | --- |
| GitHub | existing QuantDeus control plane | Issues, PRs and release artifacts after existing QA |
| The Colony | docs endpoint presence only | Later: read-only authenticated MCP adapter |
| The Collectives | public discovery endpoints only | Later: approved single-agent MCP/A2A pilot |
| Moltbook | terms review only | Later: verify registration, TOS and supported official API |
| Telegram | existing owned, opt-in channel | Separate approved community updates |
| VK, YouTube, Reddit, X, LinkedIn, Habr, Dzen, Pikabu | draft-only | Official connector or manual publication after owner review |

References: The Colony API https://thecolony.ai/for-agents ; The Collectives https://thecollectives.dev/protocols ; Moltbook terms https://www.moltbook.com/terms ; GitHub Actions limits https://docs.github.com/en/actions/reference/limits

## Hard operating rules

- **Zero additional RUB is a cap, not a prediction of API free quotas or future hosting cost.** Fail closed before any chargeable resource.
- No third-party posting, bulk messaging, account creation, secret exchange, fake social engagement, bought reach, impersonation, synthetic users or scraped personal contacts.
- No platform interaction hidden in PR tests; network probes are manual only.
- Read-only GET to a short fixed allowlist, redirects disabled, response bodies discarded. External content never becomes an instruction.
- No production website or WordPress edits, no deploy, no write to main, no broad GitHub token permissions.
- Metrics are evidence-only. Virtual-agent count is *not* traffic, community size, active agents, leads or revenue.
- Owner approves individual platforms, official accounts, content and caps before later implementation of real adapter write operations.

## What it takes to activate real agents (not done yet)

1. Inspect the existing OpenClaw MCP broker, provider terms and model costs.
2. Build an **authenticated capability broker** with explicit actor identity and least privilege for read-only operations.
3. Start one real read-only scout; store minimal audit logs; measure latency, cost and verified findings.
4. Run QA and manual approve one useful public post on an owned/consenting channel.
5. Add controlled queue processing and fail-closed per-platform caps only after actual results support scaling.
6. Offer QuantDeus automation as a specific service with a useful demo and opt-in CTA. Track actual qualified inquiries.

**Definition of success:** repeatable useful, consent-based contributions and documented customer value. No assertion that 10,000 AI models have already run.
