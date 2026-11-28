#!/usr/bin/env python3
"""QuantDeus: three real 2D crystal sheets vs a prescribed Alcubierre geometry.

It numerically evaluates the negative Eulerian energy of *one prescribed metric*
and compares its magnitude to rest energies of idealized one-layer material shells.
The 2D materials DO NOT produce negative energy or an FTL mechanism.
No quantum hardware, qBraid, DFT, paid services, optimization or fabrication.

Source (structures): Materials Cloud "2dtopo" via OPTIMADE v1, first 3 known IDs.
Reproduce: python3 research/warp-ftl-materials/compare.py --out /tmp/warp-ftl
"""
import argparse
import csv
import json
import math
from pathlib import Path
from urllib.request import Request, urlopen

C = 299792458.0                # m/s, exact
G = 6.67430e-11               # SI, CODATA 2018 recommended
AMU = 1.66053906660e-27       # kg
ATOMIC_WEIGHT = {             # atomic mass in u, rounded standard representative values
    "Ir": 192.217, "Nb": 92.90637, "Te": 127.60,
    "As": 74.921595, "Cu": 63.546, "Li": 6.94,
    "I": 126.90447, "N": 14.007, "Ti": 47.867,
}
EXPECTED = {
    "0021c3ee-6f98-47cf-ab1c-b267ff8203b6": ("IrNbTe4", 12),
    "103ef076-8ff8-4afc-be44-2fc305de930d": ("AsCuLi2", 8),
    "115567c8-e9ad-4623-ab6f-a980aa951df0": ("INTi", 6),
}
OPTIMADE_URL = "https://optimade.materialscloud.org/main/2dtopo/v1/structures?page_limit=3"
BETA = (0.5, 1.0, 2.0)  # prescribed coordinate speeds v/c, not measured speeds
RADIUS_M = 10.0
WALL_WIDTH_M = 1.0


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1],
            a[2]*b[0]-a[0]*b[2],
            a[0]*b[1]-a[1]*b[0])


def film_areal_mass(entry):
    """Nominal sheet mass per area, not spurious 3D density in a vacuum-padded cell."""
    attrs = entry["attributes"]
    coords = attrs["cartesian_site_positions"]
    species_at = attrs["species_at_sites"]
    descriptors = attrs["species"]
    lattice = attrs["lattice_vectors"]
    if not len(lattice) == 3 or any(len(v) != 3 for v in lattice):
        raise ValueError("No 3x3 lattice")
    if not len(coords) == len(species_at) == attrs.get("nsites", len(coords)):
        raise ValueError("Coordinate/species mismatch")
    # The 2dtopo provider uses the first two lattice vectors for the sheet plane.
    raw_area = math.sqrt(sum(v*v for v in cross(lattice[0], lattice[1])))
    if not math.isfinite(raw_area) or raw_area <= 1.0:
        raise ValueError("Nonphysical sheet unit area")
    names = {}
    for d in descriptors:
        symbols = d.get("chemical_symbols") or []
        concentration = d.get("concentration") or [1.0]
        if len(symbols) != 1 or len(concentration) != 1 or abs(concentration[0]-1.0) > 1e-6:
            raise ValueError("Mixed/disordered occupancy: not in this comparison")
        names[d["name"]] = symbols[0]
    symbol_list = []
    for i, site in enumerate(coords):
        if len(site) != 3 or not all(math.isfinite(float(x)) for x in site):
            raise ValueError("Bad atom coordinates")
        if species_at[i] not in names:
            raise ValueError("Unknown species")
        symbol = names[species_at[i]]
        if symbol not in ATOMIC_WEIGHT:
            raise ValueError("Atomic mass for species not in verified table: " + symbol)
        symbol_list.append(symbol)
    mass_cell = AMU * sum(ATOMIC_WEIGHT[s] for s in symbol_list)
    area_m2 = raw_area * 1e-20  # Å² to m²
    return {"formula": attrs.get("chemical_formula_reduced"),
            "sites": len(coords), "elements": sorted(set(symbol_list)),
            "area_a2": raw_area,
            "mass_cell_kg": mass_cell,
            "areal_mass_kg_m2": mass_cell / area_m2}


def simpson(f, a, b, n=8000):
    """Numerical radial quadrature, even subdivisions."""
    if n <= 0 or n % 2:
        raise ValueError("Simpson requires an even number of subdivisions")
    h = (b-a)/n
    s = f(a) + f(b)
    for i in range(1, n):
        s += (4 if i%2 else 2) * f(a+i*h)
    return s*h/3


def alcubierre_energy(beta, radius=RADIUS_M, width=WALL_WIDTH_M):
    """Formal Eulerian stress energy integral for a tanh-shaped Alcubierre shift.

    f(r)=[1-tanh((r-R)/width)]/2.
    u_Eulerian = -(c^4/G)*beta^2/(32*pi)*(df/dr)^2*sin(theta)^2
    E = -(c^4/G)*beta^2/12 * integral_0^inf (df/dr)^2*r^2 dr.
    Integrate locally around shell, ±12 widths (tails exponentially tiny).
    This does NOT establish a realizable source for the required negative energy.
    """
    if beta < 0 or width <= 0 or radius <= 0:
        raise ValueError("Bad metric parameters")
    def radial_integrand(r):
        x = (r-radius)/width
        df = -0.5 / (width*math.cosh(x)**2)
        return (df*df)*r*r
    lo = max(0.0, radius-12*width)
    hi = radius+12*width
    integral = simpson(radial_integrand, lo, hi)
    return -(C**4/G)*(beta**2)*integral/12


