#!/usr/bin/env python3
"""Guarded D1/R2 release executor for canonical PTO V18 instructor reference guides.

No tenant/historical modifications outside the 88 new V18 guides.
Requires an explicit exact SQL SHA and a verified production preflight.
"""
import argparse
import hashlib
import importlib.util
import json
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

PLAN = Path(__file__).with_name("build-pto-v18-guide-import-plan.py")
_spec = importlib.util.spec_from_file_location("pto_guide_plan", PLAN)
planner = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(planner)
DB = "airtrust-db"
BUCKET = "airtrust-storage"
TENANT = 6


def command(wrangler_dir, args, parse=False):
    proc = subprocess.run(
        ["npx", "wrangler", *args], cwd=wrangler_dir,
        capture_output=True, text=True, timeout=180,
    )
    if proc.returncode:
        raise RuntimeError(
            "WRANGLER_FAILED " + " ".join(args[:6]) + ": " +
            (proc.stderr or proc.stdout)[-1200:]
        )
    if parse:
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError as e:
            raise RuntimeError("WRANGLER_JSON_PARSE_FAILED: " + proc.stdout[-600:]) from e
    return proc.stdout


def query(wrangler_dir, sql):
    data = command(
        wrangler_dir,
        ["d1", "execute", DB, "--env", "production", "--remote", "--command", sql, "--json"],
        parse=True,
    )
    if len(data) != 1 or data[0].get("success") is not True:
        raise RuntimeError("D1_READBACK_UNEXPECTED")
    meta = data[0].get("meta", {})
    if meta.get("rows_written", 0) != 0 or meta.get("changed_db", False):
        raise RuntimeError("D1_READONLY_QUERY_WROTE_ROWS")
    return data[0]["results"]


def live_snapshot(wrangler_dir):
    models = query(wrangler_dir, """
SELECT v.codigo_canonico,v.modelo_id,v.versao_matriz,m.modelo_aeronave,m.empresa_id
FROM modelos_sessao_versionamento v JOIN modelos_sessao m ON m.id=v.modelo_id
WHERE v.empresa_id=6 AND v.is_current=1 ORDER BY v.codigo_canonico;
""".strip())
    aircraft = query(wrangler_dir, """
SELECT id,codigo,modelo FROM modelos_aeronave
WHERE empresa_id=6 AND deleted_at IS NULL ORDER BY codigo;
""".strip())
    links = query(wrangler_dir, """
SELECT COUNT(*) n FROM simuladores_modelos_sessao_guias_v2 l
JOIN modelos_sessao_versionamento v ON v.modelo_id=l.modelo_sessao_id
WHERE l.empresa_id=6 AND l.deleted_at IS NULL AND v.empresa_id=6
AND v.is_current=1 AND v.versao_matriz='PTO-REV10-V18';
""".strip())[0]["n"]
    return {"models": models, "aircraft": aircraft, "links": links}


def baseline(wrangler_dir):
    return query(wrangler_dir, """
SELECT
  (SELECT COUNT(*) FROM simuladores_guias_instrutor_v2
   WHERE empresa_id=6 AND deleted_at IS NULL AND
   codigo NOT LIKE '%@PTO-REV10-V18') AS legacy_guides,
  (SELECT COUNT(*) FROM simuladores_modelos_sessao_guias_v2 l
   JOIN simuladores_guias_instrutor_v2 g ON g.id=l.guia_id
   WHERE l.empresa_id=6 AND l.deleted_at IS NULL
   AND g.empresa_id=6 AND g.codigo NOT LIKE '%@PTO-REV10-V18') AS legacy_links,
  (SELECT COUNT(*) FROM fichas_sessao WHERE empresa_id=6) AS historical_fichas;
""".strip())[0]


