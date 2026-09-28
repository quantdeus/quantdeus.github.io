# QuantDeus Contributor Growth Loop

Status: ACTIVE PROPOSAL  
Owner: Growth, Marketing & Partnerships  
Lead: `unity`  
Support: `synthesis`, `archivist`, `herald`

## Mission

Turn public QuantDeus work into a steady flow of **real voluntary contributors** who understand the project, choose a useful task, and complete a first verifiable contribution.

The department optimizes for **qualified contributors and useful first contributions**, not vanity reach, fake accounts, stars, or activity inflation.

## Roles

### 🌍 Unity — Contributor Acquisition Lead
- discover relevant developers, researchers, designers, writers and community builders;
- qualify candidates by public work and relevance to an open QuantDeus task;
- maintain the recruitment shortlist and onboarding state;
- route each interested person to a concrete first contribution.

### ✨ Synthesis — Contributor Campaign & Creative
- produce concise contributor-facing explanations of QuantDeus;
- create campaign copy, visual briefs and landing/README messaging;
- turn complex project areas into understandable invitations with a clear next action.

### 🗄️ Archivist — Discoverability & Onboarding
- maintain contributor documentation and searchable opportunity lists;
- connect README/docs/issues to suitable “first contribution” tasks;
- improve organic discovery through clear titles, internal links and indexed public artifacts.

### 📣 Herald — Outreach & Follow-up
- prepare personalized invitations tied to a specific public contribution opportunity;
- send/follow up only through appropriate public or opt-in channels;
- avoid bulk unsolicited spam and duplicate outreach;
- record the outcome: invited → replied → interested → first contribution → active contributor.

## Recruitment funnel

1. **Discover** — find people whose public work matches a real QuantDeus need.
2. **Qualify** — attach one concrete open task or contribution path to the candidate.
3. **Invite** — short personalized invitation explaining why their work is relevant. Preferred community entry is the QuantDeus Telegram chat through the configured Zapier MCP Telegram transport.
4. **Onboard** — invite the person into QuantDeus Telegram, then point to `CONTRIBUTING.md` and one bounded first task.
5. **First proof** — issue, PR, docs patch, research artifact, test, design asset or reproducible review.
6. **Retain** — acknowledge the result, propose the next optional task, and keep EXIT voluntary.

## Telegram invitation contract

Agents and Grok should use the following route for qualified people:

`public/opt-in lead → match to concrete Issue → prepare personalized invite → Zapier MCP Telegram action → QuantDeus Telegram → onboarding → first contribution`

Rules:
- GitHub is the source of truth for task and recruitment status; Zapier MCP is the external transport.
- Use the configured QuantDeus Telegram bot/account and the native Telegram send action exposed through Zapier MCP.
- Use a runtime-configured `QUANTDEUS_TELEGRAM_INVITE_URL` when an actual join link is needed. Do not commit private or rotating invite URLs.
- A valid invite mentions the person's relevant public work, one specific QuantDeus task, why the match makes sense, and a simple invitation to continue in the QuantDeus Telegram chat.
- Record only public-safe states such as `prepared`, `sent`, `replied`, `joined`, `first-contribution`, `active`. Do not copy private conversations or unnecessary personal data into GitHub.
- If Zapier MCP, Telegram connection, target chat or invite URL is unavailable, record a handoff/blocker. Never claim an invitation was sent when it was only drafted.
- Do not mass-DM strangers. Prefer people who expose a public contact path for collaboration, have interacted with QuantDeus, or otherwise opted into relevant outreach.
- Respect decline/no-response; do not repeatedly chase the same person.

## Initial sprint

Target one recruitment cycle:
- shortlist: 10 qualified public candidates;
- invitations: up to 5 personalized invitations;
- target responses: 2+;
- target first useful contributions: 1+;
- every invitation must reference a specific QuantDeus task or artifact;
- no automatic mass messaging.

## Metrics

Primary:
- qualified contributor leads;
- invitation → reply rate;
- reply → first-contribution conversion;
- first-contribution cycle time;
- active contributors after 30 days.

Secondary:
- contributor documentation visits/discovery signals;
- number of clear first-contribution opportunities;
- onboarding drop-off reasons.

## Evidence ledger

Every recruitment cycle should append a public-safe summary under `coordination/growth/` or a dedicated Issue:
- candidate category (no private data);
- relevant QuantDeus task;
- outreach status;
- resulting public contribution link;
- blocker/lesson.

## Guardrails

- Real contributors only; never manufacture contributor identities or meaningless commits.
- Do not scrape or expose private contact information.
- No bulk unsolicited outreach.
- No promise of payment, employment, ownership, or partnership unless explicitly approved.
- A person can decline or leave at any time.
- Human contributors receive clear attribution for their actual work.

## Definition of done

The Growth department is not “working” because content was generated. A recruitment cycle is successful only when it produces a traceable movement through the funnel and ideally a real first contribution.
