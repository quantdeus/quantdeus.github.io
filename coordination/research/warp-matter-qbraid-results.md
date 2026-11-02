# QuantDeus Warp Matter — local baseline results (2026-11-02)

**Status:** `local_reproducible`, **new qBraid experiment:** `not_executed`. No physical QPU or warp device was used.

## Configuration

- Molecule: H₂, internuclear distance **0.735 Å** (fixed geometry).
- Published STO-3G parity-mapped, two-qubit Hamiltonian; *not* a new ab initio chemistry calculation. Basis order `|q1 q0>`.
- Electronic Hamiltonian, Hartree: `H = -1.052373245772859 II + 0.39793742484318045 ZI - 0.39793742484318045 IZ - 0.01128010425623538 ZZ + 0.18093119978423156 XX`.
- Nuclear repulsion `1/R` with `1 bohr = 0.529177210903 Å`. The nuclear term is **not** in the quoted electronic Hamiltonian.
- Ansatz `cos(θ)|10> − sin(θ)|01>`. QASM circuits emitted for Z and X basis measurements.
- Monte Carlo: local Python, 8192 samples **per basis**, seed=20261102. No quantum cloud jobs.

## Verified local computation

| Measurement | Value | Provenance |
|---|---:|---|
| HF-like computational basis `|10>` electronic energy | −1.836967991203 Ha | coefficient combination |
| Exact electronic ground energy (2×2 analytic eigenvalue) | **−1.857275030202 Ha** | analytic block diagonalization |
| Ansatz optimized θ | 0.111768499134 rad | closed-form optimum |
| Ansatz electronic energy | −1.857275030202 Ha | state expectation |
| Nuclear repulsion | +0.719968994426 Ha | 0.529177210903/0.735 |
| Total ground energy | **−1.137306035777 Ha** | electronic + nuclear |
| Local Monte-Carlo sampled electronic energy | −1.855190985280 Ha | seed 20261102 |
| Absolute sampling difference | 0.002084044923 Ha | sampled minus exact |
| Local unit tests | 5/5 pass | `python -m unittest -v` |

Source code `research/warp-matter/h2_baseline.py`, tests `research/warp-matter/test_h2_baseline.py`.

Reproduce:
```bash
cd research/warp-matter
python3 -m unittest -v
python3 h2_baseline.py
python3 h2_baseline.py --qasm z
python3 h2_baseline.py --qasm x
```

The analytic optimum is derived from supplied **published** coefficients. This is an instructional benchmark and an infrastructure smoke test, **not an independent chemical discovery**. Sampling uses classical pseudorandom numbers, not quantum hardware or cloud GPUs.

## qBraid execution log

| Field | Value |
|---|---|
| New qBraid job QRN (this task) | `null` |
| New qBraid status | `not_executed` |
| New qBraid shots | 0 |
| New qBraid billing | 0 (no submission) |
| Existing cloud access | verified in earlier experiments; not counted as a new H₂ run |

Before an H₂ cloud run, confirm device is online, permitted free daily quota remains, account has `billing_disabled=1`, and determine the correct backend submission format. One Z-basis circuit alone will not produce the full energy because `XX` needs X-basis measurements.

## Sources

- https://fatqat.readthedocs.io/en/latest/tutorials/vqe-h2/
- https://files.batistalab.com/teaching/attachments/chem584/HF_vic.pdf
- https://qbraid.com/press/gpu-simulators-now-on-qbraid
