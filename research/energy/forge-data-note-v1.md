# FORGE reproducible data note v1

## Purpose
Turn the P1 Energy register's highest-value next action into a falsifiable, reproducible research artifact without upgrading the evidence grade by proxy.

This note is a **protocol**, not a claimed analysis result. No metric below is PASS/FAIL until a public dataset identifier and its values have been recorded and independently re-run.

## Research question
Can public Utah FORGE / Geothermal Data Repository data support a reproducible time-series view of sustained circulation performance and drilling-learning metrics without relying on press-release summaries?

## Provenance gate
For every imported dataset record:

| Field | Required |
|---|---|
| repository / dataset identifier | yes |
| canonical public URL | yes |
| dataset title | yes |
| producer / institution | yes |
| publication or update date | yes |
| retrieval date | yes |
| file name + format | yes |
| units / schema | yes |
| transformation steps | yes |
| missing-data rule | yes |

A press release can locate a dataset but cannot substitute for the dataset identifier.

## Metric schema
### Circulation
- elapsed circulation time [h]
- injection flow [unit from source]
- production flow [unit from source]
- injection pressure [unit from source]
- production pressure [unit from source]
- injection temperature [°C]
- production temperature [°C]
- thermal drawdown relative to declared baseline [% or °C, formula recorded]

### Drilling learning
- well / interval identifier
- measured depth interval [ft or m]
- on-bottom drilling time [h]
- rate of penetration [ft/h or m/h]
- bit / drilling-system metadata when supplied by source

Never compare drilling-time records unless depth interval and metric definition are compatible.

## Minimal reproducible pipeline
1. Resolve the official GDR/FORGE dataset identifier(s).
2. Record immutable provenance fields above before analysis.
3. Preserve raw files unchanged; calculate a checksum when tooling permits.
4. Normalize timestamps to one declared timezone and retain original timestamp columns.
5. Normalize units only in derived columns; never overwrite source values.
6. Produce a tidy table with one observation per timestamp/interval.
7. Compute only explicitly defined derived metrics.
8. Export a machine-readable result table plus a human-readable summary.
9. Re-run from raw input and compare row count, null count, ranges and derived summaries.

## Validation / falsification gates
- **V1 provenance:** FAIL if a plotted/quoted metric cannot be traced to a public dataset identifier.
- **V2 schema:** FAIL if units or timestamp semantics are ambiguous.
- **V3 completeness:** report missingness; FAIL any inference that silently drops material gaps.
- **V4 circulation:** do not claim sustained useful performance merely because circulation occurred; require source-defined duration plus traceable flow/pressure/temperature series.
- **V5 thermal:** do not claim stable thermal output without a declared baseline and reproducible drawdown calculation.
- **V6 drilling learning:** do not claim cost learning from drilling-time improvement alone; label it operational learning unless cost data support the stronger claim.
- **V7 replication:** PASS only when a second run from the same raw inputs reproduces the published result table.

## Sherlock competing hypotheses
H1: public field data show technically informative sustained circulation and measurable operational learning.

H2: headline summaries are directionally true but public data are too incomplete/heterogeneous for the proposed metrics.

H3: the datasets are reproducible, but the chosen metrics are weak proxies for commercial viability.

The protocol is successful even if H2 or H3 wins: the objective is information gain, not confirmation.

## Decision rule
Upgrade the P1 Energy opportunity only after candidate metrics pass V1–V7. Keep commercial-readiness claims separate from field-test evidence.

## Next executable step
Resolve one official Utah FORGE/GDR dataset ID for the extended-circulation test, populate the provenance table, and add a tiny parser/notebook against that exact source. If the extended-circulation dataset is not public yet, record that as the blocker and use an earlier public circulation dataset only as a pipeline smoke test, clearly labeled as such.
