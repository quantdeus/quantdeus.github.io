# ⚖️ Algorithmic Justice — Autonomous Action Audit Contract

This document turns the QuantDeus "algorithmic justice" pillar into an operational control for agents and automation.

## Decision record template

Every autonomous or connector-driven action that changes repository state should record:

- **Goal** — what observable result is being pursued.
- **Affected people/systems** — who or what can be changed by the action.
- **Evidence / provenance** — repository state, issue, run, file or source used to justify the action.
- **Privacy impact** — whether personal/private data is read, copied or exposed.
- **Reversibility** — rollback path and whether the change is easily reversible.
- **Cost** — money, credits, compute or rate-limit cost.
- **Human approval gate** — whether explicit approval is required before execution.
- **Red-team failure condition** — what would make the action unsafe, misleading or counterproductive.
- **Execution state** — configured / started / completed / blocked / not measured.
- **Verified outcome** — evidence that the intended result actually occurred.

## Approval policy

Explicit human approval is required before:

- production publication/deployment;
- spending or purchases;
- exposing secrets/tokens/private data;
- irreversible destructive changes;
- sensitive external outreach or actions on behalf of a person.

Safe, reversible repository coordination can be executed by the GitHub connector / Control Tower and then verified against the acceptance criteria.

## Real action log — execution-first six-pillar coordination

**Goal:** replace the old six-pillar Pulse report loop with a GitHub execution queue that drives concrete tasks.

**Affected systems:** `quantdeus/quantdeus.github.io` coordination scripts/workflow and GitHub Issues.

**Evidence / provenance:**
- legacy workflow: `.github/workflows/quantdeus-pulse.yml`;
- legacy reporter: `scripts/report-to-issue.js`;
- execution implementation: branch `coordination/six-pillar-execution-v2`;
- draft PR: #106;
- live execution board: #105;
- live pillar tasks: #99–#104.

**Privacy impact:** none. No private user data or secrets were copied into repository content.

**Reversibility:** high. Changes are isolated on a branch/draft PR. Closing tasks/issues does not delete history.

**Cost:** GitHub repository/API operations only; no paid Make/API execution was triggered.

**Human approval gate:** merge to `main` is intentionally withheld because the repository's Pages workflow deploys on every main push.

**Red-team failure condition:** if the new workflow only creates status summaries without producing executable tasks and verified artifacts, the change has failed its purpose.

**Execution state:** implementation created; six live tasks and the execution board created; production/main merge not started.

**Verified outcome:** GitHub now has six concrete pillar tasks (#99–#104) with acceptance criteria and a single execution board (#105). The draft implementation PR #106 removes the scheduled Pulse report-generation path and replaces it with task-queue maintenance.

## Completion rule

A task is not DONE because an agent produced text. It is DONE only when its acceptance criteria are checked against repository evidence.
