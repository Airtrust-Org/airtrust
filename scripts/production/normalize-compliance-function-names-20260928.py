#!/usr/bin/env python3
"""Normalize three Costa do Sol compliance function names without changing IDs."""
from __future__ import annotations
import argparse, hashlib, json, subprocess, tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "worker-airtrust"
DB_NAME = "airtrust-db"
DB_ID = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
EMPRESA_ID = 6
CONFIRM = "NORMALIZAR-CARGOS-COMPLIANCE-20260928"
CHANGES = [
    {"id": 35, "old": "Analista de CTM I", "new": "Analista de CTM", "cargo": "Analista de CTM"},
    {"id": 37, "old": "Auxiliar de CTM I", "new": "Auxiliar de CTM", "cargo": "Auxiliar de CTM"},
    {"id": 36, "old": "Analista de Suprimentos II", "new": "Supervisor de Suprimentos", "cargo": "Supervisor de Suprimentos"},
]

def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, check=True)

def query(sql):
    cmd = ["npx", "--no-install", "wrangler", "d1", "execute", DB_NAME,
           "--env", "production", "--remote", "--json", "--command", sql]
    payload = json.loads(run(cmd, WORKER).stdout)
    return [row for block in payload for row in block.get("results", [])]

def git_state():
    return (
        run(["git", "rev-parse", "HEAD"]).stdout.strip(),
        run(["git", "rev-parse", "origin/main"]).stdout.strip(),
        run(["git", "branch", "--show-current"]).stdout.strip(),
    )

def verify_target():
    info = json.loads(run(["npx", "--no-install", "wrangler", "d1", "info", DB_NAME,
                           "--env", "production", "--json"], WORKER).stdout)
    if info.get("uuid") != DB_ID or info.get("name") != DB_NAME:
        raise RuntimeError("production D1 target identity mismatch")

def recovery_point():
    ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    run(["npx", "--no-install", "wrangler", "d1", "time-travel", "info", DB_NAME,
         "--env", "production", f"--timestamp={ts}", "--json"], WORKER)
    return ts

def state():
    ids = ",".join(str(c["id"]) for c in CHANGES)
    funcs = query(f"SELECT id,nome,codigo,ativo,deleted_at FROM funcoes WHERE empresa_id={EMPRESA_ID} AND id IN ({ids}) ORDER BY id")
    people = query(f"SELECT funcao_id,funcao,cargo,COUNT(*) AS n FROM funcionarios WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND COALESCE(ativo,1)=1 AND funcao_id IN ({ids}) GROUP BY funcao_id,funcao,cargo ORDER BY funcao_id")
    req = query(f"SELECT funcao_id,COUNT(*) AS n FROM treinamento_requisitos WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND ativo=1 AND funcao_id IN ({ids}) GROUP BY funcao_id ORDER BY funcao_id")
    enroll = int(query(f"SELECT COUNT(*) AS n FROM lms_matriculas WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL")[0]["n"])
    rules = int(query(f"SELECT COUNT(*) AS n FROM treinamento_requisitos WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND ativo=1")[0]["n"])
    return {"funcoes": funcs, "pessoas": people, "requisitos": req, "matriculas": enroll, "regras": rules}

def plan(st):
    by_id = {int(r["id"]): r for r in st["funcoes"]}
    actions = []
    for c in CHANGES:
        row = by_id.get(c["id"])
        if not row or row.get("deleted_at") is not None or int(row.get("ativo") or 0) != 1:
            raise RuntimeError(f"funcao_id {c['id']} missing/inactive")
        current = str(row.get("nome") or "")
        if current == c["new"]:
            continue
        if current != c["old"]:
            raise RuntimeError(f"unexpected name for funcao_id {c['id']}: {current!r}")
        escaped = c["new"].replace("'", "''")
        collision = query(f"SELECT id FROM funcoes WHERE empresa_id=6 AND deleted_at IS NULL AND id<>{c['id']} AND LOWER(TRIM(nome))=LOWER(TRIM('{escaped}'))")
        if collision:
            raise RuntimeError(f"target name collision for {c['new']}")
        actions.append(c)
    return actions

def candidate_hash(actions):
    raw = json.dumps(actions, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()

def apply_actions(actions):
    sql = ["BEGIN TRANSACTION;"]
    for c in actions:
        old = c["old"].replace("'", "''")
        new = c["new"].replace("'", "''")
        cargo = c["cargo"].replace("'", "''")
        sql.append(f"UPDATE funcoes SET nome='{new}', updated_at=datetime('now') WHERE empresa_id=6 AND id={c['id']} AND nome='{old}' AND deleted_at IS NULL;")
        sql.append(f"UPDATE funcionarios SET funcao='{new}', updated_at=datetime('now') WHERE empresa_id=6 AND funcao_id={c['id']} AND deleted_at IS NULL AND COALESCE(ativo,1)=1 AND cargo='{cargo}';")
    sql.append("COMMIT;")
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write("\n".join(sql)); path = Path(f.name)
    try:
        run(["npx", "--no-install", "wrangler", "d1", "execute", DB_NAME,
             "--env", "production", "--remote", f"--file={path}"], WORKER)
    finally:
        path.unlink(missing_ok=True)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--apply", action="store_true")
    p.add_argument("--expected-sha")
    p.add_argument("--expected-count", type=int)
    p.add_argument("--expected-hash")
    p.add_argument("--confirmation")
    a = p.parse_args()
    head, origin, branch = git_state()
    before = state()
    actions = plan(before)
    digest = candidate_hash(actions)
    summary = {
        "mode": "apply" if a.apply else "dry-run",
        "head": head,
        "origin_main": origin,
        "actions": actions,
        "count": len(actions),
        "candidate_hash": digest,
        "rules_before": before["regras"],
        "enrollments_before": before["matriculas"],
    }
    if not a.apply:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return
    dirty = run(["git", "status", "--porcelain"]).stdout.strip()
    if head != origin or branch != "main" or dirty:
        raise RuntimeError("apply requires exact clean origin/main on branch main")
    if a.expected_sha != head or a.expected_count != len(actions) or a.expected_hash != digest:
        raise RuntimeError("reviewed candidate mismatch")
    if a.confirmation != CONFIRM:
        raise RuntimeError("confirmation mismatch")
    verify_target()
    rp = recovery_point()
    apply_actions(actions)
    after = state()
    remaining = plan(after)
    if remaining:
        raise RuntimeError(f"post-validation still has {len(remaining)} changes")
    if after["regras"] != before["regras"] or after["matriculas"] != before["matriculas"]:
        raise RuntimeError("requirements/enrollments changed")
    summary.update({"recovery_point": rp, "remaining": 0,
                    "rules_after": after["regras"], "enrollments_after": after["matriculas"]})
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
