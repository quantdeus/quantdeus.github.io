# 🍌 QuantDeus BANANA NOBEL LAB — Evidence Classifier (2026-11-02)

## Scope
A reproducible Python classifier of **existing public scientific records**, not an automated scientific discovery machine.

- OpenAlex: searches *published/indexed* works in metamaterials, quantum Casimir and topological quantum materials; reconstructs abstracts from the `abstract_inverted_index` structure when present.
- OPTIMADE: reads existing crystal entries with their published `species`, `species_at_sites`, lattice and Cartesian/fractional site coordinates; preserves validated coordinate snapshots of at most 128 atom sites per entry.
- Fails closed on inconsistent coordinates/species; only simple shape validation, **not** diffraction or physical characterization.
- Categorizes theoretical claims, experimental claims **in metadata**, reviews and repository-only preprints. **No automatic peer-review verification**.
- DOI deduplication and known-ID catalog filter. `new_to_catalog` does not mean `novel_physics_confirmed`.
- No VQE, no qBraid POST, no paid QPU, no autonomous 3D printing or commercial claims.

## Reproduction (stdlib-only)

```bash
python3 -m unittest discover -s tests -p 'test_warp_matter_*.py' -v

# Read-only remote public queries: 3 small OpenAlex searches + 1 OPTIMADE page.
python3 scripts/warp_matter_discovery_classifier.py \
  --since 2026-09-01 \
  --fetch-openalex \
  --fetch-optimade-url 'https://optimade.materialscloud.org/main/2dtopo/v1/structures?page_limit=3' \
  --known research/warp-matter/catalog/known-paper-dois.json \
  --output /tmp/warp-matter-discovery.json

# Or classify saved exports offline, without any remote requests:
python3 scripts/warp_matter_discovery_classifier.py \
  --works openalex-export.json --structures optimade-export.json \
  --known research/warp-matter/catalog/known-paper-dois.json
```

## Quality workflow for Data / Sherlock / Tuvok

1. **Data:** classify and deduplicate DOI, extract source material ID and atomic coordinates with original coordinate basis (Å vs fractional).
2. **Sherlock:** check novelty against the historical record and original paper—not only the locally seeded known-ID file. Flag Zenodo and repository-only materials as preprints without independent validation.
3. **Tuvok:** review peer-review status, measurements, error bars, independent replication, thermodynamics and relativity. Do not equate unusual electromagnetic properties with negative gravitational stress energy.
4. **Seven:** move genuinely interesting claims into human-review PRs with DOI, structure ID, original data/source license and proof. No automatic fabrication release.

**Acceptance for a candidate:** at least a verifiable citation and valid geometry source; *for an actual physical discovery*, independent experimental evidence, appropriate uncertainty and replicability are needed.

## Automation safety
- GitHub Actions runs tests and a small read-only survey on pushes to the dedicated research branch and on PRs. JSON + Markdown evidence is held as a **downloadable workflow artifact**; nothing is deployed to quantdeus.ru.
- A prospective **weekly Monday UTC cron** is defined in the PR, but scheduled workflows only run from the repository default branch. It is **not enabled for production until owner explicitly approves merging**.
- Default no-key OpenAlex requests stay within the basic free/start budget (3 results pages of max 8 works each); remote errors stop the action rather than triggering additional paid requests.
- 0 qBraid compute jobs, 0 paid quantum runs, 0 print jobs.
- On later approved runs, update the known-DOI catalog only after human validation; otherwise a locally unseen paper will continue to be labeled new to *that* catalog.

## API provenance
- OpenAlex works API: https://help.openalex.org/api/
- OpenAlex search: https://help.openalex.org/api/searching/
- OpenAlex date filters: https://help.openalex.org/api/filtering/
- OPTIMADE structure schema: https://www.optimade.org/specification/latest/
- Materials Cloud OPTIMADE 2dtopo provider: https://www.optimade.org/providers-dashboard/providers/mcloud.html

## Clarification
A Kardashev Type III **civilization** is a galaxy-scale energy-use classification, not a type of metamaterial. The classifier is a research-prioritization instrument, not proof of practical FTL technology or Nobel-level discovery.
