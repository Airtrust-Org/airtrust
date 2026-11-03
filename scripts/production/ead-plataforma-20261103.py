#!/usr/bin/env python3
"""Governed EAD Plataforma -> AirTrust historical qualification reconciliation.

No source workbook or personal data belongs in git. The workflow accepts a private,
SHA-256-pinned projection of exactly 471 approved operations plus three models.
Only GitHub Actions on the approved main SHA may write, with an identical-SHA
successful reviewed dry-run and D1 Time Travel recovery point.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / 'worker-airtrust'
DATABASE = 'airtrust-db'
DATABASE_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae'
COMPANY = 6
SOURCE_SHA = '6eaff9572db1d80746c2ef4748dbf5159847fa626d8ccdf60bf2094bbfc9c718'
APPROVED_MANIFEST_SHA = '46210f50c413e06a71bc5ff090cfdcd55723f3e25cf19c9f61c6448756223be0'
PROJECTION_SHA = 'c6e7a811d31859b806a9ea53cdcc9c8a8a51058fd59178d1e0b15986ca8fee86'
AUDIT_ACTION = 'EAD_PLATAFORMA_HISTORICAL_RECONCILIATION_20261103'
CONFIRMATION = 'AIRTRUST_PRODUCTION_EAD_PLATAFORMA_APPLY_20261103'
ALLOWED_ACTIONS = {
    'INSERT_HISTORICAL_CYCLE': 181,
    'INSERT_MISSING': 180,
    'INSERT_AFTER_MODEL_CREATE': 20,
    'CORRECT_DATE': 69,
    'RECLASSIFY_FDM': 18,
    'FIX_COMPLETION_STATUS': 3,
}
NEW_CODES = {'EAD_AGENTE_RAMPA', 'EAD_COORDENADOR_VOO', 'EAD_DOV'}



def canonical(obj: object) -> bytes:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':')).encode('utf-8')


def digest(obj: object) -> str:
    return hashlib.sha256(canonical(obj)).hexdigest()


def run(cmd: list[str], cwd: Path = ROOT) -> str:
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=300)
    if p.returncode:
        raise RuntimeError(f'GOVERNED_COMMAND_FAILED status={p.returncode}; no private output printed')
    return p.stdout


def sql_quote(value: object) -> str:
    if value is None:
        return 'NULL'
    return "'" + str(value).replace("'", "''") + "'"


def date_only(value: object) -> str:
    s = str(value or '')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', s):
        raise ValueError('INVALID_COMPLETION_DATE')
    if dt.date.fromisoformat(s) > dt.datetime.now(dt.timezone.utc).date():
        raise ValueError('FUTURE_COMPLETION_NOT_AUTHORIZED')
    return s


def normalize_name(value: str) -> str:
    normalized = unicodedata.normalize('NFKD', str(value))
    return ' '.join(''.join(ch for ch in normalized if not unicodedata.combining(ch)).upper().split())


def load_plan(path: Path) -> tuple[list[dict], list[dict]]:
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != PROJECTION_SHA:
        raise ValueError('APPROVED_PROJECTION_HASH_MISMATCH')
    plan = json.loads(raw)
    if plan.get('source_sha256') != SOURCE_SHA or plan.get('approved_manifest_sha256') != APPROVED_MANIFEST_SHA:
        raise ValueError('SOURCE_OR_AUTHORIZED_MANIFEST_SHA_MISMATCH')
    ops, models = plan.get('operations'), plan.get('models')
    if not isinstance(ops, list) or len(ops) != 471 or not isinstance(models, list) or len(models) != 3:
        raise ValueError('CANDIDATE_COUNT_MISMATCH')
    if collections.Counter(r.get('action') for r in ops) != ALLOWED_ACTIONS:
        raise ValueError('ACTION_BREAKDOWN_MISMATCH')
    if {m.get('codigo') for m in models} != NEW_CODES:
        raise ValueError('NEW_MODELS_MISMATCH')
    for m in models:
        if (m.get('categoria_id'), m.get('area_id'), m.get('carga_horaria_inicial'),
            m.get('carga_horaria_recorrente'), m.get('validade')) != (13, 1, 8, 8, None):
            raise ValueError('NEW_MODEL_POLICY_MISMATCH')
    seen_source = set()
    seen_history = set()
    for op in ops:
        # Restore deterministic provenance from the approved, compact private projection.
        code = op['source_certificate_code']
        op['observation_append'] = f'Treinamento realizado na plataforma anterior EAD Plataforma. Código do certificado: {code}.'
        op['source_completion_at'] = op['completion_date'] + ' 00:00:00'
        date = date_only(op.get('completion_date'))
        source_time = str(op.get('source_completion_at') or '')
        if source_time[:10] != date:
            raise ValueError('EAD_COMPLETION_DATE_MISMATCH')
        if any('vencimento' in key.lower() or 'expiry' in key.lower() for key in op):
            raise ValueError('EXTERNAL_EXPIRY_DATA_FORBIDDEN')
        source_code = str(op.get('source_certificate_code') or '')
        if not re.fullmatch(r'[A-Za-z0-9]{4,30}', source_code):
            raise ValueError('INVALID_SOURCE_CERTIFICATE_CODE')
        url = 'https://voecostadosol.eadplataforma.app/certificate/view/' + source_code + '/' + date
        if str(op.get('source_certificate_url') or '').lower() != url.lower():
            raise ValueError('EXTERNAL_EVIDENCE_URL_UNEXPECTED')
        if not op.get('observation_append', '').startswith('Treinamento realizado na plataforma anterior EAD Plataforma.'):
            raise ValueError('PROVENANCE_NOTE_MISSING')
        if source_code not in op['observation_append']:
            raise ValueError('CERTIFICATE_CODE_NOT_IN_NOTE')
        key = (int(op['source_row']), str(op['qualification']['qualificacao_id'] or op['qualification']['codigo']))
        if key in seen_source:
            raise ValueError('REPEATED_SOURCE_ROW_AND_DESTINATION')
        seen_source.add(key)
        if op['action'] in ('CORRECT_DATE', 'RECLASSIFY_FDM', 'FIX_COMPLETION_STATUS'):
            h = op.get('existing') or {}
            hid = int(h.get('historico_id') or 0)
            if hid <= 0 or hid in seen_history or not h.get('expected_completion_date'):
                raise ValueError('DUPLICATED_OR_MISSING_EXISTING_HISTORY')
            date_only(h['expected_completion_date'])
            seen_history.add(hid)
        elif op.get('existing') is not None:
            raise ValueError('INSERT_MAY_NOT_REFERENCE_EXISTING_HISTORY')
        if op['action'] == 'RECLASSIFY_FDM' and op.get('expected_old_qualificacao_codigo') != 'FDM-EAD':
            raise ValueError('FDM_SOURCE_NOT_GENERAL')
        t = op['qualification']
        if op['action'] == 'INSERT_AFTER_MODEL_CREATE':
            if t.get('codigo') not in NEW_CODES or t.get('qualificacao_id') is not None:
                raise ValueError('NEW_MODEL_REFERENCE_INVALID')
        elif not isinstance(t.get('qualificacao_id'), int) or t['qualificacao_id'] <= 0:
            raise ValueError('EXISTING_MODEL_ID_INVALID')
        if op['employee_match']['method'] not in ('EMAIL_EXACT_UNIQUE', 'EXACT_NAME_UNIQUE'):
            raise ValueError('UNKNOWN_EMPLOYEE_MATCH_METHOD')
        if op['employee_match']['method'] == 'EXACT_NAME_UNIQUE':
            if len(normalize_name(op['employee_match']['source_name']).split()) < 2:
                raise ValueError('NAME_ONLY_MATCH_REQUIRES_FIRST_AND_LAST')
        hours = op.get('source_workload_minutes')
        if not isinstance(hours, int) or hours <= 0 or hours % 60:
            raise ValueError('INVALID_EXTERNAL_WORKLOAD_HOURS')
    name_only_sources = {normalize_name(o['employee_match']['source_name']) for o in ops
                         if o['employee_match']['method'] == 'EXACT_NAME_UNIQUE'}
    if len(name_only_sources) != 2:
        raise ValueError('NAME_ONLY_EXCEPTION_COUNT_CHANGED')
    return ops, models


def read_d1(sql: str) -> list[dict]:
    if not sql.lstrip().upper().startswith('SELECT'):
        raise ValueError('READ_ONLY_SELECT_REQUIRED')
    payload = json.loads(run([
        'npx', '--no-install', 'wrangler', 'd1', 'execute', DATABASE,
        '--env', 'production', '--remote', '--json', '--command', sql], WORKER))
    rows = []
    for item in payload:
        if not item.get('success') or int(item.get('meta', {}).get('rows_written', 0)):
            raise ValueError('D1_READ_ONLY_GUARD_FAILED')
        rows.extend(item.get('results', []))
    return rows


def get_live(ops: list[dict], models: list[dict]) -> tuple[list[dict], dict, list[dict], dict]:
    people = read_d1("SELECT id,nome,LOWER(TRIM(email)) email,empresa_id,deleted_at FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL")
    models_live = read_d1("SELECT id,codigo,nome,categoria,categoria_id,area_id,ativo,deleted_at,validade FROM qualificacoes_tipos WHERE empresa_id=6")
    hist = read_d1("SELECT id,funcionario_id,qualificacao_id,qualificacao_codigo,substr(data_conclusao,1,10) data_conclusao,CAST(data_vencimento AS TEXT) data_vencimento,status,origem_tipo,lms_matricula_id,CAST(observacoes AS TEXT) observacoes,CAST(numero_certificado AS TEXT) numero_certificado,CAST(arquivo_url AS TEXT) arquivo_url,renovacao_de FROM qualificacoes_historico WHERE empresa_id=6 AND deleted_at IS NULL")
    audit_count = read_d1("SELECT COUNT(*) n FROM audit_logs WHERE empresa_id=6 AND action=" + sql_quote(AUDIT_ACTION))[0]['n']
    # Do not rewrite qualification evidence indirectly owned by an LMS cycle/import.
    existing_ids = sorted({int(op['existing']['historico_id']) for op in ops if op.get('existing')})
    scoped_ids = ','.join(map(str, existing_ids))
    reference_counts = read_d1(
        f"SELECT (SELECT COUNT(*) FROM lms_matricula_ciclos WHERE empresa_id=6 AND deleted_at IS NULL AND qualificacao_historico_id IN ({scoped_ids})) AS cycle_links, "
        f"(SELECT COUNT(*) FROM lms_historico_importado WHERE empresa_id=6 AND deleted_at IS NULL AND qualificacao_historico_id IN ({scoped_ids})) AS import_links")
    if int(reference_counts[0]['cycle_links']) or int(reference_counts[0]['import_links']):
        raise ValueError('LMS_OWNED_QUALIFICATION_EVIDENCE_MUST_NOT_BE_REWRITTEN')
    by_email = collections.defaultdict(list)
    by_name = collections.defaultdict(list)
    by_history = collections.defaultdict(list)
    by_type_id = {int(t['id']):t for t in models_live}
    by_type_code = collections.defaultdict(list)
    for t in models_live:
        if t['deleted_at'] is None:by_type_code[t['codigo'].upper()].append(t)
    for p in people:
        if p['email']:by_email[p['email']].append(p)
        by_name[normalize_name(p['nome'])].append(p)
    for h in hist:by_history[int(h['funcionario_id'])].append(h)
    by_hid = {int(h['id']):h for h in hist}
    if audit_count:
        raise ValueError('CANDIDATE_ALREADY_APPLIED_OR_PARTIALLY_APPLIED_MANUAL_REVIEW_REQUIRED')
    for m in models:
        if by_type_code.get(m['codigo']):
            raise ValueError('NEW_MODEL_ALREADY_EXISTS_STOP_AND_REVIEW')
    selected = []
    observed_keys = set()
    for op in ops:
        emp_spec = op['employee_match']
        match = emp_spec['method']
        if match == 'EMAIL_EXACT_UNIQUE':
            options = by_email[str(emp_spec.get('email') or '').lower().strip()]
        else:
            # Match only the two privately approved exceptional people by
            # unique first+last-name subsequence; no personal names in git.
            wanted = normalize_name(emp_spec['source_name']).split()
            options = [p for p in people if len(normalize_name(p['nome']).split()) >= len(wanted)
                       and normalize_name(p['nome']).split()[0] == wanted[0]
                       and normalize_name(p['nome']).split()[-1] == wanted[-1]
                       and (len(wanted) == 2 or normalize_name(p['nome']) == ' '.join(wanted))]
        if len(options) != 1:
            raise ValueError('EMPLOYEE_IDENTITY_NO_LONGER_UNIQUE')
        emp = options[0]
        fid = int(emp['id'])
        qual = op['qualification']
        qid = qual['qualificacao_id']
        qcode = qual['codigo'] if qid is None else None
        if qid is not None:
            typ = by_type_id.get(int(qid))
            if not typ or typ['deleted_at'] is not None or not typ['ativo']:
                raise ValueError('QUALIFICATION_TYPE_DISABLED_OR_MISSING')
            qcode = str(typ['codigo'])
        else:
            typ = next(m for m in models if m['codigo']==qcode)
        date=op['completion_date']
        key = (fid, qcode.upper(), date)
        if key in observed_keys:
            raise ValueError('DUPLICATE_EMPLOYEE_TYPE_DATE_IN_PRIVATE_PLAN')
        observed_keys.add(key)
        relevant = [h for h in by_history[fid] if str(h.get('qualificacao_codigo') or '').upper()==qcode.upper() and h.get('data_conclusao')==date]
        if op['action'].startswith('INSERT_') and relevant:
            raise ValueError('PREEXISTING_DESTINATION_HISTORY_STOP')
        old = op.get('existing')
        old_h = None
        if old:
            old_h = by_hid.get(int(old['historico_id']))
            if not old_h or old_h['funcionario_id']!=fid or old_h['data_conclusao']!=old['expected_completion_date']:
                raise ValueError('EXISTING_HISTORY_PRECONDITION_CHANGED')
            if old_h.get('lms_matricula_id') is not None or (old_h.get('origem_tipo') or '').upper()=='LMS':
                raise ValueError('OWN_LMS_CONCLUSION_CANNOT_BE_REWRITTEN')
            if op['action']=='RECLASSIFY_FDM':
                if old_h['qualificacao_id']!=119 or str(old_h['qualificacao_codigo']).upper()!='FDM-EAD':
                    raise ValueError('GENERAL_FDM_SOURCE_PRECONDITION_CHANGED')
            elif int(old_h['qualificacao_id'] or 0)!=int(qid):
                raise ValueError('QUALIFICATION_MODEL_ON_HISTORY_CHANGED')
            if op['action']=='FIX_COMPLETION_STATUS' and str(old_h.get('status') or '').strip():
                raise ValueError('STATUS_NO_LONGER_UNDEFINED')
            if op['action']=='CORRECT_DATE' and relevant:
                raise ValueError('CORRECTION_WOULD_DUPLICATE_HISTORY')
        selected.append({'op':op,'employee_id':fid,'model_id':int(qid) if qid else None,
                         'model_code':qcode,'old':old_h,'type':typ})
    state = [
        {'source_row':r['op']['source_row'],'action':r['op']['action'],
         'employee_id':r['employee_id'],'qualification_id':r['model_id'],
         'qualification_code':r['model_code'],
         'hist':r['old']} for r in selected
    ]
    status = {'plan_state_hash':digest(state),'existing_history_rows':len(hist),
              'employee_rows':len(people),'qualifications_types_rows':len(models_live),
              'audit_initial':audit_count}
    return selected, status, models_live, by_hid


def guard(predicate: str) -> str:
    return "SELECT CASE WHEN ("+predicate+") THEN 1 ELSE json_extract('AIRTRUST_EAD_PLATAFORMA_CAS_GUARD_FAILED','$') END;"


def note_append_sql(base: str, note: str) -> str:
    # Old notes remain untouched except for adding the reviewed provenance once.
    return f"CASE WHEN INSTR(COALESCE({base},''),{sql_quote(note)})>0 THEN {base} " + f"ELSE COALESCE(NULLIF({base},'')||' ','')||{sql_quote(note)} END"


def compile_sql(selected: list[dict], models: list[dict]) -> str:
    statements=['PRAGMA foreign_keys=ON;']
    # All original-history CAS guards precede every write; no surprising
    # reclassification or date edit may start a partial batch.
    for r in selected:
        op=r['op'];fid=r['employee_id'];code=r['model_code'];day=op['completion_date'];old=r['old'];action=op['action']
        predicate=(f"EXISTS(SELECT 1 FROM funcionarios f WHERE f.id={fid} AND f.empresa_id={COMPANY} AND f.deleted_at IS NULL)")
        if old:
            hid=int(old['id']);previous=op['existing']['expected_completion_date']
            predicate+=(f" AND EXISTS(SELECT 1 FROM qualificacoes_historico h WHERE h.id={hid} AND h.empresa_id={COMPANY} AND h.funcionario_id={fid} AND h.deleted_at IS NULL"
                        f" AND substr(h.data_conclusao,1,10)={sql_quote(previous)} AND h.lms_matricula_id IS NULL AND UPPER(COALESCE(h.origem_tipo,''))<>'LMS'")
            if action=='RECLASSIFY_FDM':
                predicate+=" AND h.qualificacao_id=119 AND UPPER(h.qualificacao_codigo)='FDM-EAD'"
            else:predicate+=f" AND h.qualificacao_id={r['model_id']}"
            if action=='FIX_COMPLETION_STATUS':predicate+=" AND TRIM(COALESCE(h.status,''))=''"
            predicate+=')'
        if action.startswith('INSERT_') or action=='CORRECT_DATE' or action=='RECLASSIFY_FDM':
            predicate+=(f" AND NOT EXISTS(SELECT 1 FROM qualificacoes_historico h WHERE h.empresa_id={COMPANY} AND h.funcionario_id={fid} AND h.deleted_at IS NULL AND UPPER(h.qualificacao_codigo)={sql_quote(code.upper())} AND substr(h.data_conclusao,1,10)={sql_quote(day)})")
        if r['model_id']:
            predicate+=f" AND EXISTS(SELECT 1 FROM qualificacoes_tipos t WHERE t.id={r['model_id']} AND t.empresa_id={COMPANY} AND t.deleted_at IS NULL AND t.ativo=1 AND t.codigo={sql_quote(code)})"
        statements.append(guard(predicate))
    for m in models:
        statements.append(guard(f"NOT EXISTS(SELECT 1 FROM qualificacoes_tipos WHERE empresa_id={COMPANY} AND UPPER(codigo)={sql_quote(m['codigo'].upper())} AND deleted_at IS NULL)"))
    # Three qualification *types* only, no LMS courses or enrollments.
    for m in models:
        statements.append('INSERT INTO qualificacoes_tipos (tipo,codigo,nome,descricao,categoria,categoria_id,area_id,classe_requisito,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,validade,vencimento_fim_mes,ativo,empresa_id,created_at,updated_at,deleted_at) '
                          'VALUES ('+','.join([sql_quote('INICIAL'),sql_quote(m['codigo']),sql_quote(m['nome']),sql_quote(m['descricao']),sql_quote('EAD'),'13','1',sql_quote('TREINAMENTO'),'8','8','8','NULL','0','1',str(COMPANY),"datetime('now')","datetime('now')",'NULL'])+');')
        statements.append("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at) SELECT NULL,"+sql_quote(AUDIT_ACTION)+",'qualificacoes_tipos',id,NULL,"+sql_quote(json.dumps({'action':'CREATE_EAD_MODEL','codigo':m['codigo']},separators=(',',':')))+f",{COMPANY},datetime('now') FROM qualificacoes_tipos WHERE codigo={sql_quote(m['codigo'])} AND empresa_id={COMPANY};")
    for r in selected:
        op=r['op'];action=op['action'];fid=r['employee_id'];code=r['model_code'];day=op['completion_date'];old=r['old'];cert=op['source_certificate_code'];obs=op['observation_append'];model=r['model_id'];hours=op['source_workload_minutes']//60
        if action.startswith('INSERT_'):
            sql=("INSERT INTO qualificacoes_historico (funcionario_id,qualificacao_id,qualificacao_codigo,categoria,categoria_id,data_conclusao,data_vencimento,validade_meses,observacoes,status,renovada,carga_horaria,numero_certificado,arquivo_url,origem_tipo,empresa_id,created_at,updated_at) SELECT "
                 +f"{fid},t.id,t.codigo,t.categoria,t.categoria_id,{sql_quote(day)},NULL,NULL,{sql_quote(obs)},'CONCLUIDA',0,{hours},{sql_quote(cert)},{sql_quote(op['source_certificate_url'])},'IMPORTACAO',{COMPANY},datetime('now'),datetime('now') "
                 +f"FROM qualificacoes_tipos t WHERE t.empresa_id={COMPANY} AND t.deleted_at IS NULL AND t.ativo=1 AND t.codigo={sql_quote(code)} AND NOT EXISTS(SELECT 1 FROM qualificacoes_historico q WHERE q.empresa_id={COMPANY} AND q.funcionario_id={fid} AND q.deleted_at IS NULL AND q.qualificacao_codigo=t.codigo AND substr(q.data_conclusao,1,10)={sql_quote(day)});")
            statements.append(sql)
            entity_expr=f"(SELECT id FROM qualificacoes_historico WHERE empresa_id={COMPANY} AND funcionario_id={fid} AND qualificacao_codigo={sql_quote(code)} AND substr(data_conclusao,1,10)={sql_quote(day)} AND deleted_at IS NULL ORDER BY id DESC LIMIT 1)"
        else:
            hid=int(old['id']);entity_expr=str(hid)
            if action=='CORRECT_DATE':
                statements.append(f"UPDATE qualificacoes_historico SET data_conclusao={sql_quote(day)},data_vencimento=NULL,observacoes={note_append_sql('observacoes',obs)},updated_at=datetime('now') WHERE id={hid} AND empresa_id={COMPANY} AND funcionario_id={fid} AND substr(data_conclusao,1,10)={sql_quote(op['existing']['expected_completion_date'])} AND qualificacao_id={model} AND deleted_at IS NULL;")
            elif action=='RECLASSIFY_FDM':
                statements.append(f"UPDATE qualificacoes_historico SET qualificacao_id={model},qualificacao_codigo={sql_quote(code)},tipo={sql_quote(r['type']['nome'])},categoria={sql_quote(r['type']['categoria'])},categoria_id={r['type']['categoria_id'] if r['type']['categoria_id'] is not None else 'NULL'},observacoes={note_append_sql('observacoes',obs)},updated_at=datetime('now') WHERE id={hid} AND empresa_id={COMPANY} AND funcionario_id={fid} AND qualificacao_id=119 AND UPPER(qualificacao_codigo)='FDM-EAD' AND deleted_at IS NULL;")
            elif action=='FIX_COMPLETION_STATUS':
                statements.append(f"UPDATE qualificacoes_historico SET status='CONCLUIDA',observacoes={note_append_sql('observacoes',obs)},updated_at=datetime('now') WHERE id={hid} AND empresa_id={COMPANY} AND funcionario_id={fid} AND TRIM(COALESCE(status,''))='' AND deleted_at IS NULL;")
            else:raise AssertionError('Unknown action')
        audit=json.dumps({'source':'EAD Plataforma','source_row':op['source_row'],'source_cert':cert,'action':action,'employee_id':fid,'qualification_code':code,'completion_date':day},ensure_ascii=False,separators=(',',':'))
        statements.append("INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at) SELECT NULL,"+sql_quote(AUDIT_ACTION)+",'qualificacoes_historico',"+entity_expr+",NULL,"+sql_quote(audit)+f",{COMPANY},datetime('now');")
    statements.append(guard(f"(SELECT COUNT(*) FROM audit_logs WHERE empresa_id={COMPANY} AND action={sql_quote(AUDIT_ACTION)})=474"))
    return '\n'.join(statements)+'\n'


def verify_production_target() -> None:
    info=json.loads(run(['npx','--no-install','wrangler','d1','info',DATABASE,'--env','production','--json'],WORKER))
    if info.get('uuid') != DATABASE_ID or info.get('name') != DATABASE:
        raise ValueError('D1_TARGET_WRONG_DATABASE')


def post_readback(selected: list[dict], models: list[dict]) -> dict:
    hist=read_d1("SELECT id,funcionario_id,qualificacao_codigo,qualificacao_id,substr(data_conclusao,1,10) day,status,observacoes,numero_certificado,arquivo_url,data_vencimento FROM qualificacoes_historico WHERE empresa_id=6 AND deleted_at IS NULL")
    audit=read_d1("SELECT entity_type,COUNT(*) n FROM audit_logs WHERE empresa_id=6 AND action="+sql_quote(AUDIT_ACTION)+" GROUP BY entity_type")
    bykey=collections.defaultdict(list)
    byid={int(h['id']):h for h in hist}
    for h in hist:bykey[(h['funcionario_id'],str(h['qualificacao_codigo']).upper(),h['day'])].append(h)
    failures=0
    for r in selected:
        op=r['op'];fid=r['employee_id'];code=r['model_code'];day=op['completion_date'];old=r['old'];action=op['action']
        if action.startswith('INSERT_'):
            matches=bykey[(fid,code.upper(),day)]
            if len(matches)!=1:failures+=1;continue
            h=matches[0]
            if h['numero_certificado']!=op['source_certificate_code'] or h['arquivo_url']!=op['source_certificate_url']:failures+=1
            if h['data_vencimento'] is not None:failures+=1
        else:
            h=byid.get(int(old['id']))
            if h is None:failures+=1;continue
            if action=='CORRECT_DATE' and (h['day']!=day or h['data_vencimento'] is not None):failures+=1
            if action=='RECLASSIFY_FDM' and h['qualificacao_id']!=r['model_id']:failures+=1
            if action=='FIX_COMPLETION_STATUS' and h['status']!='CONCLUIDA':failures+=1
        if op['observation_append'] not in str(h['observacoes'] or ''):failures+=1
    bytype={r['entity_type']:r['n'] for r in audit}
    if bytype.get('qualificacoes_historico')!=471 or bytype.get('qualificacoes_tipos')!=3:failures+=1
    return {'checked_historical_operations':len(selected),'audit_counts':bytype,
            'postcondition_failures':failures,'postconditions_verified':failures==0}


def main() -> int:
    p=argparse.ArgumentParser()
    p.add_argument('mode',choices=['validate','dry-run','apply'])
    p.add_argument('--plan',required=True,type=Path)
    p.add_argument('--expected-main-sha',default='')
    p.add_argument('--expected-prestate-hash',default='')
    p.add_argument('--confirmation',default='')
    a=p.parse_args()
    ops,models=load_plan(a.plan)
    result={'mode':a.mode,'empresa_id':COMPANY,'plan_sha256':PROJECTION_SHA,
            'approved_manifest_sha256':APPROVED_MANIFEST_SHA,'source_sha256':SOURCE_SHA,
            'candidate_count':len(ops),'models_to_create':len(models),
            'actions':dict(collections.Counter(o['action'] for o in ops)),
            'mutation_executed':False,'pii_emitted':False}
    if a.mode=='validate':
        result['validated']=True
    else:
        verify_production_target()
        selected,prestate,_,_=get_live(ops,models)
        result.update(prestate)
        if a.mode=='apply':
            if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('GITHUB_REF')!='refs/heads/main':
                raise ValueError('PRODUCTION_WRITES_ONLY_OFFICIAL_GITHUB_ACTIONS_MAIN')
            if a.expected_main_sha!=os.environ.get('GITHUB_SHA') or not re.fullmatch('[0-9a-f]{40}',a.expected_main_sha):
                raise ValueError('EXACT_MAIN_SHA_REQUIRED')
            if a.confirmation!=CONFIRMATION:
                raise ValueError('EXACT_PRODUCTION_CONFIRMATION_REQUIRED')
            if a.expected_prestate_hash!=prestate['plan_state_hash']:
                raise ValueError('PRODUCTION_STATE_DRIFT_SINCE_REVIEWED_DRYRUN')
            sql=compile_sql(selected,models)
            with tempfile.NamedTemporaryFile('w',suffix='.sql',encoding='utf-8',delete=False) as f:
                f.write(sql);filepath=Path(f.name)
            try:
                # Official production workflow owns credentials, gates, approved dry-run,
                # D1 recovery checkpoint and concurrency lock. This is never a local write.
                run(['npx','--no-install','wrangler','d1','execute',DATABASE,
                     '--env','production','--remote',f'--file={filepath}'],WORKER)
                result['mutation_executed']=True
            finally:
                filepath.unlink(missing_ok=True)
            result.update(post_readback(selected,models))
            if not result['postconditions_verified']:
                raise RuntimeError('PRODUCTION_READBACK_FAILED_ESCALATE_RECOVERY')
    print(json.dumps(result,ensure_ascii=False,separators=(',',':')))
    return 0


if __name__=='__main__':
    try:sys.exit(main())
    except Exception as exc:
        print(json.dumps({'success':False,'error_code':str(exc).split(':')[0][:120],
                          'pii_emitted':False,'mutation_complete_unverified':True}),file=sys.stderr)
        sys.exit(1)