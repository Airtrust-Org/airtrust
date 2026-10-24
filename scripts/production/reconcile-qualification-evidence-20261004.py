#!/usr/bin/env python3
"""Governed reconciliation of existing document evidence with qualification histories.

The reviewed plan remains outside git and contains only already-existing AirTrust document/history
references. This executor performs zero R2 writes. It supports:
- linking an unlinked existing document to an empty qualification history;
- moving one proven misclassified document between histories when the reviewed plan explicitly
  records both expected qualification codes.

Apply requires exact clean main, reviewed plan SHA/count/hash, production D1 identity, a D1 Time
Travel recovery point, tenant/employee/r2/name/history CAS checks, audit rows and read-back
postconditions.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "worker-airtrust"
DB_NAME = "airtrust-db"
DB_ID = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
EMPRESA_ID = 6
CONFIRM = "AIRTRUST_PRODUCTION_RECONCILE_QUALIFICATION_EVIDENCE_20261004"
AUDIT_ACTION = "QUALIFICATION_EVIDENCE_RECONCILE_20261004"
ACTIONS = {"link_existing_document", "move_misclassified_document"}


def run(cmd: list[str], cwd: Path = ROOT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, check=True)


def query(sql: str) -> list[dict]:
    cmd = [
        "npx", "--no-install", "wrangler", "d1", "execute", DB_NAME,
        "--env", "production", "--remote", "--json", "--command", sql,
    ]
    payload = json.loads(run(cmd, WORKER).stdout)
    return [row for block in payload for row in block.get("results", [])]


def sql_text(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def git_state() -> tuple[str, str, str]:
    return (
        run(["git", "rev-parse", "HEAD"]).stdout.strip(),
        run(["git", "rev-parse", "origin/main"]).stdout.strip(),
        run(["git", "branch", "--show-current"]).stdout.strip(),
    )


def verify_target() -> None:
    info = json.loads(
        run(
            ["npx", "--no-install", "wrangler", "d1", "info", DB_NAME, "--env", "production", "--json"],
            WORKER,
        ).stdout
    )
    if info.get("uuid") != DB_ID or info.get("name") != DB_NAME:
        raise RuntimeError("production D1 target identity mismatch")


def recovery_point() -> str:
    ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    run(
        [
            "npx", "--no-install", "wrangler", "d1", "time-travel", "info", DB_NAME,
            "--env", "production", f"--timestamp={ts}", "--json",
        ],
        WORKER,
    )
    return ts


def validate_plan(raw: object) -> list[dict]:
    if not isinstance(raw, list) or not raw:
        raise RuntimeError("reconciliation plan must be a non-empty JSON array")
    out: list[dict] = []
    seen_docs: set[int] = set()
    seen_targets: set[int] = set()
    for item in raw:
        if not isinstance(item, dict):
            raise RuntimeError("plan row must be an object")
        row = dict(item)
        action = str(row.get("action") or "")
        if action not in ACTIONS:
            raise RuntimeError("unsupported reconciliation action")
        for key in ("documento_id", "funcionario_id", "historico_destino_id"):
            row[key] = int(row.get(key) or 0)
            if row[key] <= 0:
                raise RuntimeError(f"invalid {key}")
        if row["documento_id"] in seen_docs or row["historico_destino_id"] in seen_targets:
            raise RuntimeError("plan must use unique documents and target histories")
        seen_docs.add(row["documento_id"])
        seen_targets.add(row["historico_destino_id"])
        for key in (
            "expected_destino_codigo", "expected_nome_arquivo", "expected_r2_key",
            "expected_data_conclusao", "expected_data_vencimento",
        ):
            if not str(row.get(key) or "").strip():
                raise RuntimeError(f"missing {key}")
        if action == "move_misclassified_document":
            row["historico_origem_id"] = int(row.get("historico_origem_id") or 0)
            if row["historico_origem_id"] <= 0 or row["historico_origem_id"] == row["historico_destino_id"]:
                raise RuntimeError("invalid source history")
            for key in (
                "expected_origem_codigo", "expected_origem_data_conclusao",
                "new_nome_arquivo", "new_numero_certificado",
            ):
                if not str(row.get(key) or "").strip():
                    raise RuntimeError(f"missing {key}")
            if not str(row["new_nome_arquivo"]).lower().endswith(".pdf"):
                raise RuntimeError("target visible name must be PDF")
        out.append(row)
    return out


def candidate_hash(rows: list[dict]) -> str:
    material = "\n".join(
        sorted(
            "|".join(
                [
                    r["action"], str(r["documento_id"]), str(r["funcionario_id"]),
                    str(r.get("historico_origem_id") or 0), str(r["historico_destino_id"]),
                    str(r["expected_destino_codigo"]), str(r["expected_r2_key"]),
                    str(r.get("new_nome_arquivo") or ""),
                ]
            )
            for r in rows
        )
    ).encode()
    return hashlib.sha256(material).hexdigest()


def live_state(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    doc_ids = ",".join(str(r["documento_id"]) for r in rows)
    history_ids_set = {r["historico_destino_id"] for r in rows}
    history_ids_set.update(int(r.get("historico_origem_id") or 0) for r in rows)
    history_ids_set.discard(0)
    history_ids = ",".join(str(i) for i in sorted(history_ids_set))

    docs = query(
        "SELECT id,funcionario_id,nome_arquivo,r2_key FROM documentos "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND id IN ({doc_ids})"
    )
    histories = query(
        "SELECT id,funcionario_id,COALESCE(qualificacao_codigo,codigo,tipo_codigo) AS codigo,"
        "data_conclusao,data_vencimento,certificado_arquivo_id,arquivo_url,numero_certificado "
        "FROM qualificacoes_historico "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND id IN ({history_ids})"
    )
    links = query(
        "SELECT id,funcionario_id,certificado_arquivo_id FROM qualificacoes_historico "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND certificado_arquivo_id IN ({doc_ids})"
    )
    doc_by_id = {int(x["id"]): x for x in docs}
    hist_by_id = {int(x["id"]): x for x in histories}
    links_by_doc: dict[int, list[int]] = {}
    for link in links:
        links_by_doc.setdefault(int(link["certificado_arquivo_id"]), []).append(int(link["id"]))

    pending: list[dict] = []
    already: list[dict] = []
    for row in rows:
        did = row["documento_id"]
        fid = row["funcionario_id"]
        dest_id = row["historico_destino_id"]
        doc = doc_by_id.get(did)
        dest = hist_by_id.get(dest_id)
        if not doc or not dest:
            raise RuntimeError("reviewed document/history scope drift")
        if int(doc["funcionario_id"]) != fid or int(dest["funcionario_id"]) != fid:
            raise RuntimeError(f"employee linkage drift for documento_id={did}")
        if str(doc.get("r2_key") or "") != row["expected_r2_key"]:
            raise RuntimeError(f"r2_key drift for documento_id={did}")
        expected_current_name = (
            row.get("new_nome_arquivo")
            if row["action"] == "move_misclassified_document"
            and str(doc.get("nome_arquivo") or "") == str(row.get("new_nome_arquivo") or "")
            else row["expected_nome_arquivo"]
        )
        if str(doc.get("nome_arquivo") or "") != str(expected_current_name):
            raise RuntimeError(f"visible-name drift for documento_id={did}")
        if str(dest.get("codigo") or "").upper() != str(row["expected_destino_codigo"]).upper():
            raise RuntimeError(f"target qualification-code drift for historico_id={dest_id}")
        if str(dest.get("data_conclusao") or "") != str(row["expected_data_conclusao"]):
            raise RuntimeError(f"target completion-date drift for historico_id={dest_id}")
        if str(dest.get("data_vencimento") or "") != str(row["expected_data_vencimento"]):
            raise RuntimeError(f"target expiration-date drift for historico_id={dest_id}")

        if row["action"] == "link_existing_document":
            current = dest.get("certificado_arquivo_id")
            linked_histories = links_by_doc.get(did, [])
            if current is not None and int(current) == did and linked_histories == [dest_id]:
                already.append(row)
                continue
            if current is not None:
                raise RuntimeError(f"target history already has another certificate: {dest_id}")
            if linked_histories:
                raise RuntimeError(f"document already linked to another history: {did}")
            pending.append(row)
            continue

        src_id = row["historico_origem_id"]
        src = hist_by_id.get(src_id)
        if not src or int(src["funcionario_id"]) != fid:
            raise RuntimeError(f"source history drift for documento_id={did}")
        if str(src.get("codigo") or "").upper() != str(row["expected_origem_codigo"]).upper():
            raise RuntimeError(f"source qualification-code drift for historico_id={src_id}")
        if str(src.get("data_conclusao") or "") != str(row["expected_origem_data_conclusao"]):
            raise RuntimeError(f"source completion-date drift for historico_id={src_id}")
        src_current = src.get("certificado_arquivo_id")
        dest_current = dest.get("certificado_arquivo_id")
        if src_current is None and dest_current is not None and int(dest_current) == did:
            if str(doc.get("nome_arquivo") or "") != row["new_nome_arquivo"]:
                raise RuntimeError("moved evidence has unexpected visible name")
            already.append(row)
            continue
        if src_current is None or int(src_current) != did or dest_current is not None:
            raise RuntimeError(f"move precondition drift for documento_id={did}")
        if links_by_doc.get(did, []) != [src_id]:
            raise RuntimeError(f"document source-link set drift for documento_id={did}")
        pending.append(row)
    return pending, already


def guard_sql(predicate: str) -> str:
    # wrangler D1 --file rolls the file back on SQL error. A false reviewed-CAS
    # predicate deliberately evaluates malformed JSON to make that rollback explicit.
    return (
        "SELECT CASE WHEN (" + predicate + ") THEN 1 "
        "ELSE json_extract('AIRTRUST_RECONCILIATION_GUARD_FAILURE','$') END;"
    )


def apply_rows(rows: list[dict]) -> None:
    sql = ["PRAGMA foreign_keys=ON;"]
    for row in rows:
        did = row["documento_id"]
        fid = row["funcionario_id"]
        dest = row["historico_destino_id"]
        stream_url = f"/api/pasta-virtual/stream/{did}"
        if row["action"] == "link_existing_document":
            numero = Path(row["expected_nome_arquivo"]).stem
            precondition = (
                f"EXISTS (SELECT 1 FROM qualificacoes_historico q WHERE q.id={dest} "
                f"AND q.empresa_id={EMPRESA_ID} AND q.funcionario_id={fid} AND q.deleted_at IS NULL "
                "AND q.certificado_arquivo_id IS NULL "
                f"AND UPPER(COALESCE(q.qualificacao_codigo,q.codigo,q.tipo_codigo,''))=UPPER({sql_text(row['expected_destino_codigo'])}) "
                f"AND q.data_conclusao={sql_text(row['expected_data_conclusao'])} "
                f"AND q.data_vencimento={sql_text(row['expected_data_vencimento'])}) "
                f"AND EXISTS (SELECT 1 FROM documentos d WHERE d.id={did} AND d.empresa_id={EMPRESA_ID} "
                f"AND d.funcionario_id={fid} AND d.deleted_at IS NULL "
                f"AND d.r2_key={sql_text(row['expected_r2_key'])} "
                f"AND d.nome_arquivo={sql_text(row['expected_nome_arquivo'])}) "
                f"AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico q2 WHERE q2.empresa_id={EMPRESA_ID} "
                f"AND q2.deleted_at IS NULL AND q2.certificado_arquivo_id={did})"
            )
            sql.append(guard_sql(precondition))
            sql.append(
                "UPDATE qualificacoes_historico SET "
                f"certificado_arquivo_id={did},arquivo_url={sql_text(stream_url)},numero_certificado={sql_text(numero)},updated_at=datetime('now') "
                f"WHERE id={dest} AND empresa_id={EMPRESA_ID} AND funcionario_id={fid} AND deleted_at IS NULL "
                "AND certificado_arquivo_id IS NULL "
                f"AND UPPER(COALESCE(qualificacao_codigo,codigo,tipo_codigo,''))=UPPER({sql_text(row['expected_destino_codigo'])}) "
                f"AND data_conclusao={sql_text(row['expected_data_conclusao'])} "
                f"AND data_vencimento={sql_text(row['expected_data_vencimento'])};"
            )
        else:
            src = row["historico_origem_id"]
            new_name = row["new_nome_arquivo"]
            new_num = row["new_numero_certificado"]
            precondition = (
                f"EXISTS (SELECT 1 FROM qualificacoes_historico q WHERE q.id={src} "
                f"AND q.empresa_id={EMPRESA_ID} AND q.funcionario_id={fid} AND q.deleted_at IS NULL "
                f"AND q.certificado_arquivo_id={did} "
                f"AND UPPER(COALESCE(q.qualificacao_codigo,q.codigo,q.tipo_codigo,''))=UPPER({sql_text(row['expected_origem_codigo'])}) "
                f"AND q.data_conclusao={sql_text(row['expected_origem_data_conclusao'])}) "
                f"AND EXISTS (SELECT 1 FROM qualificacoes_historico q WHERE q.id={dest} "
                f"AND q.empresa_id={EMPRESA_ID} AND q.funcionario_id={fid} AND q.deleted_at IS NULL "
                "AND q.certificado_arquivo_id IS NULL "
                f"AND UPPER(COALESCE(q.qualificacao_codigo,q.codigo,q.tipo_codigo,''))=UPPER({sql_text(row['expected_destino_codigo'])}) "
                f"AND q.data_conclusao={sql_text(row['expected_data_conclusao'])} "
                f"AND q.data_vencimento={sql_text(row['expected_data_vencimento'])}) "
                f"AND EXISTS (SELECT 1 FROM documentos d WHERE d.id={did} AND d.empresa_id={EMPRESA_ID} "
                f"AND d.funcionario_id={fid} AND d.deleted_at IS NULL "
                f"AND d.nome_arquivo={sql_text(row['expected_nome_arquivo'])} "
                f"AND d.r2_key={sql_text(row['expected_r2_key'])}) "
                f"AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico q2 WHERE q2.empresa_id={EMPRESA_ID} "
                f"AND q2.deleted_at IS NULL AND q2.certificado_arquivo_id={did} AND q2.id<>{src}) "
                f"AND EXISTS (SELECT 1 FROM pasta_virtual pv WHERE pv.empresa_id={EMPRESA_ID} "
                f"AND pv.funcionario_id={fid} AND pv.deleted_at IS NULL "
                f"AND pv.caminho_arquivo={sql_text(row['expected_r2_key'])} AND pv.certificacao_id={src})"
            )
            sql.append(guard_sql(precondition))
            # Move source and destination in one statement so there is no intermediate
            # history state where the same evidence is attached twice.
            sql.append(
                "UPDATE qualificacoes_historico SET "
                f"certificado_arquivo_id=CASE WHEN id={src} THEN NULL WHEN id={dest} THEN {did} ELSE certificado_arquivo_id END,"
                f"arquivo_url=CASE WHEN id={src} THEN NULL WHEN id={dest} THEN {sql_text(stream_url)} ELSE arquivo_url END,"
                f"numero_certificado=CASE WHEN id={src} THEN NULL WHEN id={dest} THEN {sql_text(new_num)} ELSE numero_certificado END,"
                "updated_at=datetime('now') "
                f"WHERE empresa_id={EMPRESA_ID} AND funcionario_id={fid} AND deleted_at IS NULL "
                f"AND id IN ({src},{dest}) "
                f"AND (SELECT certificado_arquivo_id FROM qualificacoes_historico WHERE id={src} "
                f"AND empresa_id={EMPRESA_ID} AND funcionario_id={fid} AND deleted_at IS NULL)={did} "
                f"AND (SELECT certificado_arquivo_id FROM qualificacoes_historico WHERE id={dest} "
                f"AND empresa_id={EMPRESA_ID} AND funcionario_id={fid} AND deleted_at IS NULL) IS NULL;"
            )
            sql.append(
                f"UPDATE documentos SET nome_arquivo={sql_text(new_name)},updated_at=datetime('now') "
                f"WHERE id={did} AND empresa_id={EMPRESA_ID} AND funcionario_id={fid} AND deleted_at IS NULL "
                f"AND nome_arquivo={sql_text(row['expected_nome_arquivo'])} AND r2_key={sql_text(row['expected_r2_key'])} "
                f"AND EXISTS (SELECT 1 FROM qualificacoes_historico q WHERE q.id={dest} AND q.empresa_id={EMPRESA_ID} "
                f"AND q.funcionario_id={fid} AND q.deleted_at IS NULL AND q.certificado_arquivo_id={did}) "
                f"AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico q WHERE q.id={src} AND q.empresa_id={EMPRESA_ID} "
                f"AND q.funcionario_id={fid} AND q.deleted_at IS NULL AND q.certificado_arquivo_id IS NOT NULL);"
            )
            sql.append(
                f"UPDATE pasta_virtual SET certificacao_id={dest},nome_arquivo={sql_text(new_name)},updated_at=datetime('now') "
                f"WHERE funcionario_id={fid} AND empresa_id={EMPRESA_ID} AND deleted_at IS NULL "
                f"AND caminho_arquivo={sql_text(row['expected_r2_key'])} AND certificacao_id={src} "
                f"AND EXISTS (SELECT 1 FROM qualificacoes_historico q WHERE q.id={dest} AND q.empresa_id={EMPRESA_ID} "
                f"AND q.funcionario_id={fid} AND q.deleted_at IS NULL AND q.certificado_arquivo_id={did});"
            )
        old_json = json.dumps(
            {
                "documento_id": did,
                "historico_origem_id": row.get("historico_origem_id"),
                "historico_destino_id": dest,
                "r2_key": row["expected_r2_key"],
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        new_json = json.dumps(
            {
                "action": row["action"],
                "documento_id": did,
                "historico_destino_id": dest,
                "r2_mutated": False,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        sql.append(
            "INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at) "
            f"SELECT NULL,{sql_text(AUDIT_ACTION)},'qualificacoes_historico',{dest},{sql_text(old_json)},{sql_text(new_json)},{EMPRESA_ID},datetime('now') "
            f"WHERE EXISTS (SELECT 1 FROM qualificacoes_historico q WHERE q.id={dest} AND q.empresa_id={EMPRESA_ID} "
            f"AND q.funcionario_id={fid} AND q.deleted_at IS NULL AND q.certificado_arquivo_id={did}) "
            f"AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.empresa_id={EMPRESA_ID} AND a.action={sql_text(AUDIT_ACTION)} "
            f"AND a.entity_type='qualificacoes_historico' AND a.entity_id={dest});"
        )
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as handle:
        handle.write("\n".join(sql) + "\n")
        path = Path(handle.name)
    try:
        run(
            ["npx", "--no-install", "wrangler", "d1", "execute", DB_NAME, "--env", "production", "--remote", f"--file={path}"],
            WORKER,
        )
    finally:
        path.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["dry-run", "apply"])
    p.add_argument("--plan", required=True, type=Path)
    p.add_argument("--expected-sha")
    p.add_argument("--expected-plan-sha")
    p.add_argument("--expected-candidate-count", type=int)
    p.add_argument("--expected-candidate-hash")
    p.add_argument("--confirmation")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if not args.plan.is_file():
        raise RuntimeError("reviewed plan not found")
    resolved_plan = args.plan.resolve()
    if ROOT == resolved_plan or ROOT in resolved_plan.parents:
        raise RuntimeError("reviewed plan must remain outside git")
    plan_sha = sha256_file(args.plan)
    rows = validate_plan(json.loads(args.plan.read_text(encoding="utf-8")))
    pending, already = live_state(rows)
    digest = candidate_hash(pending)
    head, origin_main, branch = git_state()
    summary = {
        "mode": args.mode,
        "source_sha": head,
        "origin_main": origin_main,
        "empresa_id": EMPRESA_ID,
        "plan_sha256": plan_sha,
        "reviewed_rows": len(rows),
        "candidate_count": len(pending),
        "already_applied": len(already),
        "candidate_hash": digest,
        "candidate_by_action": dict(Counter(r["action"] for r in pending)),
        "r2_mutations": 0,
        "mutation_executed": False,
        "pii_emitted": False,
    }
    if args.mode == "dry-run":
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    dirty = run(["git", "status", "--porcelain"]).stdout.strip()
    if branch != "main" or head != origin_main or dirty:
        raise RuntimeError("apply requires exact clean origin/main on branch main")
    if args.expected_sha != head:
        raise RuntimeError("expected main SHA mismatch")
    if args.expected_plan_sha != plan_sha:
        raise RuntimeError("reviewed plan SHA mismatch")
    if args.expected_candidate_count != len(pending) or args.expected_candidate_hash != digest:
        raise RuntimeError("reviewed candidate set mismatch")
    if args.confirmation != CONFIRM:
        raise RuntimeError("apply confirmation mismatch")
    verify_target()
    recovery = recovery_point()
    apply_rows(pending)

    remaining, applied = live_state(rows)
    if remaining or len(applied) != len(rows):
        raise RuntimeError(
            f"postcondition failed remaining={len(remaining)} applied={len(applied)} expected={len(rows)}"
        )
    target_ids = ",".join(str(r["historico_destino_id"]) for r in rows)
    audit_count = int(
        query(
            f"SELECT COUNT(*) AS n FROM audit_logs WHERE empresa_id={EMPRESA_ID} AND action={sql_text(AUDIT_ACTION)} "
            f"AND entity_type='qualificacoes_historico' AND entity_id IN ({target_ids})"
        )[0]["n"]
    )
    if audit_count != len(rows):
        raise RuntimeError(f"audit postcondition failed audit_count={audit_count} expected={len(rows)}")
    summary.update(
        mutation_executed=True,
        applied_count=len(pending),
        post_remaining=0,
        post_all_reconciled=len(applied),
        audit_rows=audit_count,
        postconditions_verified=True,
        recovery_timestamp_utc=recovery,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
