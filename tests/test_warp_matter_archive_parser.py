import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from warp_matter_archive_parser import analyze_document


class ArchiveParserTest(unittest.TestCase):
    def test_qbraid_histogram_not_atoms(self):
        records = [{"mission": "NX01-QET-ZB", "job_qrn": "qjob-123",
                    "status": "COMPLETED",
                    "result_json": json.dumps({
                        "status": "COMPLETED", "cost": "0",
                        "measurementCounts": {"00": 269, "01": 276,
                                              "10": 766, "11": 737}
                    })}]
        report = analyze_document(records)
        row = report["records"][0]
        self.assertEqual(row["classification"], "measurement_only_no_atomic_geometry")
        self.assertEqual(row["structure_candidates"], [])
        self.assertEqual(row["measurement_paths"], ["$.measurementCounts"])
        self.assertEqual(report["new_quantum_jobs"], 0)

    def test_explicit_species_and_positions(self):
        data = [{"result_json": {"unit_cell": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
                                  "species": ["H", "H"],
                                  "positions": [[0, 0, 0], [0, 0, 0.735]]}}]
        row = analyze_document(data)["records"][0]
        self.assertEqual(row["classification"], "structure_candidate_needs_validation")
        self.assertEqual(row["structure_candidates"][0]["reason"],
                         "element_identifiers_plus_positions")

    def test_embedded_nested_json_and_sites(self):
        data = {"result": [{"results": [{
            "mission": "example",
            "result_json": json.dumps({
                "payload": {"sites": [{"element": "Si", "xyz": [0, 0, 0]}]}
            })
        }]}]}
        report = analyze_document(data)
        self.assertEqual(report["records"][0]["mission"], "example")
        self.assertIn("per_atom_site_geometry",
                      [v["reason"] for v in report["records"][0]["structure_candidates"]])

    def test_no_invented_structure(self):
        row = analyze_document([{"result_json": {"status": "COMPLETED",
                                                  "timeStamps": {"endedAt": "2026-10-25"}}}])["records"][0]
        self.assertEqual(row["classification"], "no_atomic_geometry_found")


if __name__ == "__main__":
    unittest.main()
