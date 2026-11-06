import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "research" / "warp-ftl-materials"))
from compare import (C, G, EXPECTED, alcubierre_energy, film_areal_mass,
                     run, write_results)


def fixture(id_, formula, species):
    a = 3.0
    expected_sites = EXPECTED[id_][1]
    seq = (species * (expected_sites // len(species) + 1))[:expected_sites]
    return {"id": id_, "attributes": {
        "chemical_formula_reduced": formula,
        "cartesian_site_positions": [[0, 0, 0]] * expected_sites,
        "lattice_vectors": [[a, 0, 0], [0, a, 0], [0, 0, 24]],
        "species": [{"name": s, "chemical_symbols": [s], "concentration": [1.0]}
                    for s in set(species)],
        "species_at_sites": seq,
        "nsites": expected_sites,
    }}


class WarpToyTests(unittest.TestCase):
    def test_metric_integral_negative_for_nonzero_speed(self):
        e = alcubierre_energy(1)
        self.assertLess(e, 0)
        self.assertGreater(abs(e), 1e42)
        self.assertEqual(alcubierre_energy(0), 0)

    def test_speed_squared_scaling(self):
        self.assertAlmostEqual(alcubierre_energy(2)/alcubierre_energy(0.5), 16)

    def test_integral_matches_thin_wall_order(self):
        actual = abs(alcubierre_energy(1))
        approximate = C**4/G * (10**2)/(36*1)
        self.assertLess(abs(actual/approximate-1), 0.1)

    def test_sheet_mass_ignores_padded_vacuum_axis(self):
        id_ = next(iter(EXPECTED))
        entry = fixture(id_, "IrNbTe4", ["Ir", "Nb", "Te"])
        m = film_areal_mass(entry)["areal_mass_kg_m2"]
        entry["attributes"]["lattice_vectors"][2] = [0, 0, 9000]
        self.assertEqual(m, film_areal_mass(entry)["areal_mass_kg_m2"])

    def test_materials_do_not_change_metric_energy(self):
        pairs = [("IrNbTe4", ["Ir", "Nb", "Te"]),
                 ("AsCuLi2", ["As", "Cu", "Li"]),
                 ("INTi", ["I", "N", "Ti"])]
        entries = {id_: fixture(id_, *pairs[i])
                   for i, id_ in enumerate(EXPECTED)}
        rows = run(entries)
        self.assertEqual(len(rows), 9)
        e2 = [r["metric_energy_J"] for r in rows if r["beta_v_over_c"] == 2]
        self.assertEqual(len(set(e2)), 1)
        self.assertTrue(all(not x["ftl_demonstrated"] for x in rows))
        self.assertTrue(all(not x["material_generates_negative_energy"] for x in rows))
        with tempfile.TemporaryDirectory() as tmp:
            write_results(tmp, rows)
            self.assertEqual(len(json.loads((Path(tmp)/"results.json").read_text())["results"]), 9)
            self.assertIn("не служит источником", (Path(tmp)/"report.md").read_text())

    def test_mixed_occupancy_fails_closed(self):
        id_ = next(iter(EXPECTED))
        item = fixture(id_, "IrNbTe4", ["Ir", "Nb", "Te"])
        item["attributes"]["species"][0]["concentration"] = [0.8]
        with self.assertRaises(ValueError):
            film_areal_mass(item)


if __name__ == "__main__":
    unittest.main()
