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
from zipfile import ZipFile
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent
DEFAULT_DIR = ROOT / "pto-v18-canonical"
EXPECTED_SOURCE_SHA = "040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912"
EXPECTED_SESSIONS_SHA = "0d3fa1f4ee9bcd812b99627bd6251b6729ad5ae3d34cd53fae953dc21d560fec"
EXPECTED_NOTECHS_SHA = "1f4196556c5b3aff77f163cd1a6c35ce3d7eedf6319698b3e58a19e72132e78b"
EXPECTED_FUNCTIONAL_SHA = "42aa89a4aa582bdcbe25ea47afb02503c154a6e5c2ec1e7c6371c05c0ca7d54c"
FUNCTIONAL_CODES = ["INST-E01", "INST-E02", "EXA-01/04", "EXA-02/04", "EXA-03/04", "EXA-04/04"]
FUNCTIONAL_LOADS = ["1 hora", "2 horas", "1 hora", "1 hora", "1 hora", "1 hora"]


def functional_from_approved_docx(path):
    """Extract all 6 functional tables directly from Word XML (no OCR/heuristics)."""
    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    with ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    body = root.find("./" + ns + "body")
    children = list(body)

    def word_text(cell):
        return "".join(t.text or "" for t in cell.iter(ns + "t")).strip()

    sessions = []
    for index, element in enumerate(children):
        if element.tag != ns + "tbl":
            continue
        rows = [[word_text(cell) for cell in row.findall("./" + ns + "tc")]
                for row in element.findall("./" + ns + "tr")]
        if not rows or rows[0] != ["Nº", "Código", "Conteúdo ou atividade"]:
            continue
        if len(rows) != 19 or len(sessions) >= 6:
            raise ValueError("CANONICAL_PTO_V18_FUNCTIONAL_TABLE_FORMAT")
        code = FUNCTIONAL_CODES[len(sessions)]
        headers = [word_text(el) for el in children[max(0, index - 15):index]
                   if el.tag == ns + "p" and word_text(el).startswith(code + " — ")]
        if len(headers) != 1:
            raise ValueError("CANONICAL_PTO_V18_FUNCTIONAL_HEADING_MISSING")
        items = []
        for item_index, cells in enumerate(rows[1:], 1):
            if len(cells) != 3 or cells[0] != str(item_index) or not cells[1] or not cells[2]:
                raise ValueError("CANONICAL_PTO_V18_FUNCTIONAL_ITEM_MALFORMED")
            items.append({"ordem": item_index, "codigo": cells[1], "nome": cells[2]})
        sessions.append({
            "codigo": code,
            "titulo": headers[0].split(" — ", 1)[1],
            "carga": FUNCTIONAL_LOADS[len(sessions)],
            "itens": items,
            "status": "PENDENTE_DE_VALIDACAO_TECNICA",
        })
    if len(sessions) != 6:
        raise ValueError("CANONICAL_PTO_V18_FUNCTIONAL_MISSING")
    return sessions



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
    if (manifest.get("sessions_sha256") != EXPECTED_SESSIONS_SHA or
        manifest.get("notechs_sha256") != EXPECTED_NOTECHS_SHA or
        manifest.get("functional_sha256") != EXPECTED_FUNCTIONAL_SHA):
        raise ValueError("CANONICAL_PTO_V18_MANIFEST_HASH_MISMATCH")
    if manifest.get("status") != "CANONICAL_NORMATIVE_REFERENCE_NOT_OPERATIONAL_GUIDE":
        raise ValueError("CANONICAL_PTO_V18_NONOPERATIONAL_STATUS_REQUIRED")

    sessions = checked_json(directory / "sessoes_pto_v18.json", EXPECTED_SESSIONS_SHA)
    notechs = checked_json(directory / "notechs_pto_v18.json", EXPECTED_NOTECHS_SHA)
    functional = checked_json(directory / "funcionais_pto_v18.json", EXPECTED_FUNCTIONAL_SHA)
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

    if len(functional) != 6 or [x["codigo"] for x in functional] != FUNCTIONAL_CODES:
        raise ValueError("CANONICAL_PTO_V18_FUNCTIONAL_SESSION_COUNT_OR_ORDER")
    if any(f["status"] != "PENDENTE_DE_VALIDACAO_TECNICA" for f in functional):
        raise ValueError("CANONICAL_PTO_V18_FUNCTIONAL_APPROVAL_NOT_GRANTED")
    for f, load in zip(functional, FUNCTIONAL_LOADS):
        if not f["titulo"] or f["carga"] != load or len(f["itens"]) != 18 or [
            it["ordem"] for it in f["itens"]
        ] != list(range(1, 19)):
            raise ValueError("CANONICAL_PTO_V18_FUNCTIONAL_STRUCTURE")
    functional_codes = [item["codigo"] for session in functional for item in session["itens"]]
    if len(functional_codes) != 108 or len(set(functional_codes)) != 94:
        raise ValueError("CANONICAL_PTO_V18_FUNCTIONAL_108_OR_94")
    if not all(item["nome"].strip() for session in functional for item in session["itens"]):
        raise ValueError("CANONICAL_PTO_V18_FUNCTIONAL_ACTIVITY_MISSING")

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
        if functional_from_approved_docx(pto) != functional:
            raise ValueError("CANONICAL_PTO_V18_DOCX_FUNCTIONAL_DRIFT")
    return {
        "status": "CANONICAL_LOCK_PASS_NOT_OPERATIONAL_APPROVAL",
        "source_sha256": EXPECTED_SOURCE_SHA,
        "sessions": len(sessions),
        "technical_positions": sum(len(s["itens"]) for s in sessions),
        "distinct_technical_codes": len(codes),
        "notechs": len(notechs),
        "functional_sessions": len(functional),
        "functional_technical_positions": len(functional_codes),
        "distinct_functional_codes": len(set(functional_codes)),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    parser.add_argument("--pto", type=Path, default=None)
    args = parser.parse_args()
    print(json.dumps(validate(args.dir, args.pto), indent=2))


if __name__ == "__main__":
    main()
