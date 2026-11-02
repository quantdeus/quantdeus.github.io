#!/usr/bin/env python3
"""BANANA NOBEL LAB — provenance-first discovery triage.

Classifies existing OpenAlex work records and OPTIMADE structure entries.
"New" means new to the local bibliography, NEVER verified new physics.

No quantum simulations, no science parameter optimization, no fabrication.
Networking is opt-in (--fetch-openalex, --fetch-optimade-url), bounded and read-only.
"""
import argparse
import datetime as dt
import json
import math
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

TOPICS = {
    "casimir_vacuum": ("casimir", "vacuum fluctuation", "quantum vacuum"),
    "metamaterials": ("metamaterial", "metamaterials", "metasurface", "metasurfaces",
                      "negative refraction", "negative refractive", "negative index",
                      "hyperbolic material", "photonic crystal", "photonic crystals"),
    "topological_quantum": ("topological insulator", "topological superconductor",
                            "quantum anomalous hall", "weyl semimetal", "chern insulator"),
    "quantum_emergent": ("time crystal", "floquet", "non hermitian", "quantum entanglement",
                         "quantum energy teleportation", "quantum geometry"),
}
OPENALEX_QUERIES = ("metamaterial", "quantum Casimir", "topological quantum material")
SAFE_DOMAINS = {"api.openalex.org", "optimade.materialscloud.org"}
EXPERIMENTAL = ("we experimentally", "experimental demonstration", "experimentally demonstrate",
                "we measured", "experimental observation", "experimentally observe")
THEORETICAL = ("we theoretically", "we predict", "theoretical prediction",
               "numerical simulation", "first principles", "ab initio", "we propose")


def safe_get_json(url, timeout=12):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in SAFE_DOMAINS:
        raise ValueError("Remote source not on approved HTTPS allowlist")
    req = Request(url, headers={"User-Agent": "QuantDeus-BananaResearch/1.0 (read-only; scientific indexing)",
                                "Accept": "application/json"})
    try:
        with urlopen(req, timeout=timeout) as resp:
            # Fixed 2 MiB maximum; never blindly load large datasets.
            data = resp.read(2_000_001)
            if len(data) > 2_000_000:
                raise ValueError("Response larger than 2 MiB safety cap")
            return json.loads(data)
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError("Read-only source query failed: " + str(exc)) from exc


def fetch_openalex(since, per_query=8):
    if not 1 <= per_query <= 10:
        raise ValueError("per_query must stay at or below 10")
    works = []
    for query in OPENALEX_QUERIES:
        params = {
            "search": query,
            "filter": "from_publication_date:" + since,
            "sort": "publication_date:desc",
            "per_page": per_query,
        }
        result = safe_get_json("https://api.openalex.org/works?" + urlencode(params))
        works += result.get("results", [])
    return works


def decode_abstract(item):
    inverted = item.get("abstract_inverted_index") or {}
    if not isinstance(inverted, dict) or not inverted:
        return ""
    slots = []
    for word, positions in inverted.items():
        if not isinstance(positions, list):
            continue
        for p in positions:
            if isinstance(p, int) and 0 <= p < 20000:
                slots.append((p, str(word)))
    return " ".join(word for _, word in sorted(slots))


def keyword_match(term, text):
    return bool(re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text))


def classify_work(item, known_ids, since):
    title = str(item.get("title") or item.get("display_name") or "").strip()
    abstract = decode_abstract(item) or str(item.get("abstract") or "")
    text = (title + " " + abstract).lower()
    tags = [name for name, words in TOPICS.items() if any(keyword_match(w, text) for w in words)]
    if not tags:
        return None
    key = str(item.get("doi") or item.get("id") or "").strip()
    if not key:
        return None
    document_type = str(item.get("type") or "")
    if "review" in title.lower() or document_type == "review":
        evidence = "review_or_synthesis_mentioned"
    elif any(w in text for w in EXPERIMENTAL):
        evidence = "experimental_claim_in_text"
    elif any(w in text for w in THEORETICAL):
        evidence = "theoretical_or_simulation_claim_in_text"
    else:
        evidence = "unknown_from_metadata"
    date = str(item.get("publication_date") or "")
    published_in_window = bool(date and date >= since)
    source = item.get("doi") or item.get("id")
    source_meta = (item.get("primary_location") or {}).get("source") or {}
    source_type = str(source_meta.get("type") or "").lower()
    doi = str(item.get("doi") or "").lower()
    work_type = str(item.get("type") or "").lower()
    if ("10.5281/zenodo" in doi or source_type == "repository"
            or work_type in {"preprint", "posted-content"}):
        source_category = "repository_or_preprint"
    elif source_type == "journal":
        source_category = "journal_indexed_not_independently_verified"
    else:
        source_category = "other_or_unspecified"
    return {
        "id": key,
        "title": title,
        "publication_date": date,
        "new_to_catalog": key.lower() not in known_ids,
        "recent_publication": published_in_window,
        "novel_physics_confirmed": False,
        "evidence_hint_not_verified": evidence,
        "source_category": source_category,
        "independent_peer_review_confirmed": False,
        "reproducibility_confirmed": False,
        "topic_labels": tags,
        "atomic_geometry_present": False,
        "linked_source": source,
        "manual_review_required": True,
    }


