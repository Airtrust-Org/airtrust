#!/usr/bin/env python3
"""Production tenant-6 qualification renewal repair; governed dry-run/apply only."""
import sys,json,hashlib,collections,datetime,argparse,subprocess,tempfile,os,importlib.util,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
WORKER=ROOT/"worker-airtrust"
# Importing the controlled evidence helper must not dirty the guarded checkout.
# Keep the subsequent git status --porcelain check strict (including untracked files).
sys.dont_write_bytecode = True
SPEC=importlib.util.spec_from_file_location("qualified_evidence",ROOT/"scripts/production/reconcile-qualification-evidence-20261004.py")
EVID=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EVID)
read_sql=EVID.query
COMPANY=6
ACTION="QUALIFICATION_RENEWAL_LINEAGE_GOVERNED_20261008"
CONFIRM="AIRTRUST_PRODUCTION_APPLY_QUALIFICATION_RENEWAL_LINEAGE_REVIEWED"
def make_plan():
    NOW=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    sql="""SELECT qh.id,qh.funcionario_id,qh.qualificacao_id,
    qh.qualificacao_codigo code,qt.codigo model_code,
    qh.data_conclusao completed,qh.renovacao_de previous,
    qh.renovada flag,qh.status,
    f.status employee_status,f.deleted_at employee_deleted
    FROM qualificacoes_historico qh
    LEFT JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id
     AND qt.empresa_id=qh.empresa_id
    LEFT JOIN funcionarios f ON f.id=qh.funcionario_id AND f.empresa_id=qh.empresa_id
    WHERE qh.empresa_id=6 AND qh.deleted_at IS NULL ORDER BY qh.id"""
    rows=read_sql(sql); keyed=collections.defaultdict(list); skipped=collections.Counter()
    for h in rows:
     if h["funcionario_id"] is None:
      skipped["employee_id_null"]+=1;continue
     code=str(h.get("code") or h.get("model_code") or "").strip().upper()
     if not code:skipped["unmapped_code"]+=1;continue
     keyed[(int(h["funcionario_id"]),code)].append(h)
    out=collections.Counter();blocked=collections.Counter(); safe=[]; attention=[]
    for (employee,code),group in keyed.items():
     if len(group)<2:
      if group[0]["flag"]==1 or str(group[0]["status"] or "").upper()=="RENOVADA":
       blocked["singleton_renewed_without_successor"]+=1
      continue
     issues=[]
     if any(h["qualificacao_id"] is None for h in group):issues.append("no_type_id")
     if any(not str(h.get("code") or "").strip() for h in group):issues.append("missing_historical_code")
     if len(set(h["qualificacao_id"] for h in group))!=1:issues.append("mixed_type_ids")
     if any(h.get("code") and h.get("model_code") and str(h["code"]).upper()!=str(h["model_code"]).upper() for h in group):issues.append("code_model_mismatch")
     if any(not h["completed"] or len(str(h["completed"]))<10 for h in group):issues.append("null_completion")
     if any(str(h["completed"])[:10]>NOW for h in group if h["completed"]):issues.append("future_completion")
     if any(str(h.get("status") or "").upper() in ("PLANEJADA","PLANEJADO","CANCELADA","CANCELADO","PENDENTE","EM_ANDAMENTO") for h in group):issues.append("non_realized_status")
     if any(str(h.get("status") or "").upper() not in ("","CONCLUIDA","CONCLUIDO","RENOVADA") for h in group):issues.append("unexpected_status")
     if any(h.get("employee_status") is None for h in group):issues.append("missing_employee")
     if issues:
      for reason in set(issues):blocked[reason]+=1
      continue
     group.sort(key=lambda h:(str(h["completed"])[:10],h["id"]))
     if len(set(str(h["completed"])[:10] for h in group))!=len(group):
      blocked["duplicate_completion_dates"]+=1;continue
     groupids={h["id"] for h in group}
     if any(h["previous"] is not None and h["previous"] not in groupids for h in group):
      blocked["external_lineage_reference"]+=1;continue
     changes=[]
     for idx,h in enumerate(group):
      expected_prev=group[idx-1]["id"] if idx else None
      expected_status="CONCLUIDA" if idx==len(group)-1 else "RENOVADA"
      expected_flag=0 if idx==len(group)-1 else 1
      actual_status=str(h.get("status") or "").upper()
      if (h["previous"]!=expected_prev or int(h.get("flag") or 0)!=expected_flag or
          (actual_status=="RENOVADA")!=(expected_status=="RENOVADA")):
       changes.append({"id":h["id"],"expected_prev":expected_prev,
         "expected_status":expected_status,"expected_flag":expected_flag,
         "old_prev":h["previous"],"old_status":h["status"],"old_flag":h["flag"]})
     if not changes:continue
     out["eligible_groups"]+=1;out["eligible_updates"]+=len(changes)
     out["active_employee_groups"]+=int(group[0].get("employee_status")=="ATIVO" and group[0].get("employee_deleted") is None)
     safe.append({"employee_id":employee,"code":code,"model_id":group[0]["qualificacao_id"],"changes":changes,
     "evidence_dates":[str(h["completed"])[:10] for h in group]})
    if safe:
     material=json.dumps(safe,ensure_ascii=False,sort_keys=True,separators=(",",":"))
     digest=hashlib.sha256(material.encode()).hexdigest()
    else:digest=None
    report={"mode":"dry-run","empresa_id":6,"source_rows":len(rows),
        "eligible_group_count":int(out["eligible_groups"]),
        "eligible_change_count":int(out["eligible_updates"]),
        "active_employee_groups":int(out["active_employee_groups"]),
        "plan_hash":digest,"blocked_reasons":dict(blocked),
        "excluded_rows":dict(skipped),"as_of":NOW,
        "mutation_executed":False,"pii_emitted":False}
    return report,safe,keyed

