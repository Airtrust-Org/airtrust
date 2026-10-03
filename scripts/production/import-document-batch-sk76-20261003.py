#!/usr/bin/env python3
"""Governed production importer for the 2026-10-03 S-76 fifteen-employee document batch.

Source PDFs and plan remain outside git. Dry-run is read-only. Apply is locked to an
exact clean main SHA, plan hash, candidate count/hash, and D1 Time Travel recovery
point. R2 writes happen before the atomic D1 registration batch; deterministic keys
and source markers make reruns idempotent.
"""
from __future__ import annotations

import argparse, hashlib, json, re, subprocess, tempfile, unicodedata, uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

EMPRESA_ID = 6
DB_NAME = "airtrust-db"
DB_ID = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
R2_BUCKET = "airtrust-storage"
CONFIRM_APPLY = "AIRTRUST_PRODUCTION_APPLY_DOCUMENT_BATCH_SK76_20261003"
BATCH = "document-batch-sk76-20261003"
IMPORT_DATE = "20261003"
ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "worker-airtrust"
EXPECTED_EMPLOYEES = {3: "Ramos", 7: "Dieter", 10: "La Rocque", 15: "Marinho", 19: "Magioli", 22: "Paloma", 29: "Santanna", 32: "Vitor", 35: "Negreiros", 37: "Karl", 38: "Gabriel", 39: "Diego", 42: "Jair", 66: "Vargas", 67: "Monteiro"}
PREFIX = {
    "CERTIFICADO_QUALIFICACAO": "Cert", "AVALIACAO_CQ": "Aval", "FTV": "Ftv",
    "EXAME_MEDICO": "Exame", "DOCUMENTO_PESSOAL": "Doc", "LICENCA": "Lic",
    "SIMULADOR": "Sim", "DESIGNACAO_OPERACIONAL": "Desig", "EXPERIENCIA_HORAS": "Exp",
    "INSTRUTOR_EXAMINADOR": "Inst", "VINCULO_FUNCIONAL": "Vinc",
    "CURRICULO_PROFISSIONAL": "Curr", "TREINAMENTO": "Trein", "OUTRO": "Doc-Outros",
}


def run(cmd: list[str], cwd: Path = ROOT, check: bool = True) -> subprocess.CompletedProcess[str]:
    p = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if check and p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip() or f"command failed: {cmd[0]}")
    return p


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sql_text(v: object) -> str:
    if v is None: return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def wrangler_query(sql: str) -> list[dict]:
    cmd = ["npx", "--no-install", "wrangler", "d1", "execute", DB_NAME,
           "--env", "production", "--remote", "--json", "--command", sql]
    payload = json.loads(run(cmd, WORKER).stdout)
    return [row for block in payload for row in block.get("results", [])]


def normalize_token(value: str, fallback: str = "DOC", limit: int = 48) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"\([^)]*(?:19|20)\d{2}[^)]*\)", " ", text)
    text = re.sub(r"\b[vV][._ -]?(?:19|20)\d{2}(?:[._ -]\d{1,2}){0,2}\b", " ", text)
    text = re.sub(r"\b(?:19|20)\d{2}(?:[._ -]\d{1,2}){0,2}\b", " ", text)
    text = re.sub(r"^(?:DAU|DAUMAS|ROM|ROMULO|IRE|IRENE|ADR|ADRIANA|NRS|NARESSI)[_ -]+", "", text, flags=re.I)
    text = re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_").upper()
    return (text or fallback)[:limit]


def normalize_name(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^A-Za-z0-9 ]+", "", text).strip().lower()
    connectors = {"da", "das", "de", "do", "dos", "e"}
    parts = text.split()
    out = [(p if i and p in connectors else p[:1].upper() + p[1:]) for i, p in enumerate(parts)]
    return "_".join(out)[:30] or "SEM_ID"


