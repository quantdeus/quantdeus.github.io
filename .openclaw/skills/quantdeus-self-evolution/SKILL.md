# QuantDeus OpenClaw Self-Evolution Skill

Version: 1.2  
Owner: OpenClaw Office / Control Tower  
Policy: evidence-driven, reversible, QA-gated self-improvement

## Mission

Continuously improve the QuantDeus OpenClaw Office **and the operating behavior of all 27 canonical agents** from observed failures, friction, repeated manual recovery, weak tool use, routing problems, coordination defects and avoidable latency.

Self-improvement means: **observe → diagnose → hypothesize → make one bounded change → validate → compare → keep or revert**.

## Evidence first

Before proposing an improvement:
1. read fresh `main`;
2. inspect recent relevant Actions, PRs, Issues, OpenClaw evidence and agent-role/registry context;
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

Use branch `automation/openclaw-evolution/*`. Automated Tier A may change only the bounded mutable sections below (or append one evolution-ledger history entry). A deterministic semantic guard runs before any GitHub mutation. Tier A may auto-merge only after independent successful QA Triad + Static Smoke + Evolution Guard checks and one final semantic/path revalidation. The mutable skill is not injected into trusted write-capable OpenClaw requests.

### Tier B — shared policy/runtime/core proposal only

May identify evidence-backed improvements involving:
- `AGENTS.md` when repeated evidence shows a cross-agent operating-policy defect;
- `vercel-dispatcher/api/quantdeus/openclaw.js`
- `scripts/openclaw-office-client.js`
- `scripts/qa/openclaw-office-validator.js`
- OpenClaw-specific workflow/config files

The automated evolution lane cannot write those shared policy/core files. It can create only a proposal-record PR naming approved paths and evidence. Actual `AGENTS.md` or runtime/core implementation requires a separate human/Seven-authorized change and independent QA. Tier B never auto-merges.

## Swarm participation

- Every canonical agent is an **evidence source** for evolution through its Actions, Issues, PRs, handoffs and observable execution outcomes.
- Agents may surface their own friction or propose a hypothesis, but **never self-certify** that their own policy mutation is an improvement.
- Role registries, homunculus registry, doctrine and living manifesto are read-only context for this lane.
- Shared behavior changes converge through `AGENTS.md` as Tier B proposals; role identity/authority changes remain outside autonomous evolution.
- Prefer changes that reduce repeated human rescue, duplicate work, stale handoffs, unsafe tool use, hallucinated completion or recurring coordination failures.

## Hard invariants

Never weaken or bypass:
- GitHub OIDC authentication;
- trusted-workflow gating;
- brokered public read-only tool boundary and authenticated mutation authority;
- MCP tool filters/deny lists;
- secret isolation and cleanup;
- branch/PR auditability;
- QA, Static Smoke or mission alignment;
- human approval requirements for privileged actions;
- independent evaluation of agent-policy changes;
- canonical agent/homunculus registries, doctrine and manifesto as autonomous mutation targets.

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

The analysis job has no tools or GitHub credential. Return one structured proposal with evidence URLs, base SHA, problem, hypothesis, metric and falsifier. Tier A may include complete replacements only for the three Tier A files, but automated changes are accepted only inside the bounded mutable sections/history. Tier B returns suggested core paths only—never generated core code. A separate deterministic broker validates everything before creating a PR. If evidence is weak, return no action.

## Adaptive learning notes

Only the bounded section below is mutable by automated Tier A evolution. It may contain low-risk operational heuristics, never control-plane instructions.

<!-- QD_EVOLUTION_MUTABLE_START -->
- Prefer reproducible failures, measurable outcomes and explicit falsifiers.
<!-- QD_EVOLUTION_MUTABLE_END -->
