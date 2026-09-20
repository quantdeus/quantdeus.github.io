# 🚀 Space — Warp evidence gates

Checkpoint source: `quantdeus/Warp-buble` at `418d48cd34ea766f6e696faaca475700512ec8c7` (main, observed 2026-09-20).

This is an evidence gate, not a claim that a warp geometry has been validated. `UNKNOWN` is intentional whenever the repository does not contain candidate-specific evidence at this checkpoint.

| Gate | Status | Repository evidence | What would change the status |
|---|---|---|---|
| Geometry | UNKNOWN | [Warp-buble main checkpoint](https://github.com/quantdeus/Warp-buble/tree/418d48cd34ea766f6e696faaca475700512ec8c7) | Explicit candidate metric/geometry with parameters and provenance. |
| EOM | UNKNOWN | [Warp-buble main checkpoint](https://github.com/quantdeus/Warp-buble/tree/418d48cd34ea766f6e696faaca475700512ec8c7) | Candidate-specific equations of motion plus reproducible evaluation. |
| Residual | UNKNOWN | [Warp-buble main checkpoint](https://github.com/quantdeus/Warp-buble/tree/418d48cd34ea766f6e696faaca475700512ec8c7) | Numerical/symbolic residual report with tolerance. |
| NEC | UNKNOWN | [WarpAX methodology note](https://github.com/quantdeus/Warp-buble/blob/418d48cd34ea766f6e696faaca475700512ec8c7/research/modified-gravity/reports/2026-09-08/2026-09-08T1317%2B0300-warpax-observer-robust-energy-condition-certification.md) | Observer-robust all-frame certificate for the QuantDeus candidate. Benchmark results are methodology evidence, not a candidate pass. |
| Energy | UNKNOWN | [WarpAX methodology note](https://github.com/quantdeus/Warp-buble/blob/418d48cd34ea766f6e696faaca475700512ec8c7/research/modified-gravity/reports/2026-09-08/2026-09-08T1317%2B0300-warpax-observer-robust-energy-condition-certification.md) | Candidate stress-energy / integrated energy with units, domain and provenance. |
| Curvature / tidal | UNKNOWN | [Warp-buble main checkpoint](https://github.com/quantdeus/Warp-buble/tree/418d48cd34ea766f6e696faaca475700512ec8c7) | Curvature invariants and tidal bounds over the relevant domain. |
| Horizon | UNKNOWN | [Warp-buble main checkpoint](https://github.com/quantdeus/Warp-buble/tree/418d48cd34ea766f6e696faaca475700512ec8c7) | Horizon/trapped-surface analysis for the candidate and target velocity. |
| Causality | UNKNOWN | [Warp-buble main checkpoint](https://github.com/quantdeus/Warp-buble/tree/418d48cd34ea766f6e696faaca475700512ec8c7) | Global/local causal-structure analysis and chronology checks. |
| Stability | UNKNOWN | [Modified-gravity research index](https://github.com/quantdeus/Warp-buble/blob/418d48cd34ea766f6e696faaca475700512ec8c7/research/modified-gravity/INDEX.md) | Candidate-specific linear/nonlinear stability result; adjacent modified-gravity studies only establish the importance of this gate. |
| EFT | UNKNOWN | [Modified-gravity research index](https://github.com/quantdeus/Warp-buble/blob/418d48cd34ea766f6e696faaca475700512ec8c7/research/modified-gravity/INDEX.md) | Cutoff/derivative-expansion analysis showing the candidate remains inside its controlled regime. |

## Red-team conclusion

At this checkpoint the repository contains useful validation methodology and modified-gravity evidence, but not enough candidate-specific material to mark any of the ten engineering gates PASS. Treating methodology, benchmark metrics, or adjacent theory papers as a validated QuantDeus warp solution would be a proxy error.

## Next falsifiable step

Select one named candidate checkpoint and attach a machine-readable validation bundle containing the metric, parameter set, EOM residuals and observer-robust energy-condition output. That bundle is the minimum evidence needed before any gate can move from `UNKNOWN` to `PASS` or `FAIL`.