def validate_plan(plan_dir, guide_dir, snapshot):
    plan_dir = Path(plan_dir)
    plan = json.loads((plan_dir / "plano_importacao_v18.json").read_text())
    if (plan.get("source_sha256") != planner.SOURCE_SHA
            or plan.get("tenant") != TENANT or plan.get("matrix") != planner.MATRIX
            or plan.get("guide_count") != 88 or len(plan.get("guides", [])) != 88):
        raise ValueError("RELEASE_PLAN_INVALID_SOURCE_TENANT_OR_COUNT")
    regenerated = planner.make_plan(guide_dir, snapshot)
    if regenerated != plan:
        raise ValueError("RELEASE_PLAN_DIFFERS_FROM_CURRENT_VERIFIED_FILES")
    sql_data = planner.make_sql(plan).encode()
    sql_file = plan_dir / "importacao_v18.sql"
    if sql_file.read_bytes() != sql_data:
        raise ValueError("REVIEWED_SQL_DIFFERS_FROM_DETERMINISTIC_GENERATOR")
    return plan, hashlib.sha256(sql_data).hexdigest()


def _upload_one(wrangler_dir, file_path, key, sha, mime):
    file_path = Path(file_path)
    if hashlib.sha256(file_path.read_bytes()).hexdigest() != sha:
        raise ValueError("LOCAL_SHA_DRIFT:" + key)
    for attempt in range(3):
        try:
            command(wrangler_dir, [
                "r2", "object", "put", BUCKET + "/" + key,
                "--remote", "--file", str(file_path), "--content-type", mime,
            ])
            with tempfile.TemporaryDirectory(prefix="pto-v18-r2-verification-") as tmp:
                readback = Path(tmp) / "obj"
                command(wrangler_dir, [
                    "r2", "object", "get", BUCKET + "/" + key,
                    "--remote", "--file", str(readback),
                ])
                if hashlib.sha256(readback.read_bytes()).hexdigest() != sha:
                    raise ValueError("R2_REMOTE_SHA_DRIFT:" + key)
            return
        except (RuntimeError, OSError) as exc:
            if attempt == 2:
                raise
            time.sleep(2 + 2 * attempt)
    raise RuntimeError("R2_RETRY_EXHAUSTED:" + key)


def upload_all(wrangler_dir, plan):
    targets = []
    for guide in plan["guides"]:
        targets.extend([
            (guide["html_path"], guide["r2_html"], guide["html_sha256"], "text/html; charset=utf-8"),
            (guide["pdf_path"], guide["r2_pdf"], guide["pdf_sha256"], "application/pdf"),
        ])
    if len(targets) != 176 or len({t[1] for t in targets}) != 176:
        raise ValueError("R2_KEY_COLLISION_OR_MISSING_DOCUMENTS")
    completed = 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(_upload_one, wrangler_dir, *target): target[1]
            for target in targets
        }
        for future in as_completed(futures):
            future.result()
            completed += 1
            if completed % 16 == 0 or completed == 176:
                print(json.dumps({"r2_uploaded_verified": completed, "total": 176}), flush=True)


