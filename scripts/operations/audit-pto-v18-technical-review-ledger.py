#!/usr/bin/env python3
"""Fail-closed audit of controlled PTO V18 human technical review worksheets.

Does not create an approval file or modify production.
The existence of a completed CSV does NOT replace independent signoff
or cryptographic authentication of reviewers.
"""
import argparse
import csv
import json
from pathlib import Path

import importlib.util
LEDGER=Path(__file__).with_name('build-pto-v18-technical-review-ledger.py')
spec=importlib.util.spec_from_file_location('pto_v18_register',LEDGER)
register=importlib.util.module_from_spec(spec)
spec.loader.exec_module(register)

FIELDS=register.REQUIRED_FIELDS
REVIEW_FIELDS=['manual_controlado','revisao_manual','referencia_secao',
               'revisor_tecnico','data_revisao','evidencia_revisao']
GUIDE_REQUIREMENTS=[
  'guia_html_revisado','manual_aeronave_variantes_checados',
  'roteiro_briefing_debriefing_checado','pf_pm_e_check_checados',
  'criterios_notechs_checados'
]
def audit_rows(position_rows,guide_rows,candidate):
    if len(candidate.get('sessions',[]))!=82 or candidate.get('source_sha256')!=register.APPROVED_SHA:
        raise ValueError('identidade do currículo PTO V18 incorreta')
    if len(position_rows)!=1476 or len(guide_rows)!=82:
        raise ValueError('registro de aceite incompleto: 1476 posições/82 guias necessários')
    expected={(s['codigo'],str(item['ordem'])):(s,item)
              for s in candidate['sessions'] for item in s['technical_items']}
    if len(expected)!=1476:raise ValueError('currículo canônico ambíguo')
    observed=set()
    pending_positions=[]
    for row in position_rows:
        if not set(FIELDS).issubset(row): raise ValueError('colunas técnicas faltantes')
        key=(row['sessao'],str(row['ordem']))
        if key in observed or key not in expected:
            raise ValueError('posição repetida ou desconhecida no aceite')
        observed.add(key)
        session,item=expected[key]
        if any(row[a]!=b for a,b in {
          'aeronave':session['aeronave'],'codigo':item['codigo'],
          'manobra_pto':item['nome'],'perna_pf':item['perna_pf']
        }.items()):
            raise ValueError(f'posição alterada frente ao PTO {key}')
        if row['resultado_revisao']=='VALIDADO' and all(row.get(f,'').strip() for f in REVIEW_FIELDS):
            continue
        pending_positions.append({'sessao':row['sessao'],'ordem':row['ordem'],
          'codigo':row['codigo'],'status':row['resultado_revisao']})
    seen=set()
    pending_guides=[]
    for row in guide_rows:
        code=row['sessao']
        if code in seen or code not in {s['codigo'] for s in candidate['sessions']}:
            raise ValueError('guia repetido ou desconhecido')
        seen.add(code)
        if row['fonte_pto_sha256']!=register.APPROVED_SHA or str(row['posicoes_pto'])!='18':
            raise ValueError('identidade/cobertura de guia divergente')
        valid=(row['status']=='VALIDADO' and
          all(row.get(x)=='SIM' for x in GUIDE_REQUIREMENTS) and
          all(row.get(x,'').strip() for x in ['responsavel_tecnico','data_aceite','evidencia_aceite']))
        if not valid: pending_guides.append(code)
    return {
      'source_sha256':register.APPROVED_SHA,
      'status':'REVISAO_DOCUMENTAL_COMPLETA_NAO_EQUIVALE_A_ACEITE_FINAL' if
          not pending_positions and not pending_guides else 'NO_GO_REVISAO_PENDENTE',
      'posicoes_total':1476,
      'posicoes_pendentes':len(pending_positions),
      'guias_total':82,
      'guias_pendentes':len(pending_guides),
      'pendencias_por_sessao':sorted({r['sessao'] for r in pending_positions}|set(pending_guides)),
    }

def audit_functional_rows(positions,guides,catalog):
    expected={
        (x['sessao'],str(x['ordem'])):x
        for x in catalog['relacoes_por_sessao']
    }
    if len(expected)!=108 or len(positions)!=108 or len(guides)!=6:
        raise ValueError('auditoria funcional exige 108 posições e 6 guias')
    seen=set()
    pending_positions=0
    for row in positions:
        key=(row['sessao'],str(row['ordem']))
        if key in seen or key not in expected:
            raise ValueError('posição funcional duplicada/desconhecida')
        seen.add(key)
        legacy=expected[key]
        if row['codigo_legado']!=legacy['codigo'] or row['atividade_legada']!=legacy['atividade']:
            raise ValueError('atividade funcional alterada frente ao catálogo de origem')
        status_ok=row['status']=='VALIDADO' and row['aplicabilidade_pto_v18']=='CONFIRMADA'
        detail_ok=all(row.get(k,'').strip() for k in [
            'manual_controlado','revisao_manual','referencia_secao',
            'revisor_tecnico','data_revisao','evidencia_revisao'])
        if not status_ok or not detail_ok:pending_positions+=1
    guide_names=set()
    pending_guides=0
    for row in guides:
        code=row['sessao']
        if code in guide_names or code not in {x['sessao'] for x in catalog['relacoes_por_sessao']}:
            raise ValueError('guia funcional repetido/desconhecido')
        guide_names.add(code)
        if row['fonte_pto_sha256']!=register.APPROVED_SHA or str(row['posicoes_funcionais'])!='18' or str(row['notechs_por_sessao'])!='15':
            raise ValueError('cobertura de guia funcional divergente')
        complete=row['status']=='VALIDADO' and all(row.get(k,'').strip() for k in [
            'referencia_pto_funcional','revisor_tecnico','revisao_data','evidencia'])
        if not complete:pending_guides+=1
    return {'functional_positions':108,'functional_positions_pending':pending_positions,
      'functional_guides':6,'functional_guides_pending':pending_guides,
      'functional_notechs_links':90}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--candidate',type=Path,required=True)
    p.add_argument('--positions',type=Path,required=True)
    p.add_argument('--guides',type=Path,required=True)
    p.add_argument('--functional-catalog',type=Path,required=True)
    p.add_argument('--functional-positions',type=Path,required=True)
    p.add_argument('--functional-guides',type=Path,required=True)
    a=p.parse_args()
    with a.positions.open(encoding='utf-8-sig',newline='') as f:
        positions=list(csv.DictReader(f))
    with a.guides.open(encoding='utf-8-sig',newline='') as f:
        guides=list(csv.DictReader(f))
    result=audit_rows(positions,guides,json.loads(a.candidate.read_text()))
    with a.functional_positions.open(encoding='utf-8-sig',newline='') as f:
        f_positions=list(csv.DictReader(f))
    with a.functional_guides.open(encoding='utf-8-sig',newline='') as f:
        f_guides=list(csv.DictReader(f))
    functional=audit_functional_rows(f_positions,f_guides,json.loads(a.functional_catalog.read_text()))
    result.update(functional)
    if functional['functional_positions_pending'] or functional['functional_guides_pending']:
        result['status']='NO_GO_REVISAO_PENDENTE'
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if result['status']=='NO_GO_REVISAO_PENDENTE':
        raise SystemExit(2)

if __name__=='__main__':
    main()
