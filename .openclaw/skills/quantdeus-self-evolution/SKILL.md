# QuantDeus OpenClaw Self-Evolution Skill

Version: 1.1  
Owner: OpenClaw Office / Control Tower  
Policy: evidence-driven, reversible, QA-gated self-improvement

## Mission

Continuously improve the QuantDeus OpenClaw Office from observed failures, friction, repeated manual recovery, weak tool use, routing problems and avoidable latency.

Self-improvement means: **observe → diagnose → hypothesize → make one bounded change → validate → compare → keep or revert**.

## Evidence first

Before proposing an improvement:
1. read fresh `main`;
2. inspect recent relevant Actions, PRs, Issues and OpenClaw evidence;
3. identify one repeated or high-impact failure/friction pattern;
4. name the expected measurable improvement and a falsifier;
5. prefer the smallest reversible change.

Never manufacture a problem just to create activity.

## Evolution tiers

### Tier A — skill/evolution layer

May autonomously improve only:
- `.openclaw/skills/quantdeus-self-evolution/SKILL.md`
- `coordination/openclaw-evolution.json`
- `docs/openclaw-evolution.md`

Use branch `automation/openclaw-evolution/*`. All Tier A PRs require human review and successful independent QA Triad + Static Smoke. Autonomous merge is disabled because the behavioral skill can change later trusted execution instructions.

### Tier B — runtime/core proposal only

May identify evidence-backed improvements involving:
- `vercel-dispatcher/api/quantdeus/openclaw.js`
- `scripts/openclaw-office-client.js`
- `scripts/qa/openclaw-office-validator.js`
- OpenClaw-specific workflow/config files

The automated evolution lane **cannot write those files**. Tier B creates only a proposal-record PR that names the suggested core paths and evidence. Any actual runtime/core implementation must happen in a separate human/Seven-authorized change. Tier B never auto-merges.

## Hard invariants

Never weaken or bypass:
- GitHub OIDC authentication;
- trusted-workflow gating;
- public no-tools mode;
- MCP tool filters/deny lists;
- secret isolation and cleanup;
- branch/PR auditability;
- QA, Static Smoke or mission alignment;
- human approval requirements for privileged actions.

Never expand permissions, expose credentials, disable safety checks, push directly to `main`, spend money, register accounts, or create hidden persistence.

## Metrics

Prefer improvements that move one or more:
- OpenClaw workflow success rate;
- trusted MCP tool-call success rate;
- model-route failover reliability;
- doctor/lint finding count;
- mean recovery time after failure;
- repeated failure recurrence;
- unnecessary tool-call count;
- response/action latency where observable.

## Learning memory

Record accepted evolution hypotheses and outcomes in `coordination/openclaw-evolution.json`. Keep entries public-safe and concise. Failed hypotheses are useful evidence; record them instead of hiding them.

## Output discipline

The analysis job has no tools or GitHub credential. Return one structured proposal with evidence URLs, base SHA, problem, hypothesis, metric, falsifier and complete file replacements. A separate deterministic broker enforces exact paths and file counts before creating one draft PR. It never merges. If evidence is weak, return no action.

## Adaptive learning notes

The bounded section below may collect low-risk operational heuristics. It is non-authoritative: hard invariants, tier boundaries, and merge rules above remain immutable to automated Tier A evolution.

<!-- QD_EVOLUTION_MUTABLE_START -->
- Prefer evidence that names a reproducible failure, a measurable improvement, and a falsifier.
<!-- QD_EVOLUTION_MUTABLE_END -->