def valid_rows(plan: list[dict], prepared_dir: Path) -> tuple[list[dict], Counter]:
    rows, excluded = [], Counter()
    for item in plan:
        source = str(item.get("source_path") or "")
        size = int(item.get("upload_size") or 0)
        if "__MACOSX/" in source or Path(source).name.startswith("._"):
            excluded["macos_junk"] += 1; continue
        if size < 1024:
            excluded["tiny_or_empty"] += 1; continue
        employee_id = int(item.get("funcionario_id") or 0)
        category = str(item.get("category") or "OUTRO").upper()
        if employee_id not in EXPECTED_EMPLOYEES or category not in PREFIX:
            excluded["invalid_contract"] += 1; continue
        original_sha = str(item.get("sha256_original") or "").lower()
        if not re.fullmatch(r"[0-9a-f]{64}", original_sha):
            excluded["invalid_sha"] += 1; continue
        file_path = prepared_dir / f"{original_sha}.pdf"
        if not file_path.is_file():
            excluded["missing_prepared_file"] += 1; continue
        actual_size = file_path.stat().st_size
        if actual_size < 1024 or actual_size > 10 * 1024 * 1024:
            raise RuntimeError(f"prepared file size outside PDF contract for {original_sha}: {actual_size}")
        with file_path.open("rb") as f:
            header = f.read(1024)
        if b"%PDF-" not in header:
            raise RuntimeError(f"invalid PDF signature for {original_sha}")
        upload_sha = sha256_file(file_path)
        stable_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"airtrust:{BATCH}:{employee_id}:{original_sha}"))
        subtype = normalize_token(Path(source).stem, original_sha[:12])
        rows.append({**item, "funcionario_id": employee_id, "category": category,
                     "original_sha": original_sha, "upload_sha": upload_sha, "actual_upload_size": actual_size,
                     "file_path": str(file_path), "uuid": stable_uuid, "subtype": subtype})
    return rows, excluded


def load_live(rows: list[dict]) -> tuple[dict[int, dict], dict[tuple[int, str], dict], dict[tuple[int, str], dict], bool]:
    ids = ",".join(str(i) for i in sorted(EXPECTED_EMPLOYEES))
    employees = wrangler_query(
        f"SELECT id,nome FROM funcionarios WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND id IN ({ids}) ORDER BY id"
    )
    by_id = {int(r["id"]): r for r in employees}
    if set(by_id) != set(EXPECTED_EMPLOYEES):
        raise RuntimeError(f"employee scope drift: found={sorted(by_id)}")
    columns = {str(r.get("name") or "") for r in wrangler_query("SELECT name FROM pragma_table_info('documentos')")}
    has_hash = "sha256_hash" in columns
    marker_like = f"{BATCH}:%"
    select_hash = ",sha256_hash" if has_hash else ""
    hash_filter = " OR sha256_hash IS NOT NULL" if has_hash else ""
    existing = wrangler_query(
        f"SELECT id,funcionario_id,nome_arquivo,r2_key,descricao{select_hash} FROM documentos "
        f"WHERE empresa_id={EMPRESA_ID} AND deleted_at IS NULL AND funcionario_id IN ({ids}) "
        f"AND (descricao LIKE {sql_text(marker_like)}{hash_filter})"
    )
    by_marker, by_upload = {}, {}
    for doc in existing:
        desc = str(doc.get("descricao") or "")
        m = re.search(r"source_sha256=([0-9a-f]{64})", desc)
        if m: by_marker[(int(doc["funcionario_id"]), m.group(1))] = doc
        h = str(doc.get("sha256_hash") or "").lower()
        if has_hash and re.fullmatch(r"[0-9a-f]{64}", h): by_upload[(int(doc["funcionario_id"]), h)] = doc
    return by_id, by_marker, by_upload, has_hash


def materialize(rows: list[dict], employees: dict[int, dict]) -> list[dict]:
    out = []
    for row in rows:
        emp = employees[row["funcionario_id"]]
        ident = normalize_name(str(emp["nome"]))
        prefix = PREFIX[row["category"]]
        code = row["subtype"]
        short = row["uuid"][:8]
        if row["category"] == "CERTIFICADO_QUALIFICACAO": name = f"Cert-{ident}-{code}-{IMPORT_DATE}-{short}.pdf"
        elif row["category"] == "OUTRO": name = f"Doc-Outros-{ident}-{IMPORT_DATE}-{short}.pdf"
        else: name = f"{prefix}-{code}-{ident}-{IMPORT_DATE}-{short}.pdf"
        key = f"funcionarios/{row['funcionario_id']}/{name}"
        marker = f"{BATCH}:source_sha256={row['original_sha']};source={Path(str(row['source_path'])).name[:160]}"
        out.append({**row, "nome_arquivo": name, "r2_key": key, "descricao": marker})
    return out


