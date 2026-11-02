import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from warp_matter_discovery_classifier import (
    classify_work, classify_optimade, decode_abstract, scan, safe_get_json,
)


class BananaNobelClassifierTests(unittest.TestCase):
    def test_openalex_inverted_abstract_text_and_classification(self):
        item = {
            "id": "https://openalex.org/W999",
            "doi": "https://doi.org/10.0000/synthetic-test-only",
            "title": "Metamaterial Casimir test",
            "publication_date": "2026-10-31",
            "abstract_inverted_index": {
                "We": [0], "experimentally": [1], "demonstrate": [2],
                "a": [3], "metasurface": [4]
            },
        }
        self.assertEqual(decode_abstract(item), "We experimentally demonstrate a metasurface")
        row = classify_work(item, set(), "2026-10-01")
        self.assertIn("casimir_vacuum", row["topic_labels"])
        self.assertIn("metamaterials", row["topic_labels"])
        self.assertEqual(row["evidence_hint_not_verified"], "experimental_claim_in_text")
        self.assertTrue(row["new_to_catalog"])
        self.assertFalse(row["novel_physics_confirmed"])

    def test_known_doi_is_not_new(self):
        item = {"id": "https://openalex.org/W1", "doi": "https://doi.org/10.0000/known",
                "title": "Topological insulator", "publication_date": "2026-02-01"}
        row = classify_work(item, {"https://doi.org/10.0000/known"}, "2026-01-01")
        self.assertFalse(row["new_to_catalog"])

    def test_theoretical_effect_claim_is_only_hint(self):
        row = classify_work({
            "id": "paper2",
            "title": "Time crystal in a hypothetical system",
            "publication_date": "2026-11-01",
            "abstract": "We predict a Floquet transition.",
        }, set(), "2026-10-01")
        self.assertIn("quantum_emergent", row["topic_labels"])
        self.assertEqual(row["evidence_hint_not_verified"],
                         "theoretical_or_simulation_claim_in_text")
        self.assertFalse(row["novel_physics_confirmed"])

    def test_actual_optimade_schema_and_atomic_geometry(self):
        crystal = {
            "id": "example-structure-id",
            "attributes": {
                "chemical_formula_reduced": "TiO2",
                "elements": ["Ti", "O"], "nsites": 2,
                "species": [{"name": "Ti", "chemical_symbols": ["Ti"]},
                            {"name": "O", "chemical_symbols": ["O"]}],
                "species_at_sites": ["Ti", "O"],
                "cartesian_site_positions": [[0, 0, 0], [0, 0, 2]],
                "lattice_vectors": [[3, 0, 0], [0, 3, 0], [0, 0, 4]],
            },
        }
        row = classify_optimade(crystal)
        self.assertTrue(row["geometry_metadata_consistent"])
        self.assertEqual(row["geometry_coordinate_type"], "cartesian_angstrom")
        self.assertFalse(row["metamaterial_property_confirmed"])

    def test_unmatched_sites_rejected(self):
        crystal = {
            "id": "missing-atoms",
            "attributes": {
                "species": [{"name": "Ti", "chemical_symbols": ["Ti"]}],
                "species_at_sites": ["Ti", "O"],
                "cartesian_site_positions": [[0, 0, 0], [0, 0, 2]],
            },
        }
        self.assertFalse(classify_optimade(crystal)["geometry_metadata_consistent"])

    def test_fractional_lattice_required(self):
        entry = {
            "id": "f",
            "attributes": {"species": [{"name": "C", "chemical_symbols": ["C"]}],
                           "species_at_sites": ["C"],
                           "fractional_site_positions": [[0, 0, 0.5]]},
        }
        self.assertFalse(classify_optimade(entry)["geometry_metadata_consistent"])
        entry["attributes"]["lattice_vectors"] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
        self.assertTrue(classify_optimade(entry)["geometry_metadata_consistent"])

    def test_duplicates_are_deduplicated(self):
        w = {"id": "http://openalex.org/W2", "doi": "https://doi.org/10.0000/synthetic",
             "title": "Quantum anomalous Hall effect",
             "publication_date": "2026-08-01"}
        report = scan([w, w], [], set(), "2026-01-01")
        self.assertEqual(report["counts"]["relevant_unique_publications"], 1)
        self.assertEqual(report["counts"]["verified_new_effects"], 0)
        self.assertEqual(report["counts"]["confirmed_ftl_materials"], 0)
        self.assertFalse(report["automatic_printing"])

    def test_repository_preprint_not_a_verified_discovery(self):
        w = {
            "id": "https://openalex.org/W100",
            "doi": "https://doi.org/10.5281/zenodo.999999",
            "title": "Claimed E8 quantum metamaterial breakthrough",
            "type": "preprint",
            "primary_location": {"source": {"type": "repository"}},
            "publication_date": "2026-10-30",
        }
        row = classify_work(w, set(), "2026-10-01")
        self.assertEqual(row["source_category"], "repository_or_preprint")
        self.assertFalse(row["independent_peer_review_confirmed"])
        self.assertFalse(row["novel_physics_confirmed"])

    def test_journal_indexed_is_not_automatically_verified(self):
        w = {
            "id": "https://openalex.org/W101",
            "doi": "https://doi.org/10.0000/fictional-study",
            "title": "Experimental Casimir metamaterials",
            "primary_location": {"source": {"type": "journal"}},
        }
        row = classify_work(w, set(), "2026-10-01")
        self.assertEqual(row["source_category"], "journal_indexed_not_independently_verified")
        self.assertFalse(row["independent_peer_review_confirmed"])

    def test_no_private_or_unapproved_remote_requests(self):
        with self.assertRaises(ValueError):
            safe_get_json("https://example.com/structures")
        with self.assertRaises(ValueError):
            safe_get_json("http://api.openalex.org/works")


if __name__ == "__main__":
    unittest.main()