def valid_vec3(vector):
    return (isinstance(vector, list) and len(vector) == 3
            and all(isinstance(c, (float, int)) and not isinstance(c, bool)
                    and math.isfinite(c) for c in vector))


def classify_optimade(item):
    attrs = item.get("attributes") or {}
    source_id = item.get("id")
    if not isinstance(attrs, dict) or source_id is None:
        return None
    coords = attrs.get("cartesian_site_positions")
    basis = "cartesian_angstrom"
    if coords is None:
        coords = attrs.get("fractional_site_positions")
        basis = "fractional"
    species_at_sites = attrs.get("species_at_sites")
    species = attrs.get("species") or []
    map_species = {}
    for spec in species:
        if isinstance(spec, dict) and spec.get("name"):
            map_species[spec["name"]] = spec.get("chemical_symbols") or []
    geometry_valid = (isinstance(coords, list) and bool(coords)
                      and all(valid_vec3(v) for v in coords)
                      and isinstance(species_at_sites, list)
                      and len(species_at_sites) == len(coords)
                      and all(s in map_species for s in species_at_sites))
    # Do not treat fractional coords as Cartesian or infer a novel material.
    lattice = attrs.get("lattice_vectors")
    if basis == "fractional":
        geometry_valid = geometry_valid and isinstance(lattice, list) and len(lattice) == 3 and all(valid_vec3(v) for v in lattice)
    elements = attrs.get("elements") or []
    return {
        "id": str(source_id),
        "formula": attrs.get("chemical_formula_reduced"),
        "elements": elements if isinstance(elements, list) else [],
        "sites": len(coords) if isinstance(coords, list) else None,
        "geometry_coordinate_type": basis if coords is not None else "none",
        "geometry_metadata_consistent": bool(geometry_valid),
        "source_type": "OPTIMADE_existing_database_entry",
        "metamaterial_property_confirmed": False,
        "ftl_confirmed": False,
        "manual_review_required": True,
    }


def scan(works, structures, known_ids, since):
    seen = set()
    papers = []
    for w in works:
        row = classify_work(w, known_ids, since)
        if row and row["id"].lower() not in seen:
            seen.add(row["id"].lower())
            papers.append(row)
    materials = []
    seen_struct = set()
    for s in structures:
        row = classify_optimade(s)
        if row and row["id"] not in seen_struct:
            seen_struct.add(row["id"])
            materials.append(row)
    return {
        "pipeline": "BANANA_NOBEL_LAB_read_only_classification",
        "novelty_definition": "new_to_this_catalog_NOT_new_to_physics",
        "published_from": since,
        "counts": {
            "input_publications": len(works),
            "relevant_unique_publications": len(papers),
            "new_to_catalog": sum(int(w["new_to_catalog"]) for w in papers),
            "input_structure_entries": len(structures),
            "consistent_atomic_geometries": sum(int(s["geometry_metadata_consistent"]) for s in materials),
            "verified_new_effects": 0,
            "confirmed_ftl_materials": 0,
        },
        "papers": papers,
        "structures": materials,
        "decision": "HUMAN_SCIENTIFIC_REVIEW_REQUIRED",
        "new_quantum_jobs": 0,
        "automatic_printing": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--works", help="OpenAlex export JSON file (contains results array)")
    parser.add_argument("--structures", help="OPTIMADE JSON export (contains data array)")
    parser.add_argument("--known", help="Optional prior known IDs, a JSON array")
    parser.add_argument("--since", default="2026-01-01")
    parser.add_argument("--fetch-openalex", action="store_true",
                        help="Opt-in, max 3 keyless HTTPS queries, stop on errors")
    parser.add_argument("--fetch-optimade-url", help="Opt-in trusted OPTIMADE HTTPS URL")
    parser.add_argument("--output", help="Write JSON to this local path")
    args = parser.parse_args()
    dt.date.fromisoformat(args.since)
    if not args.works and not args.structures and not args.fetch_openalex and not args.fetch_optimade_url:
        parser.error("Supply an existing export or an explicitly requested remote source")
    works = []
    structures = []
    known = set()
    if args.known:
        known = {str(k).lower() for k in json.loads(Path(args.known).read_text(encoding="utf-8"))}
    if args.works:
        document = json.loads(Path(args.works).read_text(encoding="utf-8"))
        works.extend(document["results"] if isinstance(document, dict) else document)
    if args.structures:
        document = json.loads(Path(args.structures).read_text(encoding="utf-8"))
        structures.extend(document["data"] if isinstance(document, dict) else document)
    if args.fetch_openalex:
        works.extend(fetch_openalex(args.since))
    if args.fetch_optimade_url:
        document = safe_get_json(args.fetch_optimade_url)
        structures.extend(document.get("data", []))
    result = scan(works, structures, known, args.since)
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8")
    else:
        print(text)


if __name__ == "__main__":
    main()