def candidate_hash(rows: list[dict]) -> str:
    material = "\n".join(sorted(
        f"{r['funcionario_id']}|{r['original_sha']}|{r['upload_sha']}|{r['category']}|{r['r2_key']}"
        for r in rows
    )).encode()
    return hashlib.sha256(material).hexdigest()


def git_state() -> tuple[str, str, str]:
    return (run(["git","rev-parse","HEAD"]).stdout.strip(),
            run(["git","rev-parse","origin/main"]).stdout.strip(),
            run(["git","branch","--show-current"]).stdout.strip())


def verify_target() -> None:
    info = json.loads(run(["npx","--no-install","wrangler","d1","info",DB_NAME,"--env","production","--json"], WORKER).stdout)
    if info.get("uuid") != DB_ID or info.get("name") != DB_NAME:
        raise RuntimeError("production D1 target identity mismatch")


def capture_recovery_point() -> str:
    ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    run(["npx","--no-install","wrangler","d1","time-travel","info",DB_NAME,"--env","production",f"--timestamp={ts}","--json"], WORKER)
    return ts


def ensure_apply_guards(args, plan_sha: str, count: int, c_hash: str) -> str:
    head, main, branch = git_state()
    if args.expected_sha != head or head != main or branch != "main": raise RuntimeError("apply requires exact clean origin/main SHA on branch main")
    if run(["git","status","--porcelain"]).stdout.strip(): raise RuntimeError("apply requires clean worktree")
    if args.confirmation != CONFIRM_APPLY: raise RuntimeError("apply confirmation mismatch")
    if args.expected_plan_sha != plan_sha: raise RuntimeError("plan SHA-256 mismatch")
    if args.expected_candidate_count != count or args.expected_candidate_hash != c_hash: raise RuntimeError("reviewed candidate set mismatch")
    if ROOT in args.plan.resolve().parents or ROOT in args.prepared_dir.resolve().parents: raise RuntimeError("sources must remain outside git repository")
    verify_target(); return head


def upload_r2(row: dict) -> None:
    run(["npx","--no-install","wrangler","r2","object","put",f"{R2_BUCKET}/{row['r2_key']}",
         "--env","production","--remote","--content-type","application/pdf","--file",row["file_path"],"--force"], WORKER)


