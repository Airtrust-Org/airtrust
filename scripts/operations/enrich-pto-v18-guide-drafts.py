#!/usr/bin/env python3
"""Enrich 82 V18 draft instructor guides from explicitly matched historical records.

Only exact maneuver code + normalized description is reusable. If multiple
historical scenario variants exist, use exact source session or demand review.
All output is HTML-escaped and marked NOT APPROVED / NOT FOR OPERATIONAL USE.
"""
import argparse
import collections
import html
import importlib.util
import json
from pathlib import Path

BASE = Path(__file__).with_name('audit-pto-rev10-v18.py')
spec = importlib.util.spec_from_file_location('pto_v18_docx',BASE)
utils = importlib.util.module_from_spec(spec)
spec.loader.exec_module(utils)

FIELDS=('cenario_instrutor','padrao_esperado','como_observar','foco_avaliacao','referencia_tecnica')
LABELS={'cenario_instrutor':'Cenário legado para revisão',
        'padrao_esperado':'Padrão esperado legado para revisão',
        'como_observar':'Observação do instrutor legado para revisão',
        'foco_avaliacao':'Foco de avaliação legado para revisão',
        'referencia_tecnica':'Referência documental legada para conferência'}
def enrich(candidate, legacy_by_aircraft):
    if candidate.get('status')!='DRAFT_NOT_IMPORTABLE_NOT_PUBLISHED':
        raise ValueError('fonte não identificada como pacote de revisão não publicável')
    by_aircraft={}
    for aircraft in ('AW139','S76'):
        rows=legacy_by_aircraft[aircraft]
        by_code=collections.defaultdict(list)
        for row in rows:
            by_code[row['codigo']].append(row)
        by_aircraft[aircraft]=by_code
    guides=[]
    issues=[]
    for session in candidate['sessions']:
        records=[]
        for item in session['technical_items']:
            code=item['codigo']
            matches=[
                row for row in by_aircraft[session['aeronave']].get(code,[])
                if utils.normalize(row.get('manobra_procedimento'))==utils.normalize(item['nome'])]
            exact=[row for row in matches if row['sessao']==session['codigo']]
            unique_values={tuple(str(row.get(field,'')).strip() for field in FIELDS) for row in matches}
            exact_unique={tuple(str(row.get(field,'')).strip() for field in FIELDS) for row in exact}
            if len(exact_unique)==1:
                source=exact[0]; provenance='EXACT_HISTORICAL_SESSION'
            elif not exact_unique and len(unique_values)==1 and matches:
                source=matches[0];provenance='UNIQUE_LEGACY_CODE_AND_NAME_ACROSS_SESSIONS'
            else:
                source=None; provenance='PENDING_SOURCE_REVIEW'
            fields={f:source.get(f,'') if source else None for f in FIELDS}
            record={**item,'provenance':provenance,'legacy_fields':fields,
                    'operational_validation':'PENDENTE'}
            if not source:
                issues.append({'sessao':session['codigo'],'codigo':code,'ordem':item['ordem'],
                               'reason':'NO_MATCH_OR_SCENARIO_AMBIGUOUS',
                               'legacy_matching_rows':len(matches),
                               'distinct_legacy_scenarios':len(unique_values)})
            records.append(record)
        guides.append({'sessao':session,'items':records,'status':'REVIEW_ONLY_NOT_APPROVED'})
    return {'guides':guides,'issues':issues,'totals':{
        'sessions':len(guides),'technical_items':sum(len(g['items']) for g in guides),
        'items_with_unambiguous_legacy_context':sum(
            r['provenance']!='PENDING_SOURCE_REVIEW' for g in guides for r in g['items']),
        'items_requiring_context_review':len(issues),
        'exact_session_context_matches':sum(
            r['provenance']=='EXACT_HISTORICAL_SESSION' for g in guides for r in g['items']),
        'cross_session_context_matches':sum(
            r['provenance']=='UNIQUE_LEGACY_CODE_AND_NAME_ACROSS_SESSIONS'
            for g in guides for r in g['items'])
    }}

