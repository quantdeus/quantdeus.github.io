import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from warp_matter_k3_audit import audit, render_report


class K3ArchiveAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.archive = json.loads((ROOT / "research/warp-matter/archives/qbraid-existing-20261024-25.json").read_text(encoding="utf-8"))
        cls.catalog = json.loads((ROOT / "coordination/research/warp-matter-k3-literature.json").read_text(encoding="utf-8"))

    def test_all_eight_real_archived_jobs_are_measured_not_atoms(self):
        rows, _ = audit(self.archive, self.catalog)
        self.assertEqual(len(rows), 8)
        self.assertEqual({row["classification"] for row in rows},
                         {"measurement_only_no_atomic_geometry"})
        self.assertEqual(len({row["mission"] for row in rows}), 8)
        self.assertTrue(all(row["job_status"] == "COMPLETED" for row in rows))

    def test_catalog_provenance(self):
        _, leads = audit(self.archive, self.catalog)
        self.assertEqual(len(leads), 6)
        self.assertTrue(all(lead["ftl_validation"] == "none" for lead in leads))
        self.assertTrue(all(lead["reference_url"].startswith("https://") for lead in leads))

    def test_report_has_safe_replicator_gate(self):
        report = render_report(self.archive, self.catalog)
        self.assertIn("**BLOCKED**", report)
        self.assertIn("**новых qBraid-задач 0**", report)
        self.assertIn("**8**", report)

    def test_fabricated_ftl_claim_is_rejected(self):
        bad = json.loads(json.dumps(self.catalog))
        bad["leads"][0]["ftl_validation"] = "proven"
        with self.assertRaises(ValueError):
            audit(self.archive, bad)


if __name__ == "__main__":
    unittest.main()
