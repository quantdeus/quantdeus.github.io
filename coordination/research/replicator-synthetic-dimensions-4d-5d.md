# QuantDeus #659 — 4D synthetic-dimension Dirac model (2026-11-02)

**Status:** local classical exact benchmark DONE; QASM2 draft generated; **qBraid job NOT submitted** (no new job QRN). `CLOUD_STATUS=blocked_gateway` pending a verified safe submission path. No production Workers changed.

## Grounded scientific basis
The 2025 *Physical Review Letters* experimental four-dimensional acoustic metamaterial combines three real momentum dimensions with one geometric parameter. **A synthetic dimension does not mean a physical fourth spatial dimension.** Primary source: https://doi.org/10.1103/PhysRevLett.134.186601

The toy 4D lattice Dirac Hamiltonian uses five mutually anticommuting matrices:
- Gamma1 = X⊗X, Gamma2 = X⊗Y, Gamma3 = X⊗Z, Gamma4 = Y⊗I, Gamma5 = Z⊗I.
- H(k) = sum_i sin(k_i) Gamma_i + [m + sum_i cos(k_i)] Gamma5.
- Test k = (pi/2,pi/2,0,0); m = 0.5 -> H = XX + XY + 2.5 ZI (two qubits).
- This is one sampled momentum point, **not** an established second Chern number or discovered material.

## Checked local exact spectrum
Eigenvalues in natural dimensionless units: (-2.872281323269014, -2.872281323269014, 2.872281323269014, 2.872281323269014).

Time evolution from |q1 q0>=|00> for t=0.4 and first-order Trotter with four steps:

| bitstring | Classical exact probability | Trotter QASM model |
|:--|--:|--:|
| 00 | 0.798223929507 | 0.789088674773 |
| 01 | ≈0 | 0 |
| 10 | ≈0 | 0 |
| 11 | 0.201776070493 | 0.210911325227 |

Max absolute distribution error **0.009135254735**. These are calculated probabilities **not** measured qBraid output or quantum speedup.

QASM2 file: `coordination/research/replicator-4d-trotter.qasm`, 2 qubits, 4 Trotter layers, 1024 shots recommended if free-only gateway enabled. Circuit contains only H/S/Sdg/CX/RZ and final measurements.

## Next gates
1. Literature team searches measured 4D/5D photonic/acoustic/cold atom systems, separates model parameters from spatial axes, and records primary DOI, quantitative observation, and fabrication pathways.
2. Compare exact 2-qubit dynamics to QASM GPU simulator **only** when verified free entitlement and enabled secure dispatch; no QPU, no paid fallback; capture resulting job QRN/cost/status then.
3. Extend to a k-space mesh and independently cross-checked topological response; one k point cannot show topology.
4. A Star Trek-style energy-to-Earl-Grey replicator requires unsolved processes for element/particle generation, chemical/molecular construction, mass-energy and thermal control. Nothing here demonstrates that possibility.

**Protection:** independent research branch only; no updates to published site, qBraid Worker, or #655.
