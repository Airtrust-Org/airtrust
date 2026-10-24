#!/usr/bin/env python3
"""Governed visible-name normalization for the 2026-10-03 S-76 document batch.

The reviewed plan remains outside git. This script only updates documentos.nome_arquivo;
r2_key, document identity, payloads, employee linkage, and qualification linkage are immutable.
Apply requires exact clean main, reviewed plan SHA/count/hash, production D1 identity,
a Time Travel recovery point, CAS-style current-name/r2-key preconditions, audit rows,
and read-back postconditions.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
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
CONFIRM = "AIRTRUST_PRODUCTION_RENAME_DOCUMENT_BATCH_SK76_20261003"
AUDIT_ACTION = "DOCUMENT_BATCH_CANONICAL_RENAME_SK76_20261003"
EXPECTED_EMPLOYEE_IDS = {3, 7, 10, 15, 19, 22, 29, 32, 35, 37, 38, 39, 42, 66, 67}


def run(cmd: list[str], cwd: Path = ROOT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, check=True)


def query(sql: str) -> list[dict]:
    cmd = [
        "npx", "--no-install", "wrangler", "d1", "execute", DB_NAME,
        "--env", "production", "--remote", "--json", "--command", sql,
    ]
    payload = json.loads(run(cmd, WORKER).stdout)
    return [row for block in payload for row in block.get("results", [])]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sql_text(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


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
    if not isinstance(raw, list):
        raise RuntimeError("rename plan must be a JSON array")
    required = {
        "documento_id", "funcionario_id", "expected_current_name", "new_name",
        "expected_r2_key", "reason", "source_sha256",
    }
    rows: list[dict] = []
    ids: set[int] = set()
    targets: set[tuple[int, str]] = set()
    for item in raw:
        if not isinstance(item, dict) or not required.issubset(item):
            raise RuntimeError("rename plan row violates required contract")
        row = dict(item)
        row["documento_id"] = int(row["documento_id"])
        row["funcionario_id"] = int(row["funcionario_id"])
        if row["documento_id"] <= 0 or row["funcionario_id"] not in EXPECTED_EMPLOYEE_IDS:
            raise RuntimeError("rename plan row outside reviewed employee scope")
        old = str(row["expected_current_name"] or "").strip()
        new = str(row["new_name"] or "").strip()
        key = str(row["expected_r2_key"] or "").strip()
        reason = str(row["reason"] or "").strip()
        source_sha = str(row["source_sha256"] or "").lower()
        if not old.lower().endswith(".pdf") or not new.lower().endswith(".pdf"):
            raise RuntimeError("rename plan requires PDF visible names")
        if "/" in old or "\\" in old or "/" in new or "\\" in new:
            raise RuntimeError("visible names must be basenames, not paths")
        if len(new.encode("utf-8")) > 240:
            raise RuntimeError("target visible name too long")
        if not key or not re.fullmatch(r"[0-9a-f]{64}", source_sha):
            raise RuntimeError("rename plan row missing immutable provenance")
        if not reason:
            raise RuntimeError("rename plan row missing reason")
        if row["documento_id"] in ids:
            raise RuntimeError("duplicate documento_id in rename plan")
        target = (row["funcionario_id"], new)
        if target in targets:
            raise RuntimeError("duplicate target visible name inside employee scope")
        ids.add(row["documento_id"])
        targets.add(target)
        row.update(
            expected_current_name=old,
            new_name=new,
            expected_r2_key=key,
            reason=reason,
            source_sha256=source_sha,
        )
        rows.append(row)
    return sorted(rows, key=lambda row: row["documento_id"])


def candidate_hash(rows: list[dict]) -> str:
    material = "\n".join(
        f"{r['documento_id']}|{r['funcionario_id']}|{r['expected_current_name']}|{r['new_name']}|{r['expected_r2_key']}|{r['reason']}"
        for r in sorted(rows, key=lambda row: row["documento_id"])
    ).encode()
    return hashlib.sha256(material).hexdigest()


def live_state(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    if not rows:
        return [], []
    ids = ",".join(str(r["documento_id"]) for r in rows)
    live = query(
        "SELECT id,funcionario_id,nome_arquivo,r2_key FROM documentos "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND id IN ({ids}) ORDER BY id"
    )
    by_id = {int(r["id"]): r for r in live}
    if set(by_id) != {r["documento_id"] for r in rows}:
        missing = sorted({r["documento_id"] for r in rows} - set(by_id))
        raise RuntimeError(f"reviewed document scope drift: missing_count={len(missing)}")

    # Fail closed on target-name collision with any other live row in the reviewed employees.
    employee_ids = ",".join(str(i) for i in sorted(EXPECTED_EMPLOYEE_IDS))
    all_names = query(
        "SELECT id,funcionario_id,nome_arquivo FROM documentos "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND funcionario_id IN ({employee_ids})"
    )
    occupied = {(int(r["funcionario_id"]), str(r["nome_arquivo"] or "")): int(r["id"]) for r in all_names}

    pending: list[dict] = []
    already: list[dict] = []
    for row in rows:
        doc = by_id[row["documento_id"]]
        if int(doc["funcionario_id"]) != row["funcionario_id"]:
            raise RuntimeError(f"employee linkage drift for documento_id={row['documento_id']}")
        if str(doc.get("r2_key") or "") != row["expected_r2_key"]:
            raise RuntimeError(f"r2_key drift for documento_id={row['documento_id']}")
        current = str(doc.get("nome_arquivo") or "")
        if current == row["new_name"]:
            already.append(row)
            continue
        if current != row["expected_current_name"]:
            raise RuntimeError(f"visible-name CAS drift for documento_id={row['documento_id']}")
        collision_id = occupied.get((row["funcionario_id"], row["new_name"]))
        if collision_id is not None and collision_id != row["documento_id"]:
            raise RuntimeError(f"target visible-name collision for documento_id={row['documento_id']}")
        pending.append(row)
    return pending, already


def apply_rows(rows: list[dict]) -> None:
    sql = ["PRAGMA foreign_keys=ON;"]
    for row in rows:
        old_json = json.dumps({"nome_arquivo": row["expected_current_name"], "r2_key": row["expected_r2_key"]}, ensure_ascii=False, separators=(",", ":"))
        new_json = json.dumps({"nome_arquivo": row["new_name"], "r2_key": row["expected_r2_key"], "reason": row["reason"]}, ensure_ascii=False, separators=(",", ":"))
        sql.append(
            "UPDATE documentos SET "
            f"nome_arquivo={sql_text(row['new_name'])},updated_at=datetime('now') "
            f"WHERE id={row['documento_id']} AND empresa_id={EMPRESA_ID} AND funcionario_id={row['funcionario_id']} "
            "AND deleted_at IS NULL "
            f"AND nome_arquivo={sql_text(row['expected_current_name'])} AND r2_key={sql_text(row['expected_r2_key'])};"
        )
        sql.append(
            "INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at) "
            f"SELECT NULL,{sql_text(AUDIT_ACTION)},'documentos',{row['documento_id']},{sql_text(old_json)},{sql_text(new_json)},{EMPRESA_ID},datetime('now') "
            f"WHERE EXISTS (SELECT 1 FROM documentos WHERE id={row['documento_id']} AND empresa_id={EMPRESA_ID} "
            f"AND funcionario_id={row['funcionario_id']} AND deleted_at IS NULL AND nome_arquivo={sql_text(row['new_name'])} "
            f"AND r2_key={sql_text(row['expected_r2_key'])}) "
            f"AND NOT EXISTS (SELECT 1 FROM audit_logs WHERE empresa_id={EMPRESA_ID} AND action={sql_text(AUDIT_ACTION)} "
            f"AND entity_type='documentos' AND entity_id={row['documento_id']});"
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
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["dry-run", "apply"])
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--expected-sha")
    parser.add_argument("--expected-plan-sha")
    parser.add_argument("--expected-candidate-count", type=int)
    parser.add_argument("--expected-candidate-hash")
    parser.add_argument("--confirmation")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.plan.is_file():
        raise RuntimeError("rename plan not found")
    if ROOT == args.plan.resolve() or ROOT in args.plan.resolve().parents:
        raise RuntimeError("reviewed rename plan must remain outside git")
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
        "candidate_by_reason": dict(Counter(r["reason"] for r in pending)),
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
        raise RuntimeError("reviewed plan SHA-256 mismatch")
    if args.expected_candidate_count != len(pending) or args.expected_candidate_hash != digest:
        raise RuntimeError("reviewed candidate set mismatch")
    if args.confirmation != CONFIRM:
        raise RuntimeError("apply confirmation mismatch")
    verify_target()
    recovery = recovery_point()
    apply_rows(pending)

    remaining, applied = live_state(rows)
    if remaining or len(applied) != len(rows):
        raise RuntimeError(f"postcondition failed remaining={len(remaining)} applied={len(applied)} expected={len(rows)}")
    audit_count = int(
        query(
            f"SELECT COUNT(*) AS n FROM audit_logs WHERE empresa_id={EMPRESA_ID} AND action={sql_text(AUDIT_ACTION)} "
            f"AND entity_type='documentos' AND entity_id IN ({','.join(str(r['documento_id']) for r in rows)})"
        )[0]["n"]
    )
    if audit_count != len(rows):
        raise RuntimeError(f"audit postcondition failed audit_count={audit_count} expected={len(rows)}")
    summary.update(
        mutation_executed=True,
        applied_count=len(pending),
        post_remaining=0,
        post_all_named=len(applied),
        audit_rows=audit_count,
        postconditions_verified=True,
        recovery_timestamp_utc=recovery,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
