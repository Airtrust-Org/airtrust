#!/usr/bin/env python3
"""Read-only reconciliation of the two controlled 2026 training-history spreadsheets.

The workbook remains outside git. The script reads production D1 with SELECT only,
never emits employee names/CPF/email, and reports a deterministic candidate hash
for historical evidence that exists in the controlled spreadsheet but is absent
from AirTrust.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import unicodedata
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

EMPRESA_ID = 6
DB_NAME = "airtrust-db"
ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "worker-airtrust"
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
RID_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
TODAY = date.today()

SHEET_TO_CODE = {
    "GESTAO DE MUDANCA": "MUDA",
    "INTEGRACAO": "INTEGRA",
    "REGRAS DE OURO": "REGRAS_OURO_PETROBRAS",
    "GERENCIAMENTO E COLETA SELETIVA": "COL_SEL",
    "DOUTRINAMENTO DE SEGURANCA": "INTRO_SGQ",
    "AUDITORIA COMPORTAMENTAL": "AUD_COMP",
    "NR 06": "NR06",
    "NR 20": "NR-20",
    "FISPQ": "NR-26",
    "NR11": "NR-11",
    "NR 35": "NR-35",
}


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text.strip()).upper()


def excel_date(value: object) -> str | None:
    raw = str(value or "").strip()
    if not raw or normalize(raw) in {"N/C", "NC", "N.A.", "NA", "NAO CONSTA"}:
        return None
    if re.fullmatch(r"\d+(?:\.0+)?", raw):
        return (datetime(1899, 12, 30) + timedelta(days=int(float(raw)))).date().isoformat()
    iso = re.match(r"^(\d{4}-\d{2}-\d{2})", raw)
    if iso:
        return iso.group(1)
    br = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", raw)
    if br:
        day, month, year = map(int, br.groups())
        return date(year, month, day).isoformat()
    return None


def col_index(ref: str) -> int:
    match = re.match(r"([A-Z]+)", ref)
    if not match:
        return -1
    out = 0
    for char in match.group(1):
        out = out * 26 + ord(char) - 64
    return out - 1


def read_control_workbook(path: Path) -> list[dict[str, str]]:
    with ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall(f"{{{MAIN_NS}}}si"):
                shared.append("".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t")))

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rels = {node.attrib["Id"]: node.attrib["Target"].lstrip("/") for node in relationships}

        records: list[dict[str, str]] = []
        seen: set[tuple[str, str, str]] = set()
        found_sheets: set[str] = set()
        for sheet in workbook.find(f"{{{MAIN_NS}}}sheets"):
            sheet_name = str(sheet.attrib["name"]).strip()
            normalized_sheet = normalize(sheet_name)
            code = SHEET_TO_CODE.get(normalized_sheet)
            if not code:
                continue
            if normalized_sheet in found_sheets:
                raise ValueError("duplicate controlled training sheet")
            found_sheets.add(normalized_sheet)
            target = rels[sheet.attrib[f"{{{RID_NS}}}id"]]
            if not target.startswith("xl/"):
                target = "xl/" + target
            xml = ET.fromstring(archive.read(target))
            for row in xml.findall(f".//{{{MAIN_NS}}}row"):
                values: dict[int, str] = {}
                for cell in row.findall(f"{{{MAIN_NS}}}c"):
                    index = col_index(cell.attrib.get("r", ""))
                    if index not in (0, 2):
                        continue
                    value = cell.find(f"{{{MAIN_NS}}}v")
                    if value is None:
                        continue
                    raw = value.text or ""
                    if cell.attrib.get("t") == "s":
                        raw = shared[int(raw)]
                    values[index] = raw

                employee_name = str(values.get(0, "")).strip()
                raw_date = str(values.get(2, "")).strip()
                if not employee_name or normalize(employee_name) == "NOME DO FUNCIONARIO" or not raw_date:
                    continue
                completion = excel_date(raw_date)
                if not completion:
                    continue
                key = (normalize(employee_name), code, completion)
                if key in seen:
                    continue
                seen.add(key)
                records.append({"employee_name": key[0], "code": code, "date": completion})
        if found_sheets != set(SHEET_TO_CODE):
            raise ValueError("missing controlled training sheet(s)")
        if not records:
            raise ValueError("controlled workbook has no completion evidence")
        return records


def run(command: list[str], cwd: Path = ROOT) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "command failed")
    return result


def wrangler_select(sql: str) -> list[dict]:
    normalized = str(sql).strip().rstrip(";")
    if not re.match(r"^(SELECT|WITH)\b", normalized, re.I):
        raise RuntimeError("read-only audit accepts SELECT/WITH only")
    if re.search(r"\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|VACUUM|ATTACH|DETACH|REINDEX)\b", normalized, re.I):
        raise RuntimeError("mutating SQL refused")
    command = [
        "npx", "--no-install", "wrangler", "d1", "execute", DB_NAME,
        "--env", "production", "--remote", "--json", "--command", normalized,
    ]
    payload = json.loads(run(command, WORKER).stdout)
    return [row for block in payload for row in block.get("results", [])]


def resolve_employee(name: str, employees: list[dict]) -> dict | None:
    exact = [row for row in employees if normalize(row.get("nome")) == name]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        active = [row for row in exact if employee_is_active(row)]
        return active[0] if len(active) == 1 else None

    wanted = set(name.split())
    subset = [
        row for row in employees
        if wanted and wanted.issubset(set(normalize(row.get("nome")).split()))
    ]
    if len(subset) == 1:
        return subset[0]
    if len(subset) > 1:
        active = [row for row in subset if employee_is_active(row)]
        return active[0] if len(active) == 1 else None
    return None


def employee_is_active(row: dict) -> bool:
    return (
        row.get("deleted_at") is None
        and int(row.get("ativo") if row.get("ativo") is not None else 1) == 1
        and normalize(row.get("status") or "ATIVO") == "ATIVO"
    )


def candidate_hash(rows: list[dict]) -> str:
    material = "\n".join(
        sorted(f"{int(row['employee_id'])}|{row['code']}|{row['date']}" for row in rows)
    )
    return hashlib.sha256(material.encode()).hexdigest()


def audit(source: Path, reference: Path) -> dict:
    records = read_control_workbook(source)
    comparison = read_control_workbook(reference)
    if sorted((r["employee_name"], r["code"], r["date"]) for r in records) != sorted(
        (r["employee_name"], r["code"], r["date"]) for r in comparison
    ):
        raise ValueError("controlled workbook copies disagree: reconciliation refused")
    employees = wrangler_select(
        f"SELECT id,nome,status,ativo,deleted_at FROM funcionarios WHERE empresa_id={EMPRESA_ID}"
    )
    types = wrangler_select(
        f"SELECT id,codigo FROM qualificacoes_tipos "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND COALESCE(ativo,1)=1"
    )
    histories = wrangler_select(
        "SELECT qh.id,qh.funcionario_id,qh.qualificacao_id,"
        "qh.qualificacao_codigo original_code,qt.codigo type_code,qh.data_conclusao,qh.status "
        "FROM qualificacoes_historico qh "
        "LEFT JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id "
        f"WHERE qh.empresa_id={EMPRESA_ID} AND qh.deleted_at IS NULL"
    )

    type_by_code = {normalize(row.get("codigo")): row for row in types}
    histories_by_employee: dict[int, list[dict]] = {}
    for row in histories:
        histories_by_employee.setdefault(int(row["funcionario_id"]), []).append(row)

    stats = Counter()
    by_code: dict[str, Counter] = {code: Counter() for code in SHEET_TO_CODE.values()}
    missing_active: list[dict] = []
    unresolved_people: set[str] = set()
    inactive_people: set[str] = set()

    for record in records:
        code = record["code"]
        stats["source_rows"] += 1
        by_code[code]["source_rows"] += 1
        qualification = type_by_code.get(normalize(code))
        if not qualification:
            stats["unmapped_type"] += 1
            by_code[code]["unmapped_type"] += 1
            continue

        employee = resolve_employee(record["employee_name"], employees)
        if employee is None:
            stats["employee_unresolved"] += 1
            by_code[code]["employee_unresolved"] += 1
            unresolved_people.add(record["employee_name"])
            continue

        active = employee_is_active(employee)
        stats["employee_active" if active else "employee_inactive"] += 1
        by_code[code]["employee_active" if active else "employee_inactive"] += 1
        if not active:
            inactive_people.add(record["employee_name"])

        relevant = [
            row for row in histories_by_employee.get(int(employee["id"]), [])
            if code in {normalize(row.get("original_code")), normalize(row.get("type_code"))}
            and row.get("data_conclusao")
            and normalize(row.get("status")) not in {
                "PLANEJADA", "PLANEJADO", "CANCELADA", "CANCELADO",
                "PENDENTE", "EM_ANDAMENTO", "REPROVADA", "REPROVADO",
                "NAO_REALIZADA", "NAO_REALIZADO", "INVALIDA", "INVALIDO",
            }
        ]
        exact = [
            row for row in relevant
            if str(row.get("data_conclusao") or "")[:10] == record["date"]
        ]
        if exact:
            stats["history_exact"] += 1
            by_code[code]["history_exact"] += 1
            exact_via_current_fk = any(normalize(row.get("type_code")) == normalize(code) for row in exact)
            exact_via_canonical_code = any(normalize(row.get("original_code")) == normalize(code) for row in exact)
            if exact_via_current_fk:
                stats["history_exact_via_current_fk"] += 1
                by_code[code]["history_exact_via_current_fk"] += 1
            elif exact_via_canonical_code:
                stats["history_exact_requires_code_fallback"] += 1
                by_code[code]["history_exact_requires_code_fallback"] += 1
                if active:
                    stats["active_history_exact_requires_code_fallback"] += 1
                    by_code[code]["active_history_exact_requires_code_fallback"] += 1
        elif relevant:
            stats["history_other_date"] += 1
            by_code[code]["history_other_date"] += 1
        else:
            stats["history_missing"] += 1
            by_code[code]["history_missing"] += 1
            if active and date.fromisoformat(record["date"]) <= TODAY:
                missing_active.append({
                    "employee_id": int(employee["id"]),
                    "qualification_id": int(qualification["id"]),
                    "code": code,
                    "date": record["date"],
                })

    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    return {
        "mode": "read-only",
        "empresa_id": EMPRESA_ID,
        "source_sha256": source_hash,
        "reference_sha256": hashlib.sha256(reference.read_bytes()).hexdigest(),
        "source_copies_agree": True,
        "source_rows": len(records),
        "source_people": len({row["employee_name"] for row in records}),
        "stats": dict(stats),
        "by_code": {code: dict(counts) for code, counts in sorted(by_code.items())},
        "unresolved_people_count": len(unresolved_people),
        "inactive_people_count": len(inactive_people),
        "missing_active_candidate_count": len(missing_active),
        "missing_active_candidate_hash": candidate_hash(missing_active),
        "mutation_executed": False,
        "pii_emitted": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    args = parser.parse_args()
    for workbook in (args.source, args.reference):
        if not workbook.is_file():
            raise RuntimeError("controlled workbook not found")
        if ROOT in workbook.resolve().parents:
            raise RuntimeError("source workbook must stay outside the git repository")
    print(json.dumps(audit(args.source, args.reference), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