def guide_html(guide, notechs):
    session=guide['sessao']; esc=html.escape
    parts=[
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">',
        '<title>RASCUNHO - '+esc(session['codigo'])+'</title>',
        '<style>body{font:16px Arial,sans-serif;max-width:1080px;margin:32px auto;line-height:1.55}'
        '.warn{border:3px solid #ac4d00;background:#fff3d6;padding:16px}'
        'table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:7px;vertical-align:top}'
        'th{background:#eff2f5}section{margin:18px 0;padding:10px;border-bottom:2px solid #ddd}</style></head><body>',
        '<div class="warn"><strong>RASCUNHO NÃO HOMOLOGADO — NÃO UTILIZAR EM INSTRUÇÃO OU CHECK.</strong>'
        ' A matriz de códigos vem do PTO Rev10 V18. Textos operacionais a seguir provêm de pacotes anteriores '
        'e dependem de conferência de variante, RFM, QRH, SOP, critérios e aprovação técnica.</div>',
        '<h1>'+esc(session['codigo'])+' — '+esc(session['titulo'])+'</h1>',
        '<p>Aeronave: '+esc(session['aeronave'])+' | Carga PTO: '+esc(session['carga_pto'])+
        ' | Classificação provisória: '+esc(session['natureza_candidata'])+'</p>',
        '<p><strong>Distribuição PF:</strong> respeitar exatamente a perna indicada pelo PTO.'
        ' Alternância PF/PM somente em solo conforme programa aprovado.</p>',
    ]
    for row in guide['items']:
        parts += ['<section><h2>'+str(row['ordem'])+'. '+esc(row['codigo'])+
                  ' — '+esc(row['nome'])+'</h2>',
                  '<p><b>Perna:</b> '+esc(row['perna_pf'])+
                  ' | <b>Proveniência:</b> '+esc(row['provenance'])+
                  ' | <b>Validação operacional:</b> PENDENTE</p>']
        for field in FIELDS:
            value=row['legacy_fields'][field]
            parts.append('<p><b>'+esc(LABELS[field])+':</b> '+
                         (esc(str(value)) if value else '<em>Sem fonte legada unívoca; revisão técnica obrigatória</em>')+'</p>')
        parts.append('</section>')
    parts += ['<h2>15 NOTECHS e registro individual</h2>',
              '<table><thead><tr><th>Código</th><th>Elemento</th><th>Categoria</th><th>Evidência do PTO</th></tr></thead><tbody>']
    for competency in notechs:
        parts.append('<tr><td>'+esc(str(competency['codigo']))+'</td><td>'+
            esc(str(competency['elemento']))+'</td><td>'+esc(str(competency['categoria']))+
            '</td><td>'+esc(str(competency['evidencia']))+'</td></tr>')
    parts += ['</tbody></table>',
              '<p>Aplicar os 15 elementos e seus critérios aprovados no PTO. Não compensar notas individuais por média; '
              'validar evidências, regras de aprovação, ficha e assinaturas.</p>',
              '<h2>Revisões obrigatórias</h2><p>Confirmar documentação controlada vigente da variante, '
              'configuração do FFS, sequência de instrução/check, cenário, objetivos, briefing/debriefing, '
              'procedimentos e critérios de avaliação antes da publicação.</p></body></html>']
    return '\n'.join(parts)

def main():
    p=argparse.ArgumentParser()
    for name in ('candidate','aw139-legacy','s76-legacy','notechs','out'):
        p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args()
    load=lambda path:json.loads(path.read_text())
    result=enrich(load(a.candidate),{'AW139':load(a.aw139_legacy),'S76':load(a.s76_legacy)})
    notechs=load(a.notechs)
    if len(notechs)!=15 or len({n['codigo'] for n in notechs})!=15:
        raise ValueError('catálogo NOTECHS não corresponde aos 15 itens do PTO')
    if result['totals']['sessions']!=82 or result['totals']['technical_items']!=1476:
        raise ValueError('quantidade de guias/posições não corresponde ao PTO')
    a.out.mkdir(parents=True,exist_ok=True)
    for guide in result['guides']:
        name=guide['sessao']['codigo'].replace('/','_')+'.html'
        (a.out/name).write_text(guide_html(guide,notechs))
    # Dados operacionais históricos ficam somente no diretório privado;
    # este arquivo alimenta o registro de aceite e não pode ser publicado.
    (a.out/'dados_revisao_privados.json').write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    report={'status':'NOT_APPROVED_NON_OPERATIONAL',
        'totals':result['totals'],'issues':result['issues']}
    (a.out/'relatorio_revisao.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result['totals'],ensure_ascii=False,indent=2))
if __name__=='__main__':
    main()
