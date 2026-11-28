"""QuantDeus #659: classical benchmark of ONE k-point in 4D Dirac toy lattice.

No quantum hardware or qBraid account is contacted. Requires numpy.
QASM circuit in replicator-4d-trotter.qasm is a first-order Trotter draft.
"""
import math
import numpy as np

I = np.eye(2, dtype=complex)
X = np.array([[0,1],[1,0]], dtype=complex)
Y = np.array([[0,-1j],[1j,0]], dtype=complex)
Z = np.array([[1,0],[0,-1]], dtype=complex)

gamma = [np.kron(X,X), np.kron(X,Y), np.kron(X,Z),
         np.kron(Y,I), np.kron(Z,I)]

def model(k, mass):
    coefficients = [math.sin(x) for x in k]
    coefficients.append(mass + sum(math.cos(x) for x in k))
    return sum((c*g for c,g in zip(coefficients,gamma)), np.zeros((4,4),complex))

def rotation(pauli, theta):
    return math.cos(theta)*np.eye(4)-1j*math.sin(theta)*pauli

def benchmark():
    for i in range(5):
        for j in range(5):
            assert np.allclose(gamma[i]@gamma[j] + gamma[j]@gamma[i],
                               (2 if i==j else 0)*np.eye(4))
    h = model((math.pi/2, math.pi/2, 0., 0.), 0.5)
    eig, vec = np.linalg.eigh(h)
    assert np.allclose(eig, [-math.sqrt(8.25)]*2+[math.sqrt(8.25)]*2)
    t, n = 0.4, 4
    exact = (vec * np.exp(-1j*eig*t)) @ vec.conj().T
    # Gate order per step matches qasm file: XX, XY, ZI
    step = (rotation(gamma[4], 2.5*t/n)
            @ rotation(gamma[1], t/n)
            @ rotation(gamma[0], t/n))
    approx = np.linalg.matrix_power(step,n)
    init = np.array([1.,0.,0.,0.],dtype=complex)
    pe = abs(exact@init)**2
    pt = abs(approx@init)**2
    error = float(max(abs(pe-pt)))
    assert error < 0.01
    assert np.isclose(sum(pe),1.) and np.isclose(sum(pt),1.)
    print("Eigenvalues:", eig.tolist())
    print("Exact probabilities (00,01,10,11):", pe.tolist())
    print("Trotter probabilities:", pt.tolist())
    print("Maximum absolute error:", error)
    print("Cloud qBraid run: NOT SUBMITTED. Topological invariant: NOT COMPUTED.")

if __name__ == "__main__":
    benchmark()
