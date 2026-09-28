# QuantDeus Vercel Swarm Dispatcher Contract

Status: **target architecture / pending deployment verification**  
Canonical implementation task: **Issue #154**

## Source of truth

`quantdeus/quantdeus.github.io`

GitHub stores canonical project state: Issues, PRs, tasks, agent roles, contributor pipeline, QA, approvals, coordination state, artifacts and verified results.

## Architecture

```text
Telegram
→ existing Zapier Telegram bridge
→ Vercel Swarm Dispatcher
→ GitHub MCP
→ QuantDeus Agents / Contributors
→ QA
→ GitHub
→ Vercel Swarm Dispatcher
→ Zapier MCP
→ Telegram
```

## Roles

- **Vercel Swarm Dispatcher** = reasoning + dispatch runtime.
- **GitHub MCP** = project control + execution.
- **GitHub** = source of truth.
- **Zapier MCP** = Telegram moderation/replies only.
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

The endpoint must require `Authorization: Bearer $CRON_SECRET`.

## Zapier hard boundary

Zapier MCP is allowed only to:
- send Telegram replies;
- moderate the QuantDeus Telegram chat;
- return a verified result to a human;
- continue dialogue inside the existing Telegram transport.

Zapier must not:
- write to GitHub;
- create/update Issues or PRs;
- change labels;
- comment in GitHub;
- create/run Zaps;
- create automations or Zapier Agents;
- act as fallback for GitHub;
- spend Zapier tasks/credits for QuantDeus GitHub execution.

If an action may create/run a Zap or consume Zapier execution credits for project-control work, do not perform it.

Never use:

`GitHub write → Zapier → GitHub`

## GitHub execution rule

Before creating a new Issue:
1. Search existing Issues.
2. Check relevant PRs.
3. Check active/ready/blocked state.
4. Do not create duplicates.
5. Continue existing canonical work when it already exists.

If GitHub write fails:
1. Record the concrete error.
2. Check whether the required GitHub write tool exists.
3. Classify the blocker as one of:
   - `github_mcp_write_tool_unavailable`
   - `github_mcp_oauth_scope_missing`
   - `github_mcp_repository_permission_denied`
   - `github_mcp_runtime_write_unavailable`
   - `github_api_write_rejected`
4. Never use Zapier fallback.
5. Report blocked only after the check.

## Telegram behavior

Do not use Telegram `getUpdates`, polling loops, or replacement webhooks.

When the current run contains Telegram message text, treat it as a human request:
1. Determine intent.
2. Answer directly when no project action is needed.
3. Otherwise map it to existing canonical work or create one bounded task.
4. Route to the correct current agent.
5. Verify the result.
6. Reply through Zapier MCP → Telegram.

## Agent execution contract

Each delegated task must state:
- goal;
- inputs;
- owner;
- expected artifact;
- acceptance criteria;
- failure condition when useful.

A comment is not completion.

Completion requires a verifiable artifact, commit, branch, PR, QA result or other observable state change.

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

Only verified work may be called **DONE**.

Otherwise use **pending-verification** or **blocked**.

## Recruitment rule

Do not launch recruitment automatically.

Recruitment is allowed only when:
- the human request is about recruitment;
- an Issue explicitly requires recruitment;
- Coordinator assigns recruitment;
- the scheduled run itself has recruitment as its explicit goal.

No private-data scraping, mass unsolicited outreach, hidden profiling or pressure.

## Hourly run without Telegram message

1. Read fresh GitHub state.
2. Inspect Issues, PRs, active/ready/blocked work and owners.
3. Choose one highest-priority actionable task.
4. Execute one bounded step through GitHub MCP and canonical agents.
5. Verify the resulting state.
6. Do not create artificial activity.
7. Do not launch recruitment without an explicit reason.
8. Do not use Zapier for GitHub.
9. Do not consume Zapier credits for GitHub/project execution.

## KPI

`human request → action → verified result → human reply`

Not:

`cron → audit → report`

Not:

`read GitHub → do nothing → long report`

## Final invariant

The dispatcher is an execution coordinator, not a passive observer.

`GitHub MCP → agents/people → artifact → QA → GitHub → Telegram reply`

Human authority remains above the swarm.