def quote(value):
    return "'" + json.dumps(value, ensure_ascii=False, separators=(',',':')).replace("'", "''") + "'"

def sql_for(safe,keyed,plan_hash):
    patches=[dict(p,id=int(p["id"])) for group in safe for p in group["changes"]]
    # Array cells avoid exceeding D1's 100 KB per-SQL-statement limit.
    # [id,employee,code,type_id,old_code,completion,status,renewed,predecessor]
    guards=[]
    for group in safe:
        employee,code=int(group["employee_id"]),group["code"]
        for h in keyed[(employee,code)]:
            guards.append([int(h["id"]),employee,code,h["qualificacao_id"],
             h.get("code"),h.get("completed"),h.get("status"),h.get("flag"),h.get("previous")])
    patches.sort(key=lambda p:p["id"])
    guards.sort(key=lambda p:p[0])
    if len(patches)!=len({p["id"] for p in patches}):
        raise ValueError("DUPLICATE_PATCH_ID")
    pg="""SELECT CAST(json_extract(value,'$.id') AS INTEGER) id,
      json_extract(value,'$.expected_prev') next_prev,
      json_extract(value,'$.expected_status') next_status,
      CAST(json_extract(value,'$.expected_flag') AS INTEGER) next_flag,
      json_extract(value,'$.old_prev') old_prev,
      json_extract(value,'$.old_status') old_status,
      json_extract(value,'$.old_flag') old_flag
      FROM json_each("""+quote(patches)+""")"""
    gg="""SELECT CAST(json_extract(value,'$[0]') AS INTEGER) id,
      CAST(json_extract(value,'$[1]') AS INTEGER) employee,
      json_extract(value,'$[2]') code,
      CAST(json_extract(value,'$[3]') AS INTEGER) type_id,
      json_extract(value,'$[4]') old_code,
      json_extract(value,'$[5]') old_date,
      json_extract(value,'$[6]') old_status,
      json_extract(value,'$[7]') old_flag,
      json_extract(value,'$[8]') old_prev
      FROM json_each("""+quote(guards)+""")"""
    invalid="json_extract('AIRTRUST_RENEWAL_REVIEWED_CAS_GUARD_FAILED','$')"
    guard_statement="""WITH g AS ("""+gg+"""),
       matching AS (
         SELECT COUNT(*) n FROM g
         JOIN qualificacoes_historico h ON h.id=g.id AND h.empresa_id=6
          AND h.funcionario_id=g.employee AND h.qualificacao_id=g.type_id
          AND h.deleted_at IS NULL AND h.qualificacao_codigo IS g.old_code
          AND h.data_conclusao IS g.old_date AND h.status IS g.old_status
          AND h.renovada IS g.old_flag AND h.renovacao_de IS g.old_prev
       ), unexpected AS (
         SELECT COUNT(*) n FROM qualificacoes_historico h
         JOIN (SELECT DISTINCT employee,code FROM g) groups
          ON groups.employee=h.funcionario_id
          AND UPPER(TRIM(COALESCE(h.qualificacao_codigo,'')))=groups.code
         WHERE h.empresa_id=6 AND h.deleted_at IS NULL
         AND h.id NOT IN (SELECT id FROM g)
       )
       SELECT CASE WHEN (SELECT n FROM matching)="""+str(len(guards))+"""
         AND (SELECT n FROM unexpected)=0
       THEN 1 ELSE """+invalid+""" END;"""
    statements=[
       "PRAGMA foreign_keys=ON;",
       guard_statement,
       """WITH patch AS ("""+pg+""")
       UPDATE qualificacoes_historico AS h
       SET status=p.next_status,renovada=p.next_flag,
           renovacao_de=p.next_prev,updated_at=datetime('now')
       FROM patch p WHERE h.id=p.id AND h.empresa_id=6 AND h.deleted_at IS NULL;""",
       """WITH patch AS ("""+pg+""")
       INSERT INTO audit_logs(user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
       SELECT NULL,'"""+ACTION+"""','qualificacoes_historico',p.id,
        json_object('plan_hash','"""+plan_hash+"""','old_prev',p.old_prev,'old_status',p.old_status,'old_flag',p.old_flag),
        json_object('plan_hash','"""+plan_hash+"""','renovacao_de',p.next_prev,'status',p.next_status,'renovada',p.next_flag),
        6,datetime('now')
       FROM patch p JOIN qualificacoes_historico h ON h.id=p.id AND h.empresa_id=6
        AND h.status=p.next_status AND h.renovada=p.next_flag
        AND h.renovacao_de IS p.next_prev;""",
       """SELECT CASE WHEN
       (SELECT COUNT(*) FROM audit_logs a WHERE a.empresa_id=6
         AND a.action='"""+ACTION+"""'
         AND json_extract(a.new_values,'$.plan_hash')='"""+plan_hash+"""')="""+str(len(patches))+"""
       THEN 1 ELSE """+invalid+""" END;"""
    ]
    # Cloudflare D1 max is 100,000 bytes PER statement, even for --file imports.
    sizes=[len(statement.encode("utf8")) for statement in statements]
    if max(sizes)>90000:
        raise RuntimeError("D1_STATEMENT_SIZE_LIMIT_GUARD")
    return "\n".join(statements)+"\n",patches

