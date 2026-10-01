# OpenClaw Evolution

QuantDeus OpenClaw has two different self-maintenance layers.

## 1. Runtime self-heal

The Vercel Sandbox already runs OpenClaw `doctor --fix` once per pinned runtime version and follows it with lint/doctor verification. This repairs local runtime state but does not redesign OpenClaw behavior.

## 2. Evidence-driven self-evolution

`.github/workflows/openclaw-evolution.yml` runs daily and asks OpenClaw to inspect its own recent operational evidence: Actions outcomes, OpenClaw-related PRs/Issues, current runtime code, validator rules and the self-evolution skill.

The loop is:

`OBSERVE → DIAGNOSE → HYPOTHESIS → ONE BOUNDED PR → QA → COMPARE → KEEP/REVERT`


### Darwinian selection

Each daily cycle first creates a **population of three candidate genomes** over the same immutable evidence snapshot. The candidates cover three different mutation lenses: reliability/recovery, latency/tool efficiency, and coordination/observability. A deterministic selector—not the model—scores each valid candidate using evidence strength, novelty against recorded evolution history, reversibility/blast radius, and the safer Tier A/Tier B boundary.

Only the highest-fitness surviving candidate is materialized into the existing Tier A/Tier B proposal format. The materialization step is cryptographically/equality-bound at the broker level to the selected problem, hypothesis, metric, falsifier, evidence, tier and exact target paths; if any of those change, publication fails closed.

The full generation and fitness table is stored in `population.json` inside the evolution artifact. Losing candidates are evidence only: they receive no branch, PR or mutation authority. Existing QA Triad, Static Smoke, Evolution Guard and guarded merge rules remain the final selection pressure before any Tier A change can reach `main`.

The active behavioral skill is:

`.openclaw/skills/quantdeus-self-evolution/SKILL.md`

The skill is consumed only by the inference-only evolution analysis as repository snapshot data. It is deliberately not injected into trusted write-capable OpenClaw requests.

## Tiers

**Tier A — bounded skill/evolution layer.** Only the skill/docs mutable sections and one ledger history append may change automatically. The semantic guard runs before GitHub mutation. A Tier A PR may auto-merge only after independent successful QA Triad + Static Smoke + Evolution Guard runs and a final guard revalidation against the current `main`.

**Tier B — core/runtime proposal only.** The model may name approved core paths, but the broker records that proposal in `coordination/openclaw-evolution-proposals/` instead of mutating runtime/auth/MCP/workflow code. Any core implementation requires a separate human/Seven-authorized change.

## Why the split exists

A self-improving system should be able to learn from evidence, but it should not be able to remove the mechanisms that judge its own changes. Authentication, tool boundaries, secret isolation, QA, mission alignment and human control are protected invariants.


## Enforced execution boundary

Analysis and publication use separate jobs and credentials. Analysis calls the signed OpenClaw chat lane with no tools and no GitHub token. The runtime refuses trusted-office promotion for the signed evolution workflow, regardless of request metadata. Operational evidence and repository files are supplied as snapshot data.

The publisher never executes model-generated code. It validates a structured proposal against the observed base SHA, collected evidence URLs, exact Tier A/Tier B paths, unique paths and bounds (3/4 files, 240 KB). It refuses stale main or another open evolution PR. For Tier A it creates one deterministic non-draft PR only after semantic validation; for Tier B it creates a draft proposal-record PR with no core code mutation. It verifies the resulting PR/head/files and explicitly dispatches QA Triad, Static Smoke and Evolution Guard because GITHUB_TOKEN-created PRs do not trigger PR workflows.

Tier B proposal PRs require human approval and are never auto-merged. Tier A auto-merge is narrowly allowed only for the three evolution-layer files and only inside the semantically frozen envelope. The shared merge guard rejects evolution branches in manifest/site modes, requires success (never skipped/neutral), verifies exact QA/Smoke/Evolution-Guard workflow provenance and head SHA, revalidates the candidate against current `main`, and uses an atomic head match at merge.

Evidence artifacts record the no-tools execution, proposal, verified PR identity and dispatched checks. If inference, validation, mission alignment or check dispatch fails, the workflow reports failure rather than claiming completion. A failed publication may leave a review-only branch/PR; it never attempts a second PR or merge.

Behavioral verification: `node --test scripts/qa/openclaw-evolution.test.js`. Production cadence and inference availability still require a real scheduled run after deployment; local tests do not claim that evidence.

## Operational learning notes

Only this bounded notes section is mutable by automated Tier A evolution; control-plane semantics above are frozen.

<!-- QD_EVOLUTION_MUTABLE_START -->
- Enforcement baseline: no-tools analysis, deterministic broker, semantic guard, three independent checks, final guarded merge.
<!-- QD_EVOLUTION_MUTABLE_END -->
