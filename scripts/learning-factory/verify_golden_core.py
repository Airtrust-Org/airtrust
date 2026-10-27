#!/usr/bin/env python3
"""Fail-closed AirTrust Learning Factory golden core verifier (no ZIP extraction)."""

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

# Public SHA-256 locks only: private Golden Master source is NOT stored in Git.
GOLDEN_MASTER_VERSION = "AIRTRUST_GOLDEN_MASTER_CORE_V2_2026-09-27"
PINNED_CORE = {
    "app.js": "e2000b5acb09eb1fb380e7c88998869d1ba32d5d983a775a119f9527a05a53f0",
    "styles.css": "44c87afba940ecc0ee5c7ffeac66dad9bca6f69c1567d4f9469dcccee3613719",
    "scorm_api.js": "a64806dc8fe9e9c422b69a01f66e2145f28883cdb8f76b7c27f26f244c219bfb",
}
# Core V3 is a separately pinned *engine version*, not an exception to V2.
# Pinning only proves immutable core bytes. QA/attestation and Worker-owned
# assessment policy remain mandatory for any candidate or publication.
FORMATIVE_V3_VERSION = "AIRTRUST_GOLDEN_MASTER_CORE_V3_RC4_NO_FINAL_EXAM_CANDIDATE"
PINNED_FORMATIVE_V3 = {
    **PINNED_CORE,
    "app.js": "66e46d3ec3baf3c331a92d48037148a429fec7ca5eb137c0ff93a2344ce69a98",
}
REGISTERED_VERSIONS = {
    GOLDEN_MASTER_VERSION: PINNED_CORE,
    FORMATIVE_V3_VERSION: PINNED_FORMATIVE_V3,
}
REQUIRED_METADATA = ("imsmanifest.xml", "airtrust-completion-manifest.json")
MAX_CORE_BYTES = 512 * 1024


def verify_golden_core(zip_path: Path, hashes=None):
    errors = []
    file_results = {}
    version = GOLDEN_MASTER_VERSION
    with zipfile.ZipFile(zip_path, "r") as package:
        entries = package.infolist()
        by_path = {}
        for item in entries:
            if item.is_dir():
                continue
            # Canonical factory ZIP paths must not contain a leading folder.
            # Duplicate names are prohibited (ZipFile.read(name) is ambiguous).
            by_path.setdefault(item.filename, []).append(item)
        # A private ZIP cannot select its own digest. The version declaration
        # is matched to immutable hashes registered in this reviewed script.
        # Explicit hashes are available only to the in-process test harness.
        if hashes is None and len(by_path.get("airtrust-completion-manifest.json", [])) == 1:
            item = by_path["airtrust-completion-manifest.json"][0]
            if item.file_size > 64 * 1024:
                errors.append("airtrust-completion-manifest.json:TOO_LARGE")
            else:
                try:
                    with package.open(item) as stream:
                        metadata = json.load(stream)
                    if not isinstance(metadata, dict):
                        raise ValueError("manifest must be an object")
                    declared = metadata.get("factoryCoreVersion", GOLDEN_MASTER_VERSION)
                    if not isinstance(declared, str) or declared not in REGISTERED_VERSIONS:
                        errors.append("factoryCoreVersion:UNREGISTERED")
                    else:
                        version = declared
                except (ValueError, UnicodeError, json.JSONDecodeError):
                    errors.append("airtrust-completion-manifest.json:INVALID_JSON")
        expected = hashes if hashes is not None else REGISTERED_VERSIONS[version]
        for path in (*REQUIRED_METADATA, *expected):
            rows = by_path.get(path, [])
            if len(rows) != 1:
                errors.append(f"{path}:expected_exactly_one_found_{len(rows)}")
                continue
            if path not in expected:
                continue
            if rows[0].file_size > MAX_CORE_BYTES:
                errors.append(f"{path}:core_too_large")
                continue
            with package.open(rows[0]) as raw:
                digest = hashlib.sha256(raw.read(MAX_CORE_BYTES + 1)).hexdigest()
            ok = digest == expected[path]
            file_results[path] = {"matches": ok, "sha256": digest}
            if not ok:
                errors.append(f"{path}:CORE_DRIFT")

    return {
        "golden_master_version": version,
        "zip_sha256": hashlib.sha256(zip_path.read_bytes()).hexdigest(),
        "core_lock_pass": not errors,
        "files": file_results,
        "errors": errors,
        "scope": "immutable factory engine only; not a functional SCORM certification",
    }


def main():
    parser = argparse.ArgumentParser(description="Verify frozen AirTrust Factory core in a generated SCORM ZIP")
    parser.add_argument("zip", type=Path)
    args = parser.parse_args()
    try:
        result = verify_golden_core(args.zip)
    except (OSError, zipfile.BadZipFile, RuntimeError, ValueError) as exc:
        result = {"core_lock_pass": False, "errors": [f"invalid_zip:{type(exc).__name__}"]}
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["core_lock_pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
