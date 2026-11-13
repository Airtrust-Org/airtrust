#!/usr/bin/env python3
"""Generate the complete PTO V18 technical acceptance register.

The output is a REVIEW LEDGER, not a sign-off. Only controlled manual
review can change PENDENTE to validated. Historical text cannot self-approve.
"""
import argparse
import collections
import csv
import json
from pathlib import Path

APPROVED_SHA='040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912'
REQUIRED_FIELDS=[
    'aeronave','sessao','titulo_sessao','ordem','codigo','manobra_pto','perna_pf',
    'proveniencia_legado','cenario_legado_presente','padrao_legado_presente',
    'manual_controlado','revisao_manual','referencia_secao','revisor_tecnico',
    'data_revisao','evidencia_revisao','resultado_revisao','observacao_revisao',
]

def build_ledger(candidate,enriched):
    if candidate.get('source_sha256') != APPROVED_SHA:
        raise ValueError('fonte PTO não corresponde à revisão aprovada')
    if candidate.get('status') != 'DRAFT_NOT_IMPORTABLE_NOT_PUBLISHED':
        raise ValueError('pacote curricular não identificado como rascunho')
    if len(enriched.get('guides',[]))!=82 or len(candidate.get('sessions',[]))!=82:
        raise ValueError('guia e currículo exigem 82 sessões')
    expected={s['codigo']:s for s in candidate['sessions']}
    if len(expected)!=82: raise ValueError('sessões duplicadas no PTO')
    seen=set()
    rows=[]
    guide_reviews=[]
    for guide in enriched['guides']:
        session=guide['sessao']
        code=session['codigo']
        if code not in expected: raise ValueError(f'guia desconhecido {code}')
        if code in seen: raise ValueError(f'guia duplicado {code}')
        seen.add(code)
        items=guide['items']
        if len(items)!=18: raise ValueError(f'{code}: esperados 18 itens')
        by_order={int(x['ordem']):x for x in expected[code]['technical_items']}
        if set(by_order)!=set(range(1,19)): raise ValueError(f'{code}: ordem PTO incompleta')
        for item in items:
            ordem=int(item['ordem'])
            canon=by_order.get(ordem)
            if not canon or any(
                item[k]!=canon[k] for k in ('codigo','nome','perna_pf')
            ):
                raise ValueError(f'{code}: posição {ordem} diverge do PTO')
            if (code,ordem) in [(x['sessao'],int(x['ordem'])) for x in rows[-18:]]:
                raise ValueError(f'{code}: posição duplicada {ordem}')
            legacy=item.get('legacy_fields',{})
            rows.append({
                'aeronave':session['aeronave'],
                'sessao':code,
                'titulo_sessao':session['titulo'],
                'ordem':ordem,
                'codigo':item['codigo'],
                'manobra_pto':item['nome'],
                'perna_pf':item['perna_pf'],
                'proveniencia_legado':item['provenance'],
                'cenario_legado_presente':'SIM' if legacy.get('cenario_instrutor') else 'NAO',
                'padrao_legado_presente':'SIM' if legacy.get('padrao_esperado') else 'NAO',
                'manual_controlado':'',
                'revisao_manual':'',
                'referencia_secao':'',
                'revisor_tecnico':'',
                'data_revisao':'',
                'evidencia_revisao':'',
                'resultado_revisao':'PENDENTE',
                'observacao_revisao':'',
            })
        guide_reviews.append({
            'aeronave':session['aeronave'],
            'sessao':code,
            'posicoes_pto':18,
            'fonte_pto_sha256':APPROVED_SHA,
            'guia_html_revisado':'NAO',
            'manual_aeronave_variantes_checados':'NAO',
            'roteiro_briefing_debriefing_checado':'NAO',
            'pf_pm_e_check_checados':'NAO',
            'criterios_notechs_checados':'NAO',
            'responsavel_tecnico':'',
            'data_aceite':'',
            'evidencia_aceite':'',
            'status':'PENDENTE',
        })
    if len(rows)!=1476 or len(guide_reviews)!=82:
        raise ValueError('cobertura de revisão incompleta')
    if len({(r['sessao'],r['ordem']) for r in rows})!=1476:
        raise ValueError('posições de revisão duplicadas')
    summary={
      'status':'NAO_VALIDADO_NAO_IMPORTAVEL',
      'source_sha256':APPROVED_SHA,
      'total_sessoes':82,
      'total_posicoes':len(rows),
      'total_guias':len(guide_reviews),
      'reviewed_positions':0,
      'approved_guides':0,
      'by_provenance':dict(sorted(collections.Counter(
          row['proveniencia_legado'] for row in rows).items())),
    }
    return rows,guide_reviews,summary

