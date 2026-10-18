"""QuantDeus Warp Lab v0.1: Alcubierre Eulerian energy density diagnostic.
Natural/geometrized units G=c=1. Research/teaching model, not a drive design.
See Alcubierre (1994), Class. Quantum Grav. 11, L73–L77.
"""
import argparse
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt

def shape_and_derivative(r, R=1.0, sigma=8.0):
    """Alcubierre spherical top-hat shape function and radial derivative."""
    norm = 2 * np.tanh(sigma * R)
    a, b = sigma * (r + R), sigma * (r - R)
    f = (np.tanh(a) - np.tanh(b)) / norm
    df = sigma * (1 / np.cosh(a)**2 - 1 / np.cosh(b)**2) / norm
    return f, df

def eulerian_energy_density(x, y, z, v=1.0, R=1.0, sigma=8.0):
    """rho_E = -v^2/(32*pi) * [ (d_y f)^2 + (d_z f)^2 ].

    This applies to the original Alcubierre metric, not arbitrary warp geometries.
    """
    r = np.sqrt(x*x + y*y + z*z)
    _, df = shape_and_derivative(r, R, sigma)
    transverse_fraction = np.divide(
        y*y + z*z, r*r, out=np.zeros_like(r, dtype=float), where=(r > 0)
    )
    return -(v*v / (32*np.pi)) * df*df * transverse_fraction

def make_plot(speed, folder):
    x = np.linspace(-2.2, 2.2, 401)
    y = np.linspace(-2.2, 2.2, 401)
    X, Y = np.meshgrid(x, y)
    rho = eulerian_energy_density(X, Y, np.zeros_like(X), v=speed)
    fig, ax = plt.subplots(figsize=(8, 6.8))
    im = ax.imshow(rho, origin="lower", extent=(x.min(), x.max(), y.min(), y.max()))
    ax.set(xlabel="x / R", ylabel="y / R",
           title=f"Alcubierre: Eulerian energy density, v={speed:g} c, z=0\n"
                 "(G=c=R=1; negative density implies a WEC violation)")
    ax.set_aspect("equal")
    fig.colorbar(im, ax=ax, label="Energy density (geometrized units)")
    fig.tight_layout()
    dst = folder / "alcubierre_energy_density.png"
    fig.savefig(dst, dpi=160)
    plt.close(fig)
    return rho

def self_test():
    r = np.array([0.0, 1.0, 3.0])
    f, _ = shape_and_derivative(r)
    assert abs(f[0]-1) < 1e-6, f[0]
    assert f[-1] < 1e-6, f[-1]
    x = np.array([0.0, 0.0, 0.0])
    y = np.array([0.3, 1.0, 1.2])
    z = np.zeros(3)
    rho = eulerian_energy_density(x, y, z, v=0.5)
    assert np.all(rho <= 0) and np.any(rho < 0)
    rho2 = eulerian_energy_density(x, y, z, v=1.0)
    assert np.allclose(rho2, 4*rho)
    rho0 = eulerian_energy_density(x, y, z, v=0.0)
    assert np.allclose(rho0, 0.0)
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--v", type=float, default=1.0,
                        help="coordinate speed v_s/c; 2 means formal superluminal case")
    parser.add_argument("--output", default=".",
                        help="folder for generated plot and metrics")
    args = parser.parse_args()
    folder = Path(args.output)
    folder.mkdir(parents=True, exist_ok=True)
    self_test()
    rho = make_plot(args.v, folder)
    print("Self-test: PASS")
    print(f"Speed: {args.v} c")
    print(f"Minimum Eulerian energy density: {rho.min():.7g} (G=c=R=1)")
    print("WEC violation detected:", bool(np.any(rho < -1e-12)))
    print("This does NOT demonstrate a physically realizable warp drive.")
