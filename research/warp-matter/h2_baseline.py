#!/usr/bin/env python3
"""QuantDeus Warp Matter: reproducible 2-qubit H2 STO-3G benchmark.

This solves a PUBLISHED, already-tapered Hamiltonian. It does not derive
an atomic structure, perform ab initio quantum chemistry, or run qBraid.
No third-party Python dependencies are needed.
"""
import argparse
import json
import math
import random

HARTREE_TO_EV = 27.211386245988
BOHR_ANGSTROM = 0.529177210903
BOND_LENGTH_ANGSTROM = 0.735
# I, Z on q1, Z on q0, ZZ, XX; bitstrings are q1 q0.
C0 = -1.052373245772859
C_Z1 = 0.39793742484318045
C_Z0 = -0.39793742484318045
C_ZZ = -0.01128010425623538
C_XX = 0.18093119978423156


def block_diagonals():
    """Electronic Hamiltonian on the |01>, |10> block."""
    state_01 = C0 + C_Z1 - C_Z0 - C_ZZ
    state_10 = C0 - C_Z1 + C_Z0 - C_ZZ
    return state_01, state_10


def energy(theta):
    """Ansatz cos(theta)|10> - sin(theta)|01> (electronic Hartree)."""
    state_01, state_10 = block_diagonals()
    return (state_10 * math.cos(theta) ** 2
            + state_01 * math.sin(theta) ** 2
            - 2 * C_XX * math.sin(theta) * math.cos(theta))


def exact_energy():
    """Exact lowest eigenvalue of the 2x2 block (analytic diagonalization)."""
    state_01, state_10 = block_diagonals()
    return (state_01 + state_10) / 2 - math.hypot((state_01 - state_10) / 2, C_XX)


def optimal_angle():
    state_01, state_10 = block_diagonals()
    return 0.5 * math.atan2(2 * C_XX, state_01 - state_10)


def qasm(basis):
    """OpenQASM 2 state preparation and Z or X basis measurement for qBraid."""
    if basis not in ('z', 'x'):
        raise ValueError('basis must be z or x')
    gates = [
        'OPENQASM 2.0;',
        'include "qelib1.inc";',
        'qreg q[2];',
        'creg c[2];',
        'x q[1];',
        f'ry({-2 * optimal_angle():.15f}) q[0];',
        'cx q[0],q[1];',
    ]
    if basis == 'x':
        gates += ['h q[0];', 'h q[1];']
    return '\n'.join(gates + ['measure q[0] -> c[0];', 'measure q[1] -> c[1];', ''])


def sample_energy(shots=8192, seed=20261102):
    """Local Python Monte-Carlo samples for Z/X circuits, not cloud/qBraid jobs."""
    if shots <= 0:
        raise ValueError('shots must be positive')
    rng = random.Random(seed)
    theta = optimal_angle()
    # Z-basis: outcomes |10> / |01>.
    z = ['10' if rng.random() < math.cos(theta) ** 2 else '01'
         for _ in range(shots)]
    # X-basis: parity measures the XX correlator.
    xx_true = -math.sin(2 * theta)
    x_parity = [1 if rng.random() < (1 + xx_true) / 2 else -1
                for _ in range(shots)]
    z1 = sum(1 if bits[0] == '0' else -1 for bits in z) / shots
    z0 = sum(1 if bits[1] == '0' else -1 for bits in z) / shots
    zz = sum(1 if bits[0] == bits[1] else -1 for bits in z) / shots
    xx = sum(x_parity) / shots
    e = C0 + C_Z1 * z1 + C_Z0 * z0 + C_ZZ * zz + C_XX * xx
    return {'seed': seed, 'shots_per_basis': shots, 'local_sample_electronic_hartree': e,
            'sample_abs_error_hartree': abs(e - exact_energy()),
            'expectations': {'Z1': z1, 'Z0': z0, 'ZZ': zz, 'XX': xx}}


def benchmark(shots=8192, seed=20261102):
    repulsion = BOHR_ANGSTROM / BOND_LENGTH_ANGSTROM
    hf = block_diagonals()[1]
    exact = exact_energy()
    vqe = energy(optimal_angle())
    return {
        'system': 'H2', 'basis': 'STO-3G', 'bond_length_angstrom': BOND_LENGTH_ANGSTROM,
        'source_type': 'published_already_tapered_2_qubit_hamiltonian',
        'reference_exact_electronic_hartree': exact,
        'hf_basis_state_electronic_hartree': hf,
        'ansatz_electronic_hartree': vqe,
        'ansatz_error_hartree': abs(vqe - exact),
        'nuclear_repulsion_hartree': repulsion,
        'reference_total_hartree': exact + repulsion,
        'reference_total_eV': (exact + repulsion) * HARTREE_TO_EV,
        'optimized_theta_radians': optimal_angle(),
        'sampling': sample_energy(shots, seed),
        'execution': {'local_baseline': True, 'cloud_qbraid': 'not_executed',
                      'qbraid_job_qrn': None, 'paid_jobs': 0},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shots', type=int, default=8192)
    parser.add_argument('--seed', type=int, default=20261102)
    parser.add_argument('--qasm', choices=['z', 'x'])
    args = parser.parse_args()
    print(qasm(args.qasm) if args.qasm else json.dumps(benchmark(args.shots, args.seed), indent=2))


if __name__ == '__main__':
    main()
