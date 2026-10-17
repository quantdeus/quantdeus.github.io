# Unity v2 — synthetic collaboration intake trace

Tracks #125.

This is a **synthetic internal test** of the existing public collaboration template at `.github/ISSUE_TEMPLATE/collaboration-intake.md`. No external person was contacted and no personal data was introduced.

## Synthetic proposal

### Contribution / need
Test whether a QuantDeus collaboration proposal can be classified and routed without private chat or manual guesswork.

### Relevant pillar(s)
- [ ] Energy — future energy
- [ ] Justice — algorithmic fairness
- [x] Unity — planetary cooperation
- [ ] Space — space expansion
- [ ] Human Potential
- [ ] Synthesis — aesthetics / culture

Reason: the proposal tests the collaboration/onboarding path itself.

### Public evidence / portfolio
Synthetic QA case only. Repository evidence: `.github/ISSUE_TEMPLATE/collaboration-intake.md` and Issue #125.

### Expected deliverable
A reproducible Markdown trace showing intake completeness, pillar classification, governance path and any broken step.

### Dependencies
- current collaboration intake template;
- `coordination/homunculi.json` governance model;
- Coordination Hub state labels.

### Privacy / safety constraints
No secrets, credentials, private contact details or private personal data. No external outreach.

### Opt-in contact method
`GitHub issue only`.

### Acceptance / definition of done
Another reviewer can read this file and reproduce the same classification/governance decision from repository files.

### Consent
- [x] This synthetic case is public-safe.
- [x] No secrets or private personal data are included.
- [x] Contact route is intentionally limited to the GitHub issue.

## Classification trace

1. Intake template supplies all required proposal fields.
2. The selected pillar is **Unity**, therefore canonical classification is `pillar-03-unity`.
3. The proposal remains a proposal until promoted into executable work; it is not silently treated as completed work.
4. Current governance registry states participant flow as:
   `proposal -> community vote -> admin promote`.
5. After promotion, executable work can receive `coord:task` plus an execution state such as `coord:ready` or `coord:active`.
6. Human override remains authoritative for privileged, irreversible, financial, secret-bearing or sensitive external actions.

## Result

- Intake fields complete: **PASS**
- Pillar classification recorded: **PASS — pillar-03-unity**
- Governance path recorded: **PASS**
- Personal/private data introduced: **NO**
- External outreach performed: **NO**
- Broken deterministic step found: **none in this synthetic trace**

## Follow-up rule

If a future real proposal cannot be deterministically classified, loses consent/privacy constraints, or bypasses the proposal-to-promotion path, open a concrete bug/task and link it from #125. Do not convert ambiguity into an invented successful result.
