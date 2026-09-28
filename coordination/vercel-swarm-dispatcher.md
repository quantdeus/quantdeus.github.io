# QuantDeus Vercel Swarm Dispatcher Contract

Status: **target architecture / pending deployment verification**  
Canonical implementation task: **Issue #154**

## Source of truth

`quantdeus/quantdeus.github.io`

GitHub stores canonical project state: Issues, PRs, tasks, agent roles, contributor pipeline, QA, approvals, coordination state, artifacts and verified results.

## Architecture

```text
Telegram
↕
GitHub Actions Telegram Bot
↕
GitHub source of truth
↔ Vercel Swarm Dispatcher
→ QuantDeus Agents / Contributors
→ QA
→ GitHub
↕
GitHub Actions Telegram Bot
↕
Telegram
```

## Roles

- **GitHub Actions Telegram Bot** = direct Telegram Bot API polling, replies and role routing.
- **Vercel Swarm Dispatcher** = optional reasoning/dispatch runtime for bounded project execution.
- **GitHub connector/API** = project control + execution.
- **GitHub** = source of truth.
- **Human** = final authority.

The Vercel swarm is a runtime orchestration layer, not a new fictional project role. It must read current roles from:
- `coordination/agents.json`
- `coordination/homunculi.json`
- `coordination/startup-org.json`
- `AGENTS.md`

## Hourly schedule

Production target:

```cron
0 * * * *
```

Endpoint:

`/api/quantdeus/hourly`

The protected POST endpoint requires `Authorization: Bearer $CRON_SECRET`.

## GitHub execution rule

Before creating a new Issue:
1. Search existing Issues.
2. Check relevant PRs.
3. Check active/ready/blocked state.
4. Do not create duplicates.
5. Continue existing canonical work when it already exists.

If GitHub write fails, record the concrete error and report the exact GitHub permission/runtime blocker. Do not route project-control writes through unrelated external automation services.

## Telegram behavior

The canonical Telegram runtime is `.github/workflows/telegram-bot.yml`.

It:
1. polls Telegram Bot API directly;
2. maps ordinary text to a current QuantDeus role;
3. honors explicit `/agent <id>`;
4. creates governance proposals through `/propose <id> <idea>`;
5. permits `/task <id> <task>` only for a Telegram chat admin;
6. records project state in GitHub;
7. returns repo-grounded replies through Telegram Bot API.

The polling offset lives only in GitHub Actions cache. Raw Telegram user IDs are not committed to the repository.

## Agent execution contract

Each delegated task must state:
- goal;
- inputs;
- owner;
- expected artifact;
- acceptance criteria;
- failure condition when useful.

A comment is not completion. Completion requires a verifiable artifact, commit, branch, PR, QA result or other observable state change.

## QA rule

After execution, verify what applies:
- file;
- commit;
- branch;
- PR;
- artifact;
- diff;
- QA;
- Static Smoke;
- acceptance criteria.

Only verified work may be called **DONE**. Otherwise use **pending-verification** or **blocked**.

## Recruitment rule

Do not launch recruitment automatically.

Recruitment is allowed only when:
- the human request is about recruitment;
- an Issue explicitly requires recruitment;
- Seven of Nine, as QuantDeus Coordinator, assigns recruitment;
- the scheduled run itself has recruitment as its explicit goal.

No private-data scraping, mass unsolicited outreach, hidden profiling or pressure.

## KPI

`human request → role routing → action → verified result → human reply`

Human authority remains above the swarm.
