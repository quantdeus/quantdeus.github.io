# QuantDeus // Neon Horizon v4 Portal Architecture

Status: **staging / reversible prototype**

## Canon
1. `coordination/civilization-doctrine.json` — canonical machine-readable v4 doctrine.
2. `coordination/manifesto-living.md` — adaptive layer; cannot silently rewrite v4.
3. `docs/POST_SCARCITY_DOCTRINE.md` — measurable scarcity reduction.
4. WordPress is the canonical application/CMS runtime; GitHub remains canonical for source/CI/evidence.

## Portal model
The public experience is a portal/dashboard, not a sales landing page: QuantDeus state, Federation/Nodes, Horizons, Research, Projects, AI Fleet, Community/Forum/EXIT, Services, Ksenia media/booking, Media, News/Living Manifest, Knowledge/Open Artifacts/Results, Manifesto, About and Account/Login.

## WordPress model
CPTs: `qd_node`, `qd_project`, `qd_research`, `qd_artifact`, `qd_result`, `qd_service`, `qd_inquiry`, `qd_forum_thread`, `qd_evidence`.
Taxonomies: `qd_horizon`, `qd_pillar`, `qd_research_domain`.

Federation Interface v1: Identity/Owner, Mission, Evidence Grade, Artifacts, Metrics, Replication, Safety, EXIT, Governance, Human Override.
Research Evidence Contract: FACT, EVIDENCE, HYPOTHESIS, UNKNOWN, NEXT TEST, FALSIFIER + Grade A/B/C.

## Authentication invariant
- Telegram / QuantDeus Store Bot → ordinary member only.
- GitHub repo write/maintain → `qd_moderator`.
- GitHub repo admin → WordPress `administrator`.
- Telegram never elevates staff.
- Raw GitHub tokens never enter the browser.
- Privileged actions stay under Human Override.

## Visual and evidence rules
Day/Earth = Frutiger Aero. Night/Horizon = Cosmic Y2K/Synthwave. Star Trek is a civilizational language reference, not a copied protected UI. Real source-attributed imagery is used on the portal.
Observed counts may be displayed. Outcome KPIs without data show **UNKNOWN / NOT MEASURED**.

## Production gate
This branch is staging. Cutover requires syntax, WordPress Playground install, CPT/taxonomy/page/menu contracts, auth invariants, guest request smoke, forum smoke, mobile/desktop UI smoke, real imagery check, and owner-approved production deployment followed by production smoke.

Evidence labels: **LIVE VERIFIED / CODE VERIFIED / AUTOMATED TEST VERIFIED / OWNER INPUT REQUIRED**.
