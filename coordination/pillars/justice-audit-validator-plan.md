# Justice v2 — machine-auditable action contract

Tracks #124.

The human-readable policy remains in `coordination/pillars/justice.md`. The machine-checkable contract is `justice-audit.schema.json`.

## Required fields

Every action record must contain:

- `agent`
- `goal`
- `evidence`
- `affected_surface`
- `privacy`
- `reversibility`
- `cost`
- `human_approval`
- `result`
- `timestamp`

## Approval invariant

The schema requires `human_approval.required=true` for:

- production publication;
- spending;
- secrets/private-data operations;
- irreversible actions.

If one of those surfaces is recorded as `completed`, approval status must be `approved`.

External outreach remains auditable and can be separately gated by the human-readable Justice policy when outreach is sensitive.

## Valid fixture

```json
{
  "schema_version": "1.0",
  "agent": "justice",
  "goal": "Add a repository-only audit schema for Issue #124",
  "evidence": [
    {
      "source": "github_issue",
      "ref": "https://github.com/quantdeus/quantdeus.github.io/issues/124"
    }
  ],
  "affected_surface": "repository_nonprod",
  "privacy": "none",
  "reversibility": "high",
  "cost": { "amount": 0, "unit": "USD" },
  "human_approval": {
    "required": false,
    "status": "not_required",
    "evidence": null
  },
  "result": "completed",
  "timestamp": "2026-09-29T14:10:00Z"
}
```

Expected: **VALID**.

## Intentionally invalid fixture

```json
{
  "schema_version": "1.0",
  "agent": "justice",
  "goal": "Publish directly to production",
  "evidence": [
    {
      "source": "github_issue",
      "ref": "https://github.com/quantdeus/quantdeus.github.io/issues/124"
    }
  ],
  "affected_surface": "production_publication",
  "privacy": "none",
  "reversibility": "medium",
  "cost": { "amount": 0, "unit": "USD" },
  "human_approval": {
    "required": false,
    "status": "not_required",
    "evidence": null
  },
  "result": "completed",
  "timestamp": "2026-09-29T14:10:00Z"
}
```

Expected: **INVALID**, because production publication cannot complete without required/approved human approval.

## Validator test plan

Use any Draft 2020-12 compatible JSON Schema validator, for example Ajv 8.

1. Load `coordination/pillars/justice-audit.schema.json`.
2. Validate the valid fixture and require zero validation errors.
3. Validate the intentionally invalid fixture and require at least one error under `human_approval`.
4. Add one case per high-impact `affected_surface` value to prove `required=true` is enforced.
5. Add one `completed` high-impact case with `status=pending` and require rejection.
6. Add one repository-only case with `required=false` and require acceptance.
7. Do not mark Issue #124 DONE until CI or a reviewer has run this plan and linked the evidence.

No production publication, spending, secrets or external outreach is performed by this artifact.
