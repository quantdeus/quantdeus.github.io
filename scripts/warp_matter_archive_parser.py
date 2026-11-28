#!/usr/bin/env python3
"""Read-only scanner for exported QuantDeus qBraid/D1 JSON.

This is a FORMAT/PROVENANCE scanner, not atomistic reconstruction.
Never submits quantum jobs, accesses API credentials, or computes new physics.

Usage:
  python3 scripts/warp_matter_archive_parser.py exported_d1.json
  cat exported_d1.json | python3 scripts/warp_matter_archive_parser.py -
  python3 scripts/warp_matter_archive_parser.py exported_d1.json --pretty
"""
import argparse
import json
import sys
from pathlib import Path

STRUCTURE_FORMATS = {"cif", "poscar", "contcar", "xyz"}
ELEMENT_KEYS = {"species", "elements", "atomic_numbers", "symbols", "atom_types"}
POSITION_KEYS = {"positions", "cart_coords", "cartesian_coordinates",
                 "atomic_positions", "atomic_coordinates", "coordinates", "coords"}
SITE_KEYS = {"sites", "atoms"}
MEASURE_KEYS = {"measurementcounts", "measurement_counts", "counts"}


def maybe_decode(value):
    """Decode JSON-in-JSON up to three times without executing code."""
    for _ in range(3):
        if not isinstance(value, str):
            return value
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return value
    return value


def iter_records(document):
    value = maybe_decode(document)
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("rows", "records", "jobs"):
            if isinstance(value.get(key), list):
                return value[key]
        # Also handle the conventional D1 query result: [{"results": [...]}].
        result = value.get("result")
        if isinstance(result, list) and result and isinstance(result[0], dict):
            if isinstance(result[0].get("results"), list):
                return result[0]["results"]
        if isinstance(value.get("results"), list):
            return value["results"]
        return [value]
    raise ValueError("Expected JSON object, array of D1 rows, or JSONL")


def is_vector3(value):
    return (isinstance(value, (list, tuple)) and len(value) == 3
            and all(isinstance(v, (int, float)) and not isinstance(v, bool)
                    for v in value))


def structure_reason(obj):
    """Detect potential explicit atomic geometry, never infer geometry from bits."""
    if not isinstance(obj, dict):
        return None
    lower = {str(k).lower(): v for k, v in obj.items()}
    for key in STRUCTURE_FORMATS:
        val = lower.get(key)
        if isinstance(val, str) and val.strip():
            return "structure_text:" + key
    has_elements = any(lower.get(k) is not None for k in ELEMENT_KEYS)
    has_positions = any(lower.get(k) is not None for k in POSITION_KEYS)
    if has_elements and has_positions:
        return "element_identifiers_plus_positions"
    for key in SITE_KEYS:
        sites = lower.get(key)
        if not isinstance(sites, list) or not sites:
            continue
        first = sites[0]
        if not isinstance(first, dict):
            continue
        names = {str(k).lower() for k in first}
        if (names & (ELEMENT_KEYS | {"element", "symbol", "label"})
                and names & (POSITION_KEYS | {"xyz", "position"})):
            return "per_atom_site_geometry"
    if (("element" in lower or "symbol" in lower)
            and (is_vector3(lower.get("xyz")) or is_vector3(lower.get("position")))):
        return "atom_xyz_record"
    return None


def scan_payload(payload):
    """Return only paths and type hints, not sensitive source data."""
    found_structures = []
    measurement_paths = []
    visited = 0

    def walk(obj, path, depth):
        nonlocal visited
        visited += 1
        if depth > 24 or visited > 100000:
            return
        obj = maybe_decode(obj)
        if isinstance(obj, dict):
            reason = structure_reason(obj)
            if reason:
                found_structures.append({"path": path, "reason": reason})
            for key, value in obj.items():
                child_path = path + "." + str(key)
                if str(key).lower() in MEASURE_KEYS and isinstance(value, dict):
                    # Measurement counts are bit-string histograms, NOT atoms.
                    measurement_paths.append(child_path)
                if isinstance(value, (dict, list)) or (
                    isinstance(value, str) and value.lstrip().startswith(("{", "["))):
                    walk(value, child_path, depth + 1)
        elif isinstance(obj, list):
            for idx, item in enumerate(obj[:5000]):
                walk(item, path + "[" + str(idx) + "]", depth + 1)

    walk(payload, "$", 0)
    return {"structure_candidates": found_structures[:100],
            "measurement_paths": measurement_paths[:100],
            "scan_truncated": visited > 100000}


def analyze_document(document):
    rows = iter_records(document)
    output = []
    for idx, row in enumerate(rows):
        obj = maybe_decode(row)
        metadata = obj if isinstance(obj, dict) else {}
        payload = metadata.get("result_json", metadata)
        report = scan_payload(payload)
        status = ("structure_candidate_needs_validation" if report["structure_candidates"]
                  else "measurement_only_no_atomic_geometry"
                  if report["measurement_paths"] else "no_atomic_geometry_found")
        output.append({
            "row_index": idx,
            "mission": metadata.get("mission"),
            "job_qrn": metadata.get("job_qrn"),
            "job_status": metadata.get("status"),
            "classification": status,
            **report,
        })
    return {"mode": "read_only_archive_scan", "source": "existing_export",
            "new_quantum_jobs": 0, "new_scientific_calculations": 0,
            "records": output}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Existing JSON/JSONL export; '-' for stdin")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()
    text = sys.stdin.read() if args.input == "-" else Path(args.input).read_text(encoding="utf-8")
    try:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = [json.loads(line) for line in text.splitlines() if line.strip()]
        report = analyze_document(data)
    except (ValueError, TypeError, OSError) as exc:
        parser.error(str(exc))
    print(json.dumps(report, ensure_ascii=False, indent=2 if args.pretty else None))


if __name__ == "__main__":
    main()
