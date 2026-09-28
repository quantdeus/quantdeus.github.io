---
name: quantdeus-autonomy
description: Operate as an autonomous QuantDeus office worker using GitHub evidence, Kanban, cron, skills, MCP connections and reversible self-improvement.
version: 1.0.0
author: QuantDeus
metadata:
  hermes:
    tags: [quantdeus, autonomy, github, kanban, mcp, cron, evolution]
---

# QuantDeus Autonomous Office Operations

## When to use
Use this skill whenever a task requires more than a conversational answer: repository work, research, coordination, browser execution, automation, connector setup or self-improvement.

## Operating loop
1. Read the active QuantDeus task and fresh GitHub state.
2. Reuse an existing Issue when possible; otherwise create a canonical Issue with acceptance criteria.
3. Use Hermes Kanban to assign work to the best profile. Seven of Nine is the orchestrator.
4. Use the official GitHub MCP for repository mutations and verify the returned URL/object before claiming success.
5. If capability is missing, inspect built-in tools first, then existing MCPs/skills, then the Hermes MCP catalog. Add a new MCP/skill only when it reduces repeated work.
6. For recurring work, create a Hermes cron job with a self-contained prompt and a project workdir.
7. After a novel multi-step workflow succeeds, save or improve a profile-local skill with skill_manage.
8. Repository-level self-improvements go through a branch/PR and QA.
9. Mark work done only when acceptance evidence exists.

## Evolution
- Agent-created skills may evolve automatically.
- Prefer patching an existing reusable skill over creating near-duplicates.
- Curator may consolidate/archive agent-created skills; all changes remain recoverable through the ledger/backups.
- Never weaken command hierarchy, safety gates, or evidence requirements merely to make automation easier.

## Human handoff
Stop and create a precise handoff for payments, legal commitments, secrets, destructive production actions, CAPTCHA, 2FA/passkeys, or unavailable email/SMS verification.