def postconditions(wrangler_dir, plan, before):
    version = planner.sql(plan["version"])
    source = planner.sql(planner.SOURCE_SHA)
    stats = query(wrangler_dir, f"""
SELECT
 (SELECT COUNT(*) FROM simuladores_guias_instrutor_v2 g
  WHERE g.empresa_id=6 AND g.status='ATIVO' AND g.versao={version}
  AND g.versao_curriculo='PTO-REV10-V18' AND g.deleted_at IS NULL) AS active_guides,
 (SELECT COUNT(*) FROM simuladores_modelos_sessao_guias_v2 l
  JOIN simuladores_guias_instrutor_v2 g ON l.guia_id=g.id
  JOIN modelos_sessao_versionamento v ON v.modelo_id=l.modelo_sessao_id
  WHERE l.empresa_id=6 AND l.deleted_at IS NULL AND g.empresa_id=6
  AND g.versao={version} AND g.status='ATIVO' AND v.empresa_id=6
  AND v.is_current=1 AND v.versao_matriz='PTO-REV10-V18'
  AND g.codigo=v.codigo_canonico || '@PTO-REV10-V18') AS valid_links,
 (SELECT COUNT(DISTINCT l.modelo_sessao_id) FROM simuladores_modelos_sessao_guias_v2 l
  JOIN simuladores_guias_instrutor_v2 g ON g.id=l.guia_id
  WHERE l.empresa_id=6 AND l.deleted_at IS NULL AND g.empresa_id=6 AND g.versao={version}) AS distinct_models,
 (SELECT COUNT(*) FROM simuladores_guias_instrutor_v2 g
  WHERE g.empresa_id=6 AND g.versao={version}
  AND g.documento_referencia NOT LIKE '%' || {source} || '%') AS wrong_sources;
""".strip())[0]
    after = baseline(wrangler_dir)
    if (stats != {"active_guides": 88, "valid_links": 88, "distinct_models": 88, "wrong_sources": 0}
            or after != before):
        raise RuntimeError(
            "PRODUCTION_POSTCONDITIONS_FAIL: " +
            json.dumps({"current": stats, "historical_before": before, "historical_after": after})
        )
    return {"guides": stats, "historical": after}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan-dir", type=Path, required=True)
    ap.add_argument("--guides", type=Path, required=True)
    ap.add_argument("--snapshot", type=Path, required=True)
    ap.add_argument("--wrangler-dir", type=Path, required=True)
    ap.add_argument("--expected-sql-sha256", required=True)
    ap.add_argument("--apply-production-tenant-6", action="store_true")
    args = ap.parse_args()
    expected = json.loads(args.snapshot.read_text())
    plan, sql_hash = validate_plan(args.plan_dir, args.guides, expected)
    if sql_hash != args.expected_sql_sha256:
        raise ValueError("SQL_HASH_DIFFERENT_FROM_AUTHORIZED_REVIEW")
    if not args.apply_production_tenant_6:
        print(json.dumps({"status": "DRY_RUN_NO_WRITES", "guides": 88, "sql_sha256": sql_hash}))
        return
    live = live_snapshot(args.wrangler_dir)
    if sorted(live["models"], key=lambda v: v["codigo_canonico"]) != sorted(
            expected["models"], key=lambda v: v["codigo_canonico"]
    ) or sorted(live["aircraft"], key=lambda v: v["codigo"]) != sorted(
            expected["aircraft"], key=lambda v: v["codigo"]
    ) or live["links"] != 0:
        raise RuntimeError("PRODUCTION_PREFLIGHT_DRIFT_ABORT")
    old = baseline(args.wrangler_dir)
    bookmark = command(
        args.wrangler_dir,
        ["d1", "time-travel", "info", DB, "--env", "production", "--json"],
        parse=True,
    )["bookmark"]
    if not bookmark:
        raise RuntimeError("D1_BACKUP_BOOKMARK_MISSING")
    evidence = {"status": "R2_UPLOAD_STARTED", "sql_sha256": sql_hash,
                "d1_bookmark": bookmark, "old_counts": old, "source": planner.SOURCE_SHA}
    evidence_path = args.plan_dir / "resultado_importacao_v18.json"
    evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"preflight": "PASS", "bookmark": bookmark, "legacy": old}), flush=True)
    upload_all(args.wrangler_dir, plan)
    evidence["status"] = "R2_176_HASH_VERIFIED"
    evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    # The already-reviewed SQL remains exactly the file that matched the approved SHA.
    command(args.wrangler_dir, [
        "d1", "execute", DB, "--env", "production", "--remote", "--file",
        str(args.plan_dir / "importacao_v18.sql"), "--json",
    ])
    evidence["status"] = "D1_APPLIED_AWAITING_READBACK"
    evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    verified = postconditions(args.wrangler_dir, plan, old)
    evidence.update({"status": "PRODUCTION_READBACK_PASS", "verified": verified})
    evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(evidence, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
