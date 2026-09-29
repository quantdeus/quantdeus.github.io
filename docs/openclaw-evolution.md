# OpenClaw Evolution

QuantDeus OpenClaw has two different self-maintenance layers.

## 1. Runtime self-heal

The Vercel Sandbox already runs OpenClaw `doctor --fix` once per pinned runtime version and follows it with lint/doctor verification. This repairs local runtime state but does not redesign OpenClaw behavior.

## 2. Evidence-driven self-evolution

`.github/workflows/openclaw-evolution.yml` runs daily and asks OpenClaw to inspect its own recent operational evidence: Actions outcomes, OpenClaw-related PRs/Issues, current runtime code, validator rules and the self-evolution skill.

The loop is:

`OBSERVE → DIAGNOSE → HYPOTHESIS → ONE BOUNDED PR → QA → COMPARE → KEEP/REVERT`

The active behavioral skill is:

`.openclaw/skills/quantdeus-self-evolution/SKILL.md`

Trusted OpenClaw Office requests load this file into the execution prompt from fresh `main`, so an accepted Tier A skill improvement changes later OpenClaw behavior.

## Tiers

**Tier A — skill/evolution layer.** Only the skill, evolution ledger and this documentation may be changed. These PRs may auto-merge after QA Triad + Static Smoke and strict path verification.

**Tier B — core runtime.** Changes to the OpenClaw Vercel endpoint, client, validator, auth, MCP wiring or workflows remain ordinary reviewable PRs. The evolution job cannot auto-merge them.

## Why the split exists

A self-improving system should be able to learn from evidence, but it should not be able to remove the mechanisms that judge its own changes. Authentication, tool boundaries, secret isolation, QA, mission alignment and human control are protected invariants.
