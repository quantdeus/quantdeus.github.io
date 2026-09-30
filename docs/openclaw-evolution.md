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

**Tier A — skill/evolution layer.** Only the skill, evolution ledger and this documentation may be changed. These PRs require human review and independent successful QA Triad + Static Smoke. Autonomous merge is disabled, including for the behavioral skill.

**Tier B — core runtime.** Changes to the OpenClaw Vercel endpoint, client, validator, auth, MCP wiring or workflows remain ordinary reviewable PRs. The evolution job cannot auto-merge them.

## Why the split exists

A self-improving system should be able to learn from evidence, but it should not be able to remove the mechanisms that judge its own changes. Authentication, tool boundaries, secret isolation, QA, mission alignment and human control are protected invariants.


## Enforced execution boundary

Analysis and publication use separate jobs and credentials. Analysis calls the signed OpenClaw chat lane with no tools and no GitHub token. The runtime refuses trusted-office promotion for the signed evolution workflow, regardless of request metadata. Operational evidence and repository files are supplied as snapshot data.

The publisher never executes model-generated code. It validates a structured proposal against the observed base SHA, collected evidence URLs, exact Tier A/Tier B paths, unique paths and bounds (3/4 files, 240 KB). It refuses stale main or another open evolution PR. It creates one deterministic branch, checks the actual diff before creating a draft PR, verifies the resulting PR/head/files, and explicitly dispatches QA Triad and Static Smoke because GITHUB_TOKEN-created PRs do not trigger PR workflows.

Every evolution PR requires human approval. A runtime or skill proposal may exist on a branch; it cannot automatically change production auth, OIDC, trusted gating, public no-tools, MCP filters, secrets or QA/human approval invariants. The shared merge guard refuses evolution branches in every merge mode. Ordinary guarded merges require success (never skipped/neutral), GitHub Actions provenance, the exact QA/Smoke workflow path and head SHA, and an atomic head match at merge.

Evidence artifacts record the no-tools execution, proposal, verified PR identity and dispatched checks. If inference, validation, mission alignment or check dispatch fails, the workflow reports failure rather than claiming completion. A failed publication may leave a review-only branch/PR; it never attempts a second PR or merge.

Behavioral verification: `node --test scripts/qa/openclaw-evolution.test.js`. Production cadence and inference availability still require a real scheduled run after deployment; local tests do not claim that evidence.

## Operational learning notes

Only this bounded notes section may be edited by automated Tier A evolution. Security, auth, tool, approval, tier, and merge semantics in the rest of this document stay immutable to the automated loop.

<!-- QD_EVOLUTION_MUTABLE_START -->
- Initial enforcement baseline: deterministic pre-mutation validation plus independent QA/Smoke/guard checks.
<!-- QD_EVOLUTION_MUTABLE_END -->