def apply(args,report,safe,keyed):
    if args.confirmation!=CONFIRM or args.expected_sha is None:
        raise RuntimeError("CURRENT_SCOPE_CONFIRMATION_REQUIRED")
    head,origin_main,branch=EVID.git_state()
    remote_main=EVID.run(["git","ls-remote","origin","refs/heads/main"]).stdout.strip().split()[0]
    if head!=args.expected_sha or head!=origin_main or head!=remote_main or branch!="main":
        raise RuntimeError("EXACT_CURRENT_MAIN_REQUIRED")
    if EVID.run(["git","status","--porcelain"]).stdout.strip():
        raise RuntimeError("DIRTY_RELEASE_CHECKOUT")
    if args.expected_plan_hash!=report["plan_hash"] or args.expected_change_count!=report["eligible_change_count"]:
        raise RuntimeError("REVIEWED_DRYRUN_CANDIDATES_CHANGED")
    if report["eligible_change_count"]<=0:raise RuntimeError("EMPTY_PLAN")
    recovery=EVID.recovery_point()
    sql,patches=sql_for(safe,keyed,report["plan_hash"])
    with tempfile.NamedTemporaryFile("w",suffix=".sql",delete=False,encoding="utf8") as f:
        f.write(sql)
        tmp=Path(f.name)
    try:
        # Wrangler runs a --file batch transactionally; no direct ad-hoc D1 writes.
        EVID.run(["npx","--no-install","wrangler","d1","execute","airtrust-db",
                  "--env","production","--remote",f"--file={tmp}"],WORKER)
    finally:
        tmp.unlink(missing_ok=True)
    actual=read_sql("SELECT id,renovacao_de,status,renovada FROM qualificacoes_historico WHERE empresa_id=6 AND deleted_at IS NULL")
    found={int(h["id"]):h for h in actual}
    for p in patches:
        row=found.get(int(p["id"]))
        if (not row or row["renovacao_de"]!=p["expected_prev"] or
            row["status"]!=p["expected_status"] or int(row["renovada"] or 0)!=p["expected_flag"]):
            raise RuntimeError("POSTCONDITION_MISMATCH_RECOVERY_REQUIRED")
    audit=read_sql("SELECT COUNT(*) total FROM audit_logs WHERE empresa_id=6 AND action='"+ACTION+"' AND json_extract(new_values,'$.plan_hash')='"+report["plan_hash"]+"'")
    if int(audit[0]["total"])!=len(patches):
        raise RuntimeError("AUDIT_COUNT_MISMATCH_RECOVERY_REQUIRED")
    report.update(mode="apply",mutation_executed=True,changed_histories=len(patches),
                  audit_rows=int(audit[0]["total"]),postconditions_verified=True,
                  recovery_timestamp_utc=recovery)
    return report

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("mode",choices=["dry-run","apply"])
    parser.add_argument("--expected-sha")
    parser.add_argument("--expected-plan-hash")
    parser.add_argument("--expected-change-count",type=int)
    parser.add_argument("--confirmation")
    args=parser.parse_args()
    EVID.verify_target()
    report,safe,keyed=make_plan()
    head=EVID.run(["git","rev-parse","HEAD"]).stdout.strip()
    report["source_sha"]=head
    if args.mode=="apply":
        apply(args,report,safe,keyed)
    print(json.dumps(report,ensure_ascii=False,sort_keys=True))

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("QUALIFICATION_RENEWAL_EXECUTOR_FAIL:"+str(e).splitlines()[0][:160],file=sys.stderr)
        raise SystemExit(1)
