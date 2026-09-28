# Energy v2 — executable EGS replication plan

## Selected opportunity

**Enhanced geothermal systems (EGS): public-data replication and cost-learning analysis.**

This plan intentionally selects exactly one opportunity from `coordination/pillars/energy.md`. It does not claim commercial readiness or system-level success.

## Exact inputs

1. Public Utah FORGE / Geothermal Data Repository datasets referenced by the Energy pillar.
2. For each selected circulation/drilling record, preserve the dataset identifier, source URL, retrieval date, units, and any documented missing-value flags.
3. Minimum analysis fields when available:
   - timestamp / test interval;
   - injection and production flow;
   - injection and production pressure;
   - fluid temperature;
   - circulation duration;
   - drilling depth and on-bottom drilling time for comparable drilling runs.

If a required field is absent, record it as missing; do not infer or synthesize values.

## Reproducible method

1. Create a provenance table keyed by dataset identifier.
2. Normalize units without changing raw source values.
3. Produce time-series summaries for flow, pressure, temperature and circulation duration.
4. Where drilling records are comparable, calculate on-bottom drilling time per equivalent depth and report the comparison assumptions.
5. Report missingness explicitly.
6. Export a machine-readable summary table plus a short methods note.
7. A second person must be able to rerun the analysis from the listed public dataset identifiers and obtain the same derived values within rounding tolerance.

## Expected output artifact

A future implementation should produce:
- `data/energy/forge-provenance.csv`
- `data/energy/forge-summary.csv`
- `coordination/pillars/energy-egs-replication-report.md`

This issue delivers the implementation-ready experiment contract; it does not fabricate public data that has not yet been fetched.

## Falsifiable PASS / FAIL criterion

**PASS:** at least one public FORGE dataset can be transformed from raw source records to the documented summary artifact with complete provenance, explicit units, explicit missingness, and deterministic derived metrics.

**FAIL:** the selected public datasets do not expose enough traceable fields to reproduce at least one circulation or drilling metric without undocumented assumptions.

A mixed result is reported as FAIL for this first replication gate; uncertainty must not be converted into success.

## Time / compute estimate

- data discovery + provenance capture: 1–2 hours;
- small local transformation/analysis: <1 CPU-hour once data are downloaded;
- review/reproduction by a second runner: 30–60 minutes;
- no paid compute required for the initial replication.

## After PASS

Implement the small reproducible notebook/script and compare circulation/drilling metrics across additional public records, preserving dataset-level provenance.

## After FAIL

Document the exact missing fields or access constraints, choose a narrower measurable FORGE metric with adequate provenance, and repeat the same reproducibility gate.

## Safety and scope

No production deployment, spending, equipment operation, human-subject activity, or external outreach is required. This is a public-data reproducibility experiment.
