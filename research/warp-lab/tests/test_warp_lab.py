import sys
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import warp_lab


class WarpLabPhysicsQA(unittest.TestCase):
    """Regression checks for the original Alcubierre metric, not a viable drive."""

    def test_center_and_far_field(self):
        f, _ = warp_lab.shape_and_derivative(np.array([0.0, 1.0, 3.0]))
        self.assertAlmostEqual(float(f[0]), 1.0, places=6)
        self.assertLess(float(f[-1]), 1e-6)

    def test_shape_derivative_finite_difference(self):
        radii = np.array([0.25, 0.75, 1.0, 1.25, 1.75])
        eps = 1e-5
        analytic = warp_lab.shape_and_derivative(radii)[1]
        fd = (warp_lab.shape_and_derivative(radii + eps)[0]
              - warp_lab.shape_and_derivative(radii - eps)[0]) / (2 * eps)
        np.testing.assert_allclose(analytic, fd, atol=1e-6, rtol=1e-5)

    def test_negative_energy_at_bubble_wall(self):
        coord = np.array([0.8, 1.0, 1.2])
        rho = warp_lab.eulerian_energy_density(
            np.zeros_like(coord), coord, np.zeros_like(coord), v=1.0)
        self.assertTrue(np.all(rho < 0))

    def test_velocity_square_scaling(self):
        y = np.array([0.9, 1.0, 1.1])
        zero = np.zeros_like(y)
        e1 = warp_lab.eulerian_energy_density(zero, y, zero, v=0.5)
        e2 = warp_lab.eulerian_energy_density(zero, y, zero, v=1)
        np.testing.assert_allclose(e2, 4*e1, rtol=1e-12)

    def test_zero_speed_no_exotic_energy(self):
        y = np.array([0.8, 1.0, 1.2])
        zero = np.zeros_like(y)
        rho = warp_lab.eulerian_energy_density(zero, y, zero, v=0)
        self.assertTrue(np.allclose(rho, 0))

    def test_axis_transverse_gradient_zero(self):
        x = np.array([-1.0, -0.8, 0.8, 1.0])
        zero = np.zeros_like(x)
        rho = warp_lab.eulerian_energy_density(x, zero, zero, v=1)
        self.assertTrue(np.allclose(rho, 0))

    def test_no_claim_of_physical_ftl(self):
        y = np.array([1.0])
        zero = np.zeros_like(y)
        self.assertLess(float(warp_lab.eulerian_energy_density(
            zero, y, zero, v=2)[0]), 0)

    def test_evidence_gate_does_not_claim_ftl(self):
        import json
        d = json.loads(
            (Path(__file__).resolve().parents[1] / "evidence-gates.json")
            .read_text(encoding="utf-8"))
        self.assertEqual(len(d["gates"]), 10)
        self.assertEqual(d["gates"]["geometry"]["status"], "PASS")
        for gate, record in d["gates"].items():
            if gate != "geometry":
                self.assertNotEqual(record["status"], "PASS",
                                    f"{gate} requires independent evidence")
        self.assertEqual(d["physical_FTL_demonstrated"], False)


if __name__ == "__main__":
    unittest.main()
