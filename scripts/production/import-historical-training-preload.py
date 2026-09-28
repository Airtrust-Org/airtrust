#!/usr/bin/env python3
"""Governed one-off importer for the approved 2026-09-28 training-history preload.

The source XLSX stays outside git. Dry-run is read-only. Apply is locked to exact
main SHA, source hash, candidate count/hash and a D1 Time Travel recovery point.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

EMPRESA_ID = 6
DB_NAME = "airtrust-db"
DB_ID = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
CONFIRM_APPLY = "AIRTRUST_PRODUCTION_APPLY_HISTORICAL_TRAINING_PRELOAD"
TODAY = date(2026, 9, 28)
SHEET_NAME = "Pré-carga revisada"
SOURCE_CODE_MAP = {"NR 06": "NR06", "NR 20": "NR-20", "NR 35": "NR-35"}
ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "worker-airtrust"
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
RID_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def run(cmd: list[str], cwd: Path = ROOT, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"command failed: {cmd[0]}")
    return result


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def normalize_name(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text.strip()).casefold()


def excel_date(value: object) -> str:
    raw = str(value or "").strip()
    if re.fullmatch(r"\d+(?:\.0+)?", raw):
        return (datetime(1899, 12, 30) + timedelta(days=int(float(raw)))).date().isoformat()
    return datetime.strptime(raw[:10], "%Y-%m-%d").date().isoformat()
def _col_index(ref: str) -> int:
    letters = re.match(r"([A-Z]+)", ref).group(1)
    out = 0
    for ch in letters:
        out = out * 26 + ord(ch) - 64
    return out - 1


def read_sheet(path: Path, sheet_name: str) -> list[dict[str, str]]:
    with ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for item in root.findall(f"{{{MAIN_NS}}}si"):
                shared.append("".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t")))
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rel = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rels = {node.attrib["Id"]: node.attrib["Target"].lstrip("/") for node in rel}
        target = None
        for sheet in wb.find(f"{{{MAIN_NS}}}sheets"):
            if sheet.attrib["name"] == sheet_name:
                target = rels[sheet.attrib[f"{{{RID_NS}}}id"]]
                break
        if not target:
            raise RuntimeError(f"sheet not found: {sheet_name}")
        xml = ET.fromstring(z.read(target))
        matrix: list[list[str]] = []
        width = 0
        for row in xml.findall(f".//{{{MAIN_NS}}}row"):
            values: dict[int, str] = {}
            for cell in row.findall(f"{{{MAIN_NS}}}c"):
                idx = _col_index(cell.attrib.get("r", "A1"))
                width = max(width, idx + 1)
                kind = cell.attrib.get("t")
                value = cell.find(f"{{{MAIN_NS}}}v")
                if kind == "inlineStr":
                    text = "".join(node.text or "" for node in cell.iter(f"{{{MAIN_NS}}}t"))
                elif value is None:
                    text = ""
                elif kind == "s":
                    text = shared[int(value.text)]
                else:
                    text = value.text or ""
                values[idx] = text
            matrix.append([values.get(i, "") for i in range(width)])
    headers = matrix[0]
    records: list[dict[str, str]] = []
    for raw in matrix[1:]:
        raw += [""] * (len(headers) - len(raw))
        records.append({headers[i]: raw[i] for i in range(len(headers))})
    return records


def wrangler_query(sql: str) -> list[dict]:
    cmd = ["npx", "--no-install", "wrangler", "d1", "execute", DB_NAME,
           "--env", "production", "--remote", "--json", "--command", sql]
    payload = json.loads(run(cmd, WORKER).stdout)
    return [row for block in payload for row in block.get("results", [])]
def load_live_state() -> tuple[list[dict], list[dict], list[dict]]:
    employees = wrangler_query(
        "SELECT id,nome,ativo,status FROM funcionarios "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL ORDER BY id"
    )
    types = wrangler_query(
        "SELECT id,codigo,nome,validade,carga_horaria,carga_horaria_inicial,"
        "carga_horaria_recorrente,categoria,ativo,vencimento_fim_mes "
        f"FROM qualificacoes_tipos WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL ORDER BY id"
    )
    histories = wrangler_query(
        "SELECT qh.id,qh.funcionario_id,qh.qualificacao_id,"
        "COALESCE(qt.codigo,qh.qualificacao_codigo) AS codigo,qh.data_conclusao,"
        "qh.data_vencimento,qh.validade_meses,qh.carga_horaria,qh.status,"
        "qh.tipo_treinamento,qh.renovada,qh.renovacao_de "
        "FROM qualificacoes_historico qh LEFT JOIN qualificacoes_tipos qt "
        "ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id "
        f"WHERE qh.empresa_id={EMPRESA_ID} AND qh.deleted_at IS NULL ORDER BY qh.id"
    )
    return employees, types, histories


def resolve_employee(name: str, employees: list[dict]) -> dict | None:
    wanted = normalize_name(name)
    exact = [e for e in employees if normalize_name(e["nome"]) == wanted]
    if len(exact) > 1:
        active = [e for e in exact if int(e.get("ativo") or 0) == 1]
        if len(active) == 1:
            return active[0]
    if len(exact) == 1:
        return exact[0]
    wanted_tokens = set(wanted.split())
    subset = []
    for employee in employees:
        candidate_tokens = set(normalize_name(employee["nome"]).split())
        if wanted_tokens and wanted_tokens.issubset(candidate_tokens):
            subset.append(employee)
    if len(subset) > 1:
        active = [e for e in subset if int(e.get("ativo") or 0) == 1]
        if len(active) == 1:
            return active[0]
    return subset[0] if len(subset) == 1 else None


def canonical_hash(rows: list[dict]) -> str:
    material = "\n".join(
        sorted(f"{r['employee_id']}|{r['code']}|{r['date']}" for r in rows)
    ).encode()
    return hashlib.sha256(material).hexdigest()


def classify(source: list[dict], employees: list[dict], types: list[dict], histories: list[dict]):
    type_by_code = {str(t.get("codigo") or "").upper(): t for t in types if t.get("codigo")}
    existing = {
        (int(h["funcionario_id"]), str(h.get("codigo") or "").upper(), str(h.get("data_conclusao") or "")[:10]): h
        for h in histories
    }
    candidates: list[dict] = []
    blocked: list[dict] = []
    seen: set[tuple[int, str, str]] = set()
    for index, row in enumerate(source, 2):
        code = str(row.get("Código final") or SOURCE_CODE_MAP.get(row.get("Treinamento origem"), "")).strip().upper()
        employee = resolve_employee(str(row.get("Nome AirTrust") or ""), employees)
        if not code or code not in type_by_code:
            blocked.append({"line": index, "reason": "unmapped_type"}); continue
        if employee is None:
            blocked.append({"line": index, "reason": "employee_unresolved"}); continue
        try:
            completion = excel_date(row.get("Data realização"))
        except Exception:
            blocked.append({"line": index, "reason": "invalid_date"}); continue
        if date.fromisoformat(completion) > TODAY:
            blocked.append({"line": index, "reason": "future_date"}); continue
        key = (int(employee["id"]), code, completion)
        if key in seen:
            blocked.append({"line": index, "reason": "duplicate_source"}); continue
        seen.add(key)
        qtype = type_by_code[code]
        candidates.append({
            "line": index,
            "employee_id": key[0],
            "qualification_id": int(qtype["id"]),
            "code": code,
            "date": completion,
            "state": "exists" if key in existing else "create",
            "type": qtype,
        })
    return candidates, blocked


def add_months(iso: str, months: int, end_of_month: bool) -> str:
    dt = date.fromisoformat(iso)
    total = dt.year * 12 + (dt.month - 1) + months
    year, month0 = divmod(total, 12)
    month = month0 + 1
    if end_of_month:
        next_total = total + 1
        ny, nm0 = divmod(next_total, 12)
        return (date(ny, nm0 + 1, 1) - timedelta(days=1)).isoformat()
    return (date(year, month, 1) + timedelta(days=dt.day - 1)).isoformat()
def sql_text(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def build_apply_sql(candidates: list[dict], histories: list[dict], source_hash: str) -> tuple[str, int]:
    creates = [row for row in candidates if row["state"] == "create"]
    real_existing = defaultdict(list)
    for history in histories:
        status = str(history.get("status") or "").upper()
        if status in {"PLANEJADA", "PLANEJADO", "CANCELADA", "CANCELADO"}:
            continue
        if not history.get("data_conclusao") or not history.get("qualificacao_id"):
            continue
        key = (int(history["funcionario_id"]), int(history["qualificacao_id"]))
        real_existing[key].append(str(history["data_conclusao"])[:10])
    create_dates = defaultdict(list)
    for row in creates:
        create_dates[(row["employee_id"], row["qualification_id"])].append(row["date"])
    touched = sorted(create_dates)
    batch_tag = f"historical-training-preload-20260928:{source_hash[:12]}"
    lines: list[str] = []
    lines.append("PRAGMA foreign_keys=ON;")
    for row in creates:
        key = (row["employee_id"], row["qualification_id"])
        all_dates = real_existing.get(key, []) + create_dates.get(key, [])
        training_type = "INICIAL" if row["date"] == min(all_dates) else "RECORRENTE"
        qtype = row["type"]
        workload = qtype.get("carga_horaria_inicial") if training_type == "INICIAL" else qtype.get("carga_horaria_recorrente")
        if workload is None:
            workload = qtype.get("carga_horaria")
        validity = int(qtype["validade"]) if qtype.get("validade") not in (None, "") else None
        expiry = add_months(row["date"], validity, int(qtype.get("vencimento_fim_mes") or 0) == 1) if validity else None
        values = [row["employee_id"], row["qualification_id"], row["code"], qtype.get("categoria"), row["date"], expiry, validity, batch_tag, "CONCLUIDA", 0, workload, training_type, EMPRESA_ID]
        quoted = ",".join(str(v) if isinstance(v, (int, float)) else sql_text(v) for v in values)
        lines.append(
            "INSERT INTO qualificacoes_historico (funcionario_id,qualificacao_id,qualificacao_codigo,categoria,data_conclusao,data_vencimento,validade_meses,observacoes,status,renovada,carga_horaria,tipo_treinamento,empresa_id,created_at,updated_at) "
            f"SELECT {quoted},datetime('now'),datetime('now') WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_historico WHERE empresa_id={EMPRESA_ID} AND funcionario_id={row['employee_id']} AND qualificacao_id={row['qualification_id']} AND data_conclusao={sql_text(row['date'])} AND deleted_at IS NULL);"
        )
    for employee_id, qualification_id in touched:
        scope = f"qh.empresa_id={EMPRESA_ID} AND qh.funcionario_id={employee_id} AND qh.qualificacao_id={qualification_id}"
        lines.append(
            "UPDATE qualificacoes_historico AS qh SET renovacao_de=(SELECT pred.id FROM qualificacoes_historico pred WHERE pred.empresa_id=qh.empresa_id AND pred.funcionario_id=qh.funcionario_id AND pred.qualificacao_id=qh.qualificacao_id AND pred.id<>qh.id AND pred.deleted_at IS NULL AND UPPER(COALESCE(pred.status,'')) NOT IN ('PLANEJADA','PLANEJADO','CANCELADA','CANCELADO') AND (date(pred.data_conclusao)<date(qh.data_conclusao) OR (date(pred.data_conclusao)=date(qh.data_conclusao) AND pred.id<qh.id)) ORDER BY date(pred.data_conclusao) DESC,pred.id DESC LIMIT 1),updated_at=datetime('now') WHERE "
            + scope + " AND qh.deleted_at IS NULL AND UPPER(COALESCE(qh.status,'')) NOT IN ('PLANEJADA','PLANEJADO','CANCELADA','CANCELADO');"
        )
        lines.append(
            "UPDATE qualificacoes_historico AS qh SET renovada=1,status='RENOVADA',updated_at=datetime('now') WHERE "
            + scope + " AND qh.deleted_at IS NULL AND UPPER(COALESCE(qh.status,'')) NOT IN ('PLANEJADA','PLANEJADO','CANCELADA','CANCELADO','RENOVADA') AND EXISTS (SELECT 1 FROM qualificacoes_historico suc WHERE suc.empresa_id=qh.empresa_id AND suc.funcionario_id=qh.funcionario_id AND suc.qualificacao_id=qh.qualificacao_id AND suc.deleted_at IS NULL AND UPPER(COALESCE(suc.status,'')) NOT IN ('PLANEJADA','PLANEJADO','CANCELADA','CANCELADO') AND (date(suc.data_conclusao)>date(qh.data_conclusao) OR (date(suc.data_conclusao)=date(qh.data_conclusao) AND suc.id>qh.id)));"
        )
    return "\n".join(lines) + "\n", len(creates)


def git_state() -> tuple[str, str, str]:
    head = run(["git", "rev-parse", "HEAD"]).stdout.strip()
    main = run(["git", "rev-parse", "origin/main"]).stdout.strip()
    branch = run(["git", "branch", "--show-current"]).stdout.strip()
    return head, main, branch
def verify_production_target() -> None:
    cmd = ["npx", "--no-install", "wrangler", "d1", "info", DB_NAME, "--env", "production", "--json"]
    info = json.loads(run(cmd, WORKER).stdout)
    if info.get("uuid") != DB_ID or info.get("name") != DB_NAME:
        raise RuntimeError("production D1 target identity mismatch")


def ensure_apply_guards(args, source_hash: str, candidate_count: int, candidate_hash: str, create_count: int) -> str:
    head, main, branch = git_state()
    if args.expected_sha != head or head != main or branch != "main":
        raise RuntimeError("apply requires exact clean origin/main SHA on branch main")
    if run(["git", "status", "--porcelain"]).stdout.strip():
        raise RuntimeError("apply requires a clean worktree")
    if args.confirmation != CONFIRM_APPLY:
        raise RuntimeError("apply confirmation mismatch")
    if args.expected_source_sha != source_hash:
        raise RuntimeError("source SHA-256 mismatch")
    if args.expected_candidate_count != candidate_count or args.expected_candidate_hash != candidate_hash:
        raise RuntimeError("reviewed candidate set mismatch")
    if args.expected_create_count != create_count:
        raise RuntimeError("reviewed create count mismatch")
    if ROOT in args.source.resolve().parents:
        raise RuntimeError("source workbook must remain outside the git repository")
    verify_production_target()
    return head


def capture_recovery_point() -> str:
    timestamp = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    cmd = ["npx", "--no-install", "wrangler", "d1", "time-travel", "info", DB_NAME,
           "--env", "production", f"--timestamp={timestamp}", "--json"]
    result = run(cmd, WORKER)
    if DB_ID not in result.stdout and not result.stdout.strip():
        raise RuntimeError("D1 recovery point could not be verified")
    return timestamp


def apply_sql(sql: str) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write(sql)
        temp_path = Path(f.name)
    try:
        cmd = ["npx", "--no-install", "wrangler", "d1", "execute", DB_NAME,
               "--env", "production", "--remote", f"--file={temp_path}"]
        run(cmd, WORKER)
    finally:
        temp_path.unlink(missing_ok=True)
def lineage_violation_count(histories: list[dict], touched: set[tuple[int, int]]) -> int:
    groups = defaultdict(list)
    for history in histories:
        key = (int(history["funcionario_id"]), int(history["qualificacao_id"] or 0))
        if key not in touched or not history.get("data_conclusao"):
            continue
        status = str(history.get("status") or "").upper()
        if status in {"PLANEJADA", "PLANEJADO", "CANCELADA", "CANCELADO"}:
            continue
        groups[key].append(history)
    violations = 0
    for items in groups.values():
        items.sort(key=lambda row: (str(row["data_conclusao"])[:10], int(row["id"])))
        for index, row in enumerate(items):
            expected = int(items[index - 1]["id"]) if index else None
            actual = int(row["renovacao_de"]) if row.get("renovacao_de") is not None else None
            if actual != expected:
                violations += 1
            if index < len(items) - 1:
                if int(row.get("renovada") or 0) != 1 or str(row.get("status") or "").upper() != "RENOVADA":
                    violations += 1
    return violations


def summarize(candidates: list[dict], blocked: list[dict], source_hash: str, head: str) -> dict:
    return {
        "mode": "dry-run",
        "source_sha256": source_hash,
        "source_rows": len(candidates) + len(blocked),
        "candidate_count": len(candidates),
        "candidate_hash": canonical_hash(candidates),
        "existing_count": sum(r["state"] == "exists" for r in candidates),
        "create_count": sum(r["state"] == "create" for r in candidates),
        "blocked_count": len(blocked),
        "blocked_reasons": dict(Counter(r["reason"] for r in blocked)),
        "create_by_code": dict(sorted(Counter(r["code"] for r in candidates if r["state"] == "create").items())),
        "source_sha": head,
        "empresa_id": EMPRESA_ID,
        "mutation_executed": False,
        "pii_emitted": False,
    }


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["dry-run", "apply"])
    p.add_argument("--source", required=True, type=Path)
    p.add_argument("--expected-sha")
    p.add_argument("--expected-source-sha")
    p.add_argument("--expected-candidate-count", type=int)
    p.add_argument("--expected-candidate-hash")
    p.add_argument("--expected-create-count", type=int)
    p.add_argument("--confirmation")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if not args.source.is_file():
        raise RuntimeError("source workbook not found")
    source_hash = sha256_file(args.source)
    source = read_sheet(args.source, SHEET_NAME)
    employees, types, histories = load_live_state()
    candidates, blocked = classify(source, employees, types, histories)
    head, _, _ = git_state()
    report = summarize(candidates, blocked, source_hash, head)
    if set(report["blocked_reasons"]) - {"future_date"}:
        raise RuntimeError("non-future blockers remain; apply refused")
    if args.mode == "dry-run":
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    sql, create_count = build_apply_sql(candidates, histories, source_hash)
    exact_sha = ensure_apply_guards(
        args, source_hash, len(candidates), canonical_hash(candidates), create_count
    )
    recovery = capture_recovery_point()
    apply_sql(sql)

    employees2, types2, histories2 = load_live_state()
    candidates2, blocked2 = classify(source, employees2, types2, histories2)
    post_hash = canonical_hash(candidates2)
    remaining = sum(row["state"] == "create" for row in candidates2)
    if len(candidates2) != len(candidates) or post_hash != canonical_hash(candidates):
        raise RuntimeError("postcondition candidate set mismatch")
    if remaining != 0:
        raise RuntimeError(f"postcondition failed: {remaining} candidates remain uncreated")
    if Counter(r["reason"] for r in blocked2) != Counter(r["reason"] for r in blocked):
        raise RuntimeError("postcondition blocker set changed")
    touched = {(r["employee_id"], r["qualification_id"]) for r in candidates if r["state"] == "create"}
    lineage_violations = lineage_violation_count(histories2, touched)
    if lineage_violations:
        raise RuntimeError(f"postcondition lineage violations: {lineage_violations}")

    report.update({
        "mode": "apply",
        "source_sha": exact_sha,
        "mutation_executed": True,
        "changed_histories": create_count,
        "post_candidate_count": len(candidates2),
        "post_remaining_create_count": remaining,
        "postconditions_verified": True,
        "lineage_violations": lineage_violations,
        "recovery_timestamp_utc": recovery,
    })
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
