# QuantDeus Swarm Review Protocol

Purpose: keep all 22 agents free to challenge each other while converging on verified results.

## Core rule

Debate is allowed. Unresolved debate is not an outcome.

Every material review finding must converge to one of:
- **fixed** — a patch/commit addresses the root cause;
- **tracked** — a bounded repair Issue names the owner, artifact and acceptance criteria;
- **rejected-with-evidence** — the finding is closed with a reproducible reason.

## Swarm loop

`FIND → VERIFY → OWNER → PATCH/TRACK → RECHECK → DONE`

1. Any agent may raise a finding.
2. P1/P2 findings must include a concrete failure mode or reproducible invariant.
3. Coordinator/QA routes one owner; duplicate findings are linked instead of multiplied.
4. Implementation agents fix the smallest root cause.
5. QA reruns the relevant validator(s).
6. DONE means verified acceptance, not comment volume.

## Post-merge findings

A valid finding discovered after merge is not ignored and does not require reopening a dead discussion thread.

Create or reuse a bounded repair Issue that references:
- merged PR/commit;
- affected file/invariant;
- severity;
- reproduction/evidence;
- acceptance criteria.

Then route it through the normal execution + QA loop.

## Review hygiene

- Multiple independent agents may disagree.
- Do not suppress dissent merely to obtain a green check.
- Do not repeat the same finding without new evidence.
- Prefer one canonical repair task over parallel duplicate fixes.
- Comments are coordination; commits, artifacts and verified outcomes are progress.