def fetch_real_crystals():
    req = Request(OPTIMADE_URL, headers={"Accept":"application/json",
                                         "User-Agent":"QuantDeus-Warp-Research-ReadOnly/1.0"})
    with urlopen(req, timeout=20) as response:
        data = response.read(1_500_001)
        if len(data)>1_500_000:
            raise ValueError("OPTIMADE response exceeds size limit")
    entries = json.loads(data)["data"]
    got = {x["id"]:x for x in entries}
    missing = set(EXPECTED) - set(got)
    if missing:
        raise ValueError("Source returned different page IDs; fail closed: " + str(sorted(missing)))
    for id_, (_, num_sites) in EXPECTED.items():
        if len(got[id_]["attributes"]["cartesian_site_positions"]) != num_sites:
            raise ValueError("Unexpected atom count at " + id_)
    return got


def run(entries):
    output=[]
    for id_, (display, count) in EXPECTED.items():
        v=film_areal_mass(entries[id_])
        if v["sites"] != count:
            raise ValueError("Site mismatch")
        for beta in BETA:
            exotic=alcubierre_energy(beta)
            sheet_mass=v["areal_mass_kg_m2"]*4*math.pi*RADIUS_M**2
            rest_j=sheet_mass*C**2
            output.append({
                "source_id":id_, "nominal_formula":display, "sites":v["sites"],
                "elements":v["elements"], "cell_area_A2":v["area_a2"],
                "areal_mass_kg_m2":v["areal_mass_kg_m2"],
                "shell_radius_m":RADIUS_M, "metric_wall_width_m":WALL_WIDTH_M,
                "beta_v_over_c":beta, "metric_energy_J":exotic,
                "metric_negative_energy_magnitude_J":abs(exotic),
                "single_sheet_shell_mass_kg":sheet_mass,
                "positive_rest_energy_J":rest_j,
                "energy_magnitude_ratio_not_convertible":abs(exotic)/rest_j,
                "ftl_demonstrated":False, "material_generates_negative_energy":False,
            })
    return output


def write_results(out_dir, results):
    path=Path(out_dir)
    path.mkdir(parents=True, exist_ok=True)
    (path/"results.json").write_text(json.dumps({
        "kind":"theoretical_metric_energy_comparison",
        "source":OPTIMADE_URL,
        "science":"Alcubierre metric, tanh profile, Eulerian negative energy; ideal one-layer spherical surface mass",
        "scope":"numerical quadrature of prescribed metric; source crystals not claimed to generate stress-energy",
        "limits":"2D film curvature/defects and material stability not modeled; no FTL implementation; negative energy cannot be replaced by rest energy",
        "results":results
    },indent=2)+"\n",encoding="utf-8")
    with (path/"results.csv").open("w",newline="",encoding="utf-8") as fh:
        writer=csv.DictWriter(fh,fieldnames=list(results[0]))
        writer.writeheader()
        writer.writerows(results)
    lines=["# BANANA LAB — три 2D материала против метрики Алькубьерре","",
        "**Модель:** R=10 м, ширина варп-стенки 1 м, скорости 0,5c, 1c, 2c; "
        "теоретическая метрика и масса одного атомного слоя.",
        "",
        "| Материал | Атомов | Площадь ячейки, Å² | Масса слоя, мг/м² | v/c | E отриц., Дж | E покоя оболочки, Дж | |E-|/E+ |",
        "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for r in results:
        lines.append("| {nominal_formula} | {sites} | {cell_area_A2:.3f} | {massmg:.4f} | {beta_v_over_c:g} | {metric_energy_J:.3e} | {positive_rest_energy_J:.3e} | {energy_magnitude_ratio_not_convertible:.3e} |".format(
            massmg=r["areal_mass_kg_m2"]*1e6,**r))
    lines += ["","**Вывод:** Одна и та же предписанная метрика даёт одну и ту же отрицательную энергию "
       "для всех материалов. Различается только масса слоя. Ни один материал в этой "
       "модели не служит источником отрицательной энергии. Оценка энергии метрики не "
       "является доказательством FTL, установкой или инженерным проектом.",
       "","**Ссылки:** OPTIMADE 2dtopo https://optimade.materialscloud.org/main/2dtopo "
       "; Alcubierre (1994) https://doi.org/10.1088/0264-9381/11/5/001 "
       "; Fuchs et al. (2024, subluminal) https://doi.org/10.1088/1361-6382/ad26aa",
       ""]
    (path/"report.md").write_text("\n".join(lines),encoding="utf-8")
    return lines


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",help="Local OPTIMADE JSON export; otherwise use bounded read-only fetch")
    parser.add_argument("--out",default="/tmp/warp-ftl-three-materials")
    args=parser.parse_args()
    if args.input:
        doc=json.loads(Path(args.input).read_text(encoding="utf-8"))
        entries={x["id"]:x for x in doc["data"]}
    else:
        entries=fetch_real_crystals()
    results=run(entries)
    lines=write_results(args.out,results)
    print("\n".join(lines))
    print("OUTPUT",args.out)


if __name__=="__main__":
    main()
