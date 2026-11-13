#!/usr/bin/env python3
"""Immutable, no-network PTO Rev.10 V18 normative contract guard.

Guards the exact document-derived table transcription. This does NOT authorize
operational guides or import. Optional --pto independently validates the source
DOCX bytes and exact session transcription when the approved document is present.
"""
import argparse
import collections
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_DIR = ROOT / "pto-v18-canonical"
EXPECTED_SOURCE_SHA = "040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912"
EXPECTED_SESSIONS_SHA = "0d3fa1f4ee9bcd812b99627bd6251b6729ad5ae3d34cd53fae953dc21d560fec"
EXPECTED_NOTECHS_SHA = "1f4196556c5b3aff77f163cd1a6c35ce3d7eedf6319698b3e58a19e72132e78b"


def checked_json(path, expected_sha):
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != expected_sha:
        raise ValueError(f"CANONICAL_PTO_V18_HASH_MISMATCH: {path.name}")
    return json.loads(data)


def validate(directory=DEFAULT_DIR, pto=None):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest.get("source_sha256") != EXPECTED_SOURCE_SHA:
        raise ValueError("CANONICAL_PTO_V18_SOURCE_MISMATCH")
    if manifest.get("sessions_sha256") != EXPECTED_SESSIONS_SHA or (
        manifest.get("notechs_sha256") != EXPECTED_NOTECHS_SHA
    ):
        raise ValueError("CANONICAL_PTO_V18_MANIFEST_HASH_MISMATCH")
    if manifest.get("status") != "CANONICAL_NORMATIVE_REFERENCE_NOT_OPERATIONAL_GUIDE":
        raise ValueError("CANONICAL_PTO_V18_NONOPERATIONAL_STATUS_REQUIRED")

    sessions = checked_json(directory / "sessoes_pto_v18.json", EXPECTED_SESSIONS_SHA)
    notechs = checked_json(directory / "notechs_pto_v18.json", EXPECTED_NOTECHS_SHA)
    if len(sessions) != 82 or len(notechs) != 15:
        raise ValueError("CANONICAL_PTO_V18_INCOMPLETE")
    if len({s["codigo"] for s in sessions}) != 82:
        raise ValueError("CANONICAL_PTO_V18_DUPLICATE_SESSION")
    if len({x["codigo"] for x in notechs}) != 15:
        raise ValueError("CANONICAL_PTO_V18_DUPLICATE_NOTECHS")
    counts = collections.Counter()
    codes = set()
    for s in sessions:
        code = s["codigo"]
        air = "AW139" if code.startswith("A139-") else "S76" if code.startswith("S76-") else None
        if s["aeronave"] != air or air is None:
            raise ValueError(f"CANONICAL_PTO_V18_AIRCRAFT_MISMATCH: {code}")
        if s["status"] != "PENDENTE_DE_VALIDACAO_TECNICA":
            raise ValueError(f"CANONICAL_PTO_V18_TECHNICAL_ACCEPTANCE_NOT_GRANTED: {code}")
        counts[air] += 1
        items = s["itens"]
        if len(items) != 18:
            raise ValueError(f"CANONICAL_PTO_V18_EXPECTED_18_TECHNICAL: {code}")
        if [x["ordem"] for x in items] != list(range(1, 19)):
            raise ValueError(f"CANONICAL_PTO_V18_ORDER_ERROR: {code}")
        if [x["perna"] for x in items] != ["1 - PF A"] * 9 + ["2 - PF B"] * 9:
            raise ValueError(f"CANONICAL_PTO_V18_PF_LEGS_ERROR: {code}")
        if not all(x["codigo"] and x["nome"].strip() for x in items):
            raise ValueError(f"CANONICAL_PTO_V18_INCOMPLETE_ITEM: {code}")
        codes.update(x["codigo"] for x in items)
    if counts != {"AW139": 37, "S76": 45}:
        raise ValueError("CANONICAL_PTO_V18_AIRCRAFT_SESSION_COUNTS")
    if len(codes) != 531:
        raise ValueError("CANONICAL_PTO_V18_DISTINCT_TECHNICAL_CODES")

    for row in notechs:
        if not all(str(row[k]).strip() for k in ("codigo", "elemento", "categoria", "evidencia")):
            raise ValueError("CANONICAL_PTO_V18_NOTECHS_MISSING_FIELD")

    if pto is not None:
        pto = Path(pto)
        if hashlib.sha256(pto.read_bytes()).hexdigest() != EXPECTED_SOURCE_SHA:
            raise ValueError("CANONICAL_PTO_V18_APPROVED_DOCX_HASH_MISMATCH")
        audit_path = ROOT / "audit-pto-rev10-v18.py"
        spec = importlib.util.spec_from_file_location("pto_v18_docx_auditor", audit_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        source = module.pto_tables(pto)
        if set(source) != {s["codigo"] for s in sessions}:
            raise ValueError("CANONICAL_PTO_V18_SOURCE_SESSION_CODES_DIFFER")
        for s in sessions:
            official = source[s["codigo"]]
            for key in ("titulo", "carga", "itens"):
                if official[key] != s[key]:
                    raise ValueError(f"CANONICAL_PTO_V18_DOCX_DRIFT: {s['codigo']}/{key}")
        pack_path = ROOT / "build-pto-rev10-v18-review-pack.py"
        pack_spec = importlib.util.spec_from_file_location("pto_v18_review_pack", pack_path)
        pack = importlib.util.module_from_spec(pack_spec)
        pack_spec.loader.exec_module(pack)
        if pack.notechs_from_pto(pto) != notechs:
            raise ValueError("CANONICAL_PTO_V18_DOCX_NOTECHS_DRIFT")
    return {
        "status": "CANONICAL_LOCK_PASS_NOT_OPERATIONAL_APPROVAL",
        "source_sha256": EXPECTED_SOURCE_SHA,
        "sessions": len(sessions),
        "technical_positions": sum(len(s["itens"]) for s in sessions),
        "distinct_technical_codes": len(codes),
        "notechs": len(notechs),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    parser.add_argument("--pto", type=Path, default=None)
    args = parser.parse_args()
    print(json.dumps(validate(args.dir, args.pto), indent=2))


if __name__ == "__main__":
    main()
