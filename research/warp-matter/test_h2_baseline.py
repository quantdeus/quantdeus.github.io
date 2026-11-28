import unittest
import h2_baseline as m


class H2BenchTests(unittest.TestCase):
    def test_reference_electronic_energy(self):
        self.assertAlmostEqual(m.exact_energy(), -1.85727503020238, places=10)

    def test_reference_total_energy(self):
        self.assertAlmostEqual(m.benchmark(100, 11)['reference_total_hartree'], -1.13730603577653, places=10)

    def test_variational_principle(self):
        self.assertGreaterEqual(m.energy(0), m.exact_energy() - 1e-12)
        self.assertAlmostEqual(m.energy(m.optimal_angle()), m.exact_energy(), places=12)

    def test_reproducibility(self):
        self.assertEqual(m.sample_energy(1000, 42), m.sample_energy(1000, 42))

    def test_qasm_has_measurements(self):
        for basis in ('z', 'x'):
            code = m.qasm(basis)
            self.assertIn('OPENQASM 2.0;', code)
            self.assertEqual(code.count('measure q['), 2)
        self.assertIn('h q[0];', m.qasm('x'))


if __name__ == '__main__':
    unittest.main()
