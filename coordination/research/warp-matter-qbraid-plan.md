# QuantDeus Warp Matter — qBraid research plan (2026-11-02)

**Issue:** #655 · **Owner:** Seven of Nine · **Execution:** read-only research branch `research/warp-matter-h2-20261102`.

## What exists

- Cloudflare Workers `quantdeus-qbraid-mcp` and `quantdeus-warp-research` exist.
- D1 `quantdeus-quantum-quota` holds verified previously completed qBraid GPU simulator jobs, most recently dated 2026-10-25.
- A read of the latest D1 `quota_snapshots` entry (2026-11-02T06:00:25Z) returned authenticated HTTP 200, `billing_disabled=1`, general remaining=900, GPU remaining=50. **Quotas are snapshots, not a job reservation or guarantee.**
- Six tasks linked to #655 were recorded in Cloudflare D1 `quantdeus-swarm-metaverse.tasks` with `status=queued`. Insertion is not proof that an LLM executor consumed the queue.

## Research phases

1. **Local demonstrator** — run two-qubit H₂ electronic Hamiltonian (published STO-3G 0.735 Å parity-reduced coefficients), exact analytical block diagonalization, parametrized ansatz, seeded Monte-Carlo sampling.
2. **Reproducibility QA** — test electronic and total energy, ansatz accuracy, reproducible sampling, OpenQASM 2 generation.
3. **Cloud qBraid** — review the qBraid API and **only when a no-cost path and a permitted orchestrator are confirmed**, submit a single small measurement circuit to `qbraid:qbraid:sim:gpu-sv`; record the real QRN, shots, cost, status, output. Do not claim the two-circuit electronic energy from only one circuit. A separate X measurement will require another approved simulator task.
4. **Materials research** — consider 3–5 small benchmark systems (H₂, LiH, BeH₂, lightweight hydrogen-containing clusters, model defect configurations), but derive new Hamiltonians only with validated quantum chemistry and explicitly account for spin, basis, geometry, and convergence.
5. **FTL boundary** — keep molecular binding energy, energy storage density, and quantum-vacuum stress-energy distinct. Compare any spacetime claims with equations of general relativity and published energy-condition constraints.
6. **Commercial review** — potential applications are education, workflows for reproducible simulation and materials research. No sale of a working warp engine or representations of FTL capability. No unsolicited outreach.

## Acceptance

- Every numeric result has input constants, methodology, units, provenance, test and execution status.
- Use CPU baseline first; compare cloud results against it; avoid false claims of quantum advantage.
- Spend = 0: no paid QPU, no billing enablement, no arbitrary retries.
- Open draft PR, human review before merge; published QuantDeus site unaffected.

## References

- [qBraid GPU simulators, Oct 19 2026](https://qbraid.com/press/gpu-simulators-now-on-qbraid)
- [qBraid API docs](https://docs.qbraid.com/v2/api-reference/user-guide/overview)
- [qBraid job cost quote](https://docs.qbraid.com/v2/api-reference/rest/get-quantum-jobs-cost-estimate)
- [H₂ tapered two-qubit Hamiltonian tutorial](https://fatqat.readthedocs.io/en/latest/tutorials/vqe-h2/)
- [Existing verified qBraid test](./quantum-first-actual-run-2026-10-25.md)
- [Warp Genesis](https://github.com/quantdeus/quantdeus.github.io/issues/603)