def build_functional_ledger(legacy_catalog):
    """Six functional sessions are not part of the 82 aircraft tables.

    They remain explicitly sourced from the old functional catalog until a
    technical reviewer confirms applicability against the approved PTO V18.
    """
    relations=legacy_catalog.get('relacoes_por_sessao',[])
    codes=legacy_catalog.get('codigos_canonicos',[])
    if len(codes)!=94 or len(relations)!=108:
        raise ValueError('catálogo funcional legado não tem 94 códigos e 108 relações')
    sessions=collections.defaultdict(list)
    for item in relations:
        sessions[item['sessao']].append(item)
    if set(sessions)!={'INST-E01','INST-E02','EXA-01/04','EXA-02/04','EXA-03/04','EXA-04/04'}:
        raise ValueError('identidade de seis sessões funcionais não comprovada')
    rows=[]
    for session,items in sorted(sessions.items()):
        by_ordem={int(i['ordem']):i for i in items}
        if len(by_ordem)!=18 or set(by_ordem)!=set(range(1,19)):
            raise ValueError(f'{session}: 18 posições funcionais necessárias')
        for ordem,item in sorted(by_ordem.items()):
            rows.append({
                'sessao':session,
                'ordem':ordem,
                'codigo_legado':item['codigo'],
                'atividade_legada':item['atividade'],
                'aplicabilidade_pto_v18':'PENDENTE',
                'codigo_tecnico_aeronave_quando_aplicavel':'',
                'manual_controlado':'','revisao_manual':'',
                'referencia_secao':'','revisor_tecnico':'',
                'data_revisao':'','evidencia_revisao':'',
                'status':'PENDENTE',
            })
    guides=[{
        'sessao':session,
        'codigo_fonte':'LEGADO_FUNCIONAL',
        'fonte_pto_sha256':APPROVED_SHA,
        'posicoes_funcionais':18,
        'notechs_por_sessao':15,
        'referencia_pto_funcional':'',
        'revisor_tecnico':'',
        'revisao_data':'',
        'evidencia':'',
        'status':'PENDENTE',
    } for session in sorted(sessions)]
    return rows,guides

def write_csv(path,rows,fields):
    with path.open('w',newline='',encoding='utf-8-sig') as stream:
        writer=csv.DictWriter(stream,fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--candidate',type=Path,required=True)
    p.add_argument('--enriched',type=Path,required=True)
    p.add_argument('--functional',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    candidate=json.loads(a.candidate.read_text())
    enriched=json.loads(a.enriched.read_text())
    rows,guides,summary=build_ledger(candidate,enriched)
    functional_rows,functional_guides=build_functional_ledger(json.loads(a.functional.read_text()))
    a.out.mkdir(parents=True,exist_ok=True)
    write_csv(a.out/'revisao_1476_posicoes.csv',rows,REQUIRED_FIELDS)
    write_csv(a.out/'aceite_82_guias.csv',guides,list(guides[0]))
    write_csv(a.out/'revisao_108_posicoes_funcionais.csv',functional_rows,list(functional_rows[0]))
    write_csv(a.out/'aceite_6_guias_funcionais.csv',functional_guides,list(functional_guides[0]))
    summary['posicoes_funcionais']=len(functional_rows)
    summary['guias_funcionais']=len(functional_guides)
    summary['notechs_funcionais']=len(functional_guides)*15
    summary['posicoes_funcionais_validadas']=0
    summary['guias_funcionais_validados']=0
    (a.out/'status_aceite.json').write_text(
        json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
