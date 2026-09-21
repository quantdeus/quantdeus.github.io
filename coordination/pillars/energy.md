# Energy opportunity register

Evidence-first register for the **Future Energy** public pillar. Grades describe the maturity of the cited evidence, not investment advice or a claim of commercial readiness.

## Grade rubric

- **A** — demonstrated/independently documented system-level result or active field test from a primary institution.
- **B** — strong laboratory/program evidence with a material scale-up, durability, cost, or schedule gap.
- **C** — credible research program / target whose decisive system-level evidence is still pending.

## 1. Enhanced geothermal systems (EGS) — open-data replication and cost learning

- **Evidence grade:** A
- **Primary source:** U.S. Department of Energy, Utah FORGE, accessed 2026-09-21: https://www.energy.gov/hgeo/geothermal/forge
- **Fresh evidence:** DOE reports that FORGE began an extended circulation test in August 2026; sustained circulation is a critical longevity test. The program also reports >133 TB of public data as of May 2026 and a seven-fold reduction in on-bottom drilling time at an equivalent 6,000-ft depth across its drilling-learning sequence.
- **What this supports:** EGS is an experimentally active field with unusually rich public operational data that QuantDeus can analyze without claiming commercial success.
- **Falsifier / failure condition:** sustained circulation fails to maintain useful thermal/hydraulic performance, induced-seismicity constraints prevent practical operation, or full-system cost reductions do not survive replication outside the FORGE setting.
- **Next executable action:** create a small reproducible notebook/data note using public FORGE/GDR data that tracks circulation duration, thermal drawdown, flow/pressure and drilling-time metrics; publish only metrics traceable to dataset identifiers.

## 2. Perovskite/silicon tandem photovoltaics — efficiency versus durability/manufacturability gate

- **Evidence grade:** B
- **Primary sources:** NREL tandem roadmap, 2024, https://www.nrel.gov/news/detail/program/2024/nrel-researchers-outline-path-forward-for-tandem-solar-cells ; NREL perovskite stability result, 2022, https://www.nrel.gov/news/detail/press/2022/nrel-led-breakthrough-pushes-perovskite-cell-to-greater-stability-efficiency
- **Evidence:** NREL describes metal-halide perovskites as a promising top-cell route for higher-efficiency hybrid tandems while explicitly identifying long-term stability as an open research problem. A separate NREL result reported a certified stabilized 24% inverted perovskite cell retaining 87% of initial efficiency after 2,400 h at 55 °C. These are laboratory/device results, not proof of bankable tandem modules.
- **What this supports:** a high-value monitoring/benchmark opportunity focused on the gap between record efficiency and deployable module lifetime/manufacturing.
- **Falsifier / failure condition:** tandem modules fail accelerated and field durability gates, scalable manufacturing erases the efficiency advantage, or levelized-energy gains fail to compensate for added process/material cost.
- **Next executable action:** maintain a provenance table of independently certified tandem efficiency, test duration/conditions, module area and manufacturing method; require module-scale durability evidence before upgrading this opportunity to grade A.

## 3. Magnetic-confinement fusion / ITER — integration evidence watch, not near-term power claim

- **Evidence grade:** C
- **Primary source:** ITER 2024 baseline summary, https://www.iter.org/sites/default/files/media/2024-07/baseline_press_conference_summary_july-2024_b.pdf
- **Evidence:** the revised baseline targets Start of Research Operation in 2034, full magnetic energy in 2036 and the start of deuterium-tritium operation in 2039. ITER's program goal remains integrated burning-plasma operation (500 MW thermal fusion output for 50 MW plasma heating, Q>=10), but this is a target rather than a completed result.
- **What this supports:** a long-horizon integration/evidence watch relevant to the ~15-year scenario, not a 24-month deployment promise.
- **Falsifier / failure condition:** further schedule/integration slippage removes decision value for the QuantDeus horizon, key plasma-facing/magnet/heating/disruption-mitigation systems miss commissioning gates, or DT operation fails to demonstrate the planned integrated performance.
- **Next executable action:** create a milestone watcher keyed only to official ITER commissioning events (SRO, DD, full magnetic energy, DT) and record schedule changes separately from physics results.

## Portfolio decision

For the 24-month **Epidemic of Good** program, EGS has the highest immediate value of information because public field data can yield a reproducible QuantDeus artifact now. Tandem PV is second: monitor certified performance versus durability and manufacturing. ITER belongs to the long-horizon evidence watch; it must not be represented as available energy production.

## Red-team rule

A press release, funding announcement, efficiency record, schedule milestone or simulation is a **signal**, not a breakthrough by itself. Upgrade an opportunity only when the evidence required by its falsifier is actually observed.
