# QuantDeus UI Audit Contract — Synthwave × Frutiger Aero

Tracks #128. Source tokens: `docs/design-system.md`.

This contract makes the existing design grammar **verifiable without redesigning or publishing production**.

## Audit target

A UI surface passes only when every applicable required check below has evidence. Evidence may be a source excerpt, computed contrast ratio, browser screenshot, or automated test output.

| ID | Area | Required check | PASS condition |
|---|---|---|---|
| UI-T01 | Typography | sans/mono hierarchy is explicit | primary sans stack exists; mono stack exists where code/data is shown |
| UI-T02 | Typography | text scale is bounded | xs/sm/md/lg/xl or equivalent documented scale exists |
| UI-S01 | Spacing | spacing scale is reusable | at least 5 ordered spacing tokens/values |
| UI-S02 | Radius | radius scale is reusable | small/medium/large + pill or equivalent |
| UI-N01 | Neon/night | dark background and neon accents are separated semantically | background/surface/text/accent can be identified independently |
| UI-A01 | Aero | light/sky/water/green palette exists | at least one sky, water and green semantic choice |
| UI-C01 | Contrast | normal text meets WCAG AA | contrast ratio >= 4.5:1 |
| UI-C02 | Contrast | large text meets WCAG AA | contrast ratio >= 3:1 |
| UI-F01 | Focus | keyboard focus is visible | visible focus indicator in both dark and light themes |
| UI-M01 | Motion | reduced-motion path exists when motion is used | `prefers-reduced-motion` disables/reduces non-essential animation |
| UI-R01 | Redundancy | status is not color-only | status meaning also has text/icon/shape |
| UI-E01 | Evidence boundary | visual authority does not imply scientific validity | research claims remain evidence-labelled separately |

## How to audit an existing surface

1. Read the surface's CSS/HTML without changing it.
2. Map its local variables to the semantic concepts in `docs/design-system.md`.
3. Compute foreground/background contrast with WCAG relative luminance.
4. Check keyboard focus styles and reduced-motion handling.
5. Record PASS / FAIL / N/A per ID with source evidence.
6. A FAIL becomes a concrete UI bug/task; it does not justify silently redesigning production.

## Read-only sample audit — `telegram/index.html`

Checked against the current repository source on 2026-09-29. No production file was modified.

| Check | Result | Evidence |
|---|---|---|
| UI-T01 | PASS | Inter/system sans stack is explicit; no code-heavy surface requires mono in the sampled UI |
| UI-T02 | PARTIAL | responsive heading sizes exist, but the canonical `--qd-text-*` scale is not adopted directly |
| UI-S01 | PARTIAL | spacing is consistently structured but mostly literal values rather than canonical `--qd-space-*` tokens |
| UI-S02 | PARTIAL | repeated 8px radii exist, but canonical radius tokens are not adopted directly |
| UI-N01 | PASS | dark theme separates `--bg`, `--panel`, `--text`, `--muted`, `--accent` |
| UI-A01 | PASS | light theme uses sky/water-like background/accent values and clear light surfaces |
| UI-C01 | PASS for sampled pairs | light text/background: `#112231` on `#eaf7ff` ≈ **14.84:1**; muted `#5d7383` on `#eaf7ff` ≈ **4.53:1**; dark text/background: `#edf9ff` on `#07131d` ≈ **17.50:1**; dark muted `#9fc1d6` on `#07131d` ≈ **9.89:1** |
| UI-C02 | PASS for sampled button pair | `#00131f` on `#00a6ff` ≈ **7.10:1** |
| UI-F01 | NEEDS VERIFICATION | sampled CSS has button styling but no explicit global `:focus-visible` contract |
| UI-M01 | FAIL | sampled source contains animated signal flow but no `prefers-reduced-motion` rule in the inspected CSS |
| UI-R01 | PASS for status panel | online state uses both a status dot and explicit text |
| UI-E01 | PASS | sampled UI presentation does not change research evidence state |

## Concrete follow-up from the sample

The contract exposes two actionable gaps without touching production:

1. add explicit `:focus-visible` treatment to interactive controls;
2. add `@media (prefers-reduced-motion: reduce)` behavior for non-essential animations.

Those changes should be handled in a separate implementation task/PR if approved. This Issue remains about the **audit contract**, not a silent production redesign.

## Verification rule

Issue #128 can move to review when:

- this contract is linked from the Issue;
- QA confirms the checklist is internally consistent;
- at least one current UI surface has a recorded audit (provided above).

DONE still requires reviewer acceptance; publication is not part of this task.
