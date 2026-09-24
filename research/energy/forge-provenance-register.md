# Utah FORGE provenance register — Energy P2

Status: evidence/provenance gate, not a performance claim.

## Sherlock question

The August 2026 DOE announcement says Utah FORGE began a months-long extended circulation test. Three competing hypotheses are kept live:

1. **H1 — 2026 operational dataset is already public.** A GDR submission exposes machine-readable time-series from the 2026 months-long test.
2. **H2 — metadata/announcement is public, operational dataset is not yet public.** We can verify that the test started, but cannot yet reproduce its performance.
3. **H3 — older datasets are being mistaken for the 2026 test.** 2023/2024/2025 circulation records are useful pipeline fixtures but cannot validate 2026 sustained-circulation performance.

Current result: **H2 is the conservative working state.** Authoritative sources verify the 2026 test start, while the provenance search below found reproducible earlier FORGE circulation datasets but no verified GDR identifier for the new 2026 months-long operational series.

## Provenance candidates

| Stable ID / URL | Publisher | Date | Type | What it can establish | What it cannot establish |
|---|---|---:|---|---|---|
| DOE: `energy.gov/hgeo/geothermal/articles/running-hot-keeping-cool-forge-embarks-extended-circulation-test` | U.S. DOE Office of Geothermal | 2026-08-17 | **announcement** | 2026 extended test started; planned ramp to 10 bpm; months-long injection/production; intended observables include pressure/production stability, water recovery and heat extraction | No machine-readable 2026 time series; no completed-test performance claim |
| GDR submission **1683**, DOI **10.15121/2475065** | Geothermal Data Repository / Energy & Geoscience Institute, University of Utah | 2024-10-11 (updated 2024-10-29) | **dataset + report** | Raw, uncorrected 2024 extended-circulation measurements at 30 s intervals; calibration for temperature, pressure and flow; wells 16A/16B | Not the 2026 months-long test |
| GDR submission **1575**, DOI **10.15121/2283227** | Geothermal Data Repository / Energy & Geoscience Institute, University of Utah | 2023 | **dataset + reports** | Raw/processed 2023 low-rate circulation data including injection pressure/rate, produced rate, temperature and pressure variables | Not 2026; different test regime |
| GDR submission **1826**, `gdr.openei.org/submissions/1826` | Geothermal Data Repository / Neubrex Energy Services | 2026-03/05 | **processed dataset + report** | Calibrated DTS temperature/depth/time arrays from August 2025 circulation and huff-and-puff operations | Not the 2026 extended circulation operational series; temperature sensing alone is insufficient for full energy balance |
| GDR submission **1766**, `gdr.openei.org/submissions/1766` | Geothermal Data Repository / Rice University | 2025-09-05 | **simulation dataset** | Meshes/model results for 26-day and 365-day circulation scenarios; pressure/temperature distributions and permeability scenarios | Simulation is not observation of the 2026 test |
| Utah FORGE Data Dashboard: `utahforge.com/project-data-dashboard/` | Utah FORGE / University of Utah | current | **metadata/index** | States FORGE project data are public through GDR and indexes well/stimulation/data areas | Index alone is not a 2026 dataset |

### Provenance rule

An **announcement**, dashboard, simulation, or derived interpretation is never promoted to `dataset evidence`. A performance claim requires a stable dataset identifier plus downloadable machine-readable observations and enough calibration/metadata to reproduce the metric.

## Parser-ready minimum schema

Until a 2026 dataset is verified, fields specific to it remain `UNKNOWN`.

| Canonical field | Meaning | Minimum unit/encoding | 2026 verified? |
|---|---|---|---|
| `timestamp` | observation time | ISO-8601 with timezone/offset | UNKNOWN |
| `injection_flow_rate` | injected fluid rate | bpm or SI-convertible | UNKNOWN |
| `production_flow_rate` | produced fluid rate | bpm or SI-convertible | UNKNOWN |
| `injection_pressure` | wellhead/downhole injection pressure, explicitly tagged | psi or Pa | UNKNOWN |
| `production_pressure` | production pressure, explicitly tagged | psi or Pa | UNKNOWN |
| `injection_temperature` | injected-fluid temperature | °F/°C/K | UNKNOWN |
| `production_temperature` | produced-fluid temperature | °F/°C/K | UNKNOWN |
| `water_recovery` | produced/injected water recovery metric | dimensionless or documented % | UNKNOWN |
| `source_submission_id` | GDR or equivalent stable ID | string | UNKNOWN |
| `source_file` | exact file/member name | string | UNKNOWN |
| `calibration_state` | raw / corrected / calibration reference | enum + provenance | UNKNOWN |
| `quality_flag` | missing/suspect/calibrated state | source-defined + mapped enum | UNKNOWN |

The parser must preserve original column names, units, timezone and calibration state alongside normalized fields. Missing variables stay null/UNKNOWN; they are never inferred from a press release.

## Falsification / acceptance gate for 2026 performance

Do **not** claim that the 2026 extended test demonstrates stable commercial-relevant circulation, reservoir longevity, stable heat extraction, or project economics unless all of the following are available:

1. a stable authoritative submission/DOI (preferably GDR) explicitly tied to the **2026 months-long extended circulation test**;
2. downloadable machine-readable time series spanning a meaningful fraction of the test, with timestamps and at minimum flow + pressure + temperature observables or a documented reason a variable is absent;
3. calibration/correction documentation and unambiguous well/sensor provenance;
4. reproducible calculations for any claimed stability, recovery or thermal-power metric, including missing-data handling and uncertainty;
5. an explicit distinction between measured observations, corrected/derived quantities, model outputs and interpretation.

If item 1 is absent, the status is **BLOCKED: 2026 operational dataset not yet provenance-verified**. Earlier GDR datasets may be used only to smoke-test ingestion code.

## Next executable step

Search GDR for a submission explicitly dated/titled for the 2026 extended circulation campaign. If found, freeze its submission ID/DOI and file manifest before writing the parser. If not found, use GDR 1683 solely as a schema/parser fixture and keep all 2026 performance fields UNKNOWN.