def apply_d1(rows: list[dict], has_hash: bool) -> None:
    lines = ["PRAGMA foreign_keys=ON;"]
    for row in rows:
        cols = "uuid,funcionario_id,nome_arquivo,tipo,tamanho,r2_key,descricao" + (",sha256_hash" if has_hash else "") + ",empresa_id,created_at,updated_at"
        vals = f"{sql_text(row['uuid'])},{row['funcionario_id']},{sql_text(row['nome_arquivo'])},'application/pdf',{int(Path(row['file_path']).stat().st_size)},{sql_text(row['r2_key'])},{sql_text(row['descricao'])}"
        if has_hash: vals += f",{sql_text(row['upload_sha'])}"
        vals += f",{EMPRESA_ID},datetime('now'),datetime('now')"
        prefix = BATCH + ':source_sha256=' + row['original_sha'] + ';'
        duplicate = f"instr(descricao,{sql_text(prefix)})=1 OR r2_key={sql_text(row['r2_key'])}"
        if has_hash: duplicate += f" OR sha256_hash={sql_text(row['upload_sha'])}"
        lines.append(
            f"INSERT INTO documentos ({cols}) SELECT {vals} "
            f"WHERE NOT EXISTS (SELECT 1 FROM documentos WHERE empresa_id={EMPRESA_ID} AND funcionario_id={row['funcionario_id']} AND deleted_at IS NULL AND ({duplicate}));"
        )
    lines.append(
        "INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at) "
        "SELECT NULL,'DOCUMENT_BATCH_IMPORT_SK76_20261003','documentos',d.id,NULL,'{\"batch\":\"document-batch-sk76-20261003\"}',d.empresa_id,datetime('now') "
        f"FROM documentos d WHERE d.empresa_id={EMPRESA_ID} AND d.deleted_at IS NULL AND instr(d.descricao,{sql_text(BATCH + ':')})=1 "
        "AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.empresa_id=d.empresa_id AND a.action='DOCUMENT_BATCH_IMPORT_SK76_20261003' AND a.entity_type='documentos' AND a.entity_id=d.id);"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n"); path = Path(f.name)
    try:
        run(["npx","--no-install","wrangler","d1","execute",DB_NAME,"--env","production","--remote",f"--file={path}"], WORKER)
    finally: path.unlink(missing_ok=True)


def parse_args():
    p=argparse.ArgumentParser(); p.add_argument("mode",choices=["dry-run","apply"])
    p.add_argument("--plan",required=True,type=Path); p.add_argument("--prepared-dir",required=True,type=Path)
    p.add_argument("--expected-sha"); p.add_argument("--expected-plan-sha"); p.add_argument("--expected-candidate-count",type=int)
    p.add_argument("--expected-candidate-hash"); p.add_argument("--confirmation"); return p.parse_args()


def main() -> int:
    args=parse_args()
    if not args.plan.is_file() or not args.prepared_dir.is_dir(): raise RuntimeError("plan/prepared source not found")
    plan_sha=sha256_file(args.plan); plan=json.loads(args.plan.read_text(encoding="utf-8"))
    rows,excluded=valid_rows(plan,args.prepared_dir); employees,by_marker,by_upload,has_hash=load_live(rows); rows=materialize(rows,employees)
    pending=[r for r in rows if (r['funcionario_id'],r['original_sha']) not in by_marker and (r['funcionario_id'],r['upload_sha']) not in by_upload]
    dup=len(rows)-len(pending); c_hash=candidate_hash(pending); head,_,_=git_state()
    summary={"mode":"dry-run","source_sha":head,"empresa_id":EMPRESA_ID,"plan_sha256":plan_sha,"valid_rows":len(rows),"excluded":dict(excluded),"already_present":dup,"candidate_count":len(pending),"candidate_hash":c_hash,"candidate_by_employee":dict(Counter(EXPECTED_EMPLOYEES[r['funcionario_id']] for r in pending)),"candidate_by_category":dict(Counter(r['category'] for r in pending)),"upload_bytes":sum(Path(r['file_path']).stat().st_size for r in pending),"document_hash_column":has_hash,"mutation_executed":False,"pii_emitted":False}
    if args.mode=="dry-run": print(json.dumps(summary,ensure_ascii=False,indent=2)); return 0
    exact=ensure_apply_guards(args,plan_sha,len(pending),c_hash); recovery=capture_recovery_point()
    completed = 0
    with ThreadPoolExecutor(max_workers=32) as pool:
        futures = {pool.submit(upload_r2, row): row for row in pending}
        for future in as_completed(futures):
            future.result()
            completed += 1
            if completed % 25 == 0 or completed == len(pending):
                print(f"R2_PROGRESS {completed}/{len(pending)}", file=__import__('sys').stderr, flush=True)
    apply_d1(pending, has_hash)
    employees2,m2,u2,has_hash2=load_live(rows); remaining=[r for r in rows if (r['funcionario_id'],r['original_sha']) not in m2 and (r['funcionario_id'],r['upload_sha']) not in u2]
    imported=sum(1 for r in rows if (r['funcionario_id'],r['original_sha']) in m2 or (r['funcionario_id'],r['upload_sha']) in u2)
    if remaining or imported != len(rows): raise RuntimeError(f"postcondition failed remaining={len(remaining)} imported={imported} expected={len(rows)}")
    summary.update({"mode":"apply","source_sha":exact,"mutation_executed":True,"r2_uploaded":len(pending),"post_imported":imported,"post_remaining":0,"postconditions_verified":True,"recovery_timestamp_utc":recovery})
    print(json.dumps(summary,ensure_ascii=False,indent=2)); return 0

if __name__ == "__main__": raise SystemExit(main())
