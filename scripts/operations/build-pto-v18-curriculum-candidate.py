#!/usr/bin/env python3
"""Produce a versioned, NON-IMPORTABLE V18 curriculum candidate for technical review.

The approved DOCX supplies the curriculum; matching legacy catalog entries only
supply *unapproved* contextual metadata. No scenario or QRH step is inferred.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path

APPROVED = '040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912'

def classify(s):
    code=s['codigo']
    title=s['titulo'].casefold()
    if 'check' in title or 'exame' in title:
        nature='CHECK_INDEPENDENTE'
    else:
        nature='INSTRUCAO'
    program=s['programa']
    is_s76_extra=code.startswith('S76-P-AD-')
    load=s['carga']
    if load.startswith('90 minutos'): practical=90
    elif load.startswith('2 horas'): practical=120
    elif load.startswith('3 horas'): practical=180
    elif load.startswith('1 hora'): practical=60
    else: raise ValueError(f'carga horária não mapeada {code}: {load}')
    return {
        'codigo': code,'aeronave':s['aeronave'],
        'titulo':s['titulo'],'programa':program,
        'natureza_candidata':nature,'carga_pto':load,
        'minutos_pratica_ffs':practical,
        'carga_indica_apenas_pratica': 'práticas em FFS' in load,
        'condicional':is_s76_extra,
        'condicao': 'Cumprimento da complementação do periódico S76 sujeito aos critérios PTO Rev10 V18' if is_s76_extra else None,
        'status':'PENDENTE_DE_VALIDACAO_TECNICA',
    }

def build(sessions,technical,notechs,reconciliation,functional,approved_sha):
    if approved_sha != APPROVED:raise ValueError('PTO diferente da versão aprovada')
    if len(sessions)!=82 or len(technical)!=1476 or len(notechs)!=15:
        raise ValueError('PTO V18 incompleto: 82 sessões/1476 eventos/15 NOTECHS exigidos')
    keys={s['codigo'] for s in sessions}
    if len(keys)!=82:raise ValueError('sessões PTO duplicadas')
    per_session=collections.defaultdict(list)
    for item in technical:
        if item['sessao'] not in keys:raise ValueError('evento refere sessão ausente')
        per_session[item['sessao']].append(item)
    metadata={(item['sessao'],int(item['ordem'])):item for item in reconciliation['all_items']}
    if len(metadata)!=1476 or len(reconciliation['all_items'])!=1476:
        raise ValueError('reconciliação sem 1476 referências únicas')
    models=[]
    unresolved=[]
    for session in sessions:
        m=classify(session)
        rows=sorted(per_session.get(m['codigo'],[]),key=lambda x:int(x['ordem']))
        if len(rows)!=18 or any(int(row['ordem'])!=i+1 for i,row in enumerate(rows)):
            raise ValueError(f'{m["codigo"]}: não tem 18 posições técnicas 1..18')
        m['technical_items']=[]
        for item in rows:
            ref=metadata[(m['codigo'],int(item['ordem']))]
            if any(item[k]!=ref[kk] for k,kk in
               [('codigo','codigo'),('nome','manobra_procedimento'),('perna','perna_pf')]):
                raise ValueError(f'{m["codigo"]}: reconciliação distinta na posição {item["ordem"]}')
            valid=ref['reconciliation_status']=='EXACT_CATALOG_CODE_AND_NAME'
            new_item={
                'ordem':int(item['ordem']),'codigo':item['codigo'],
                'nome':item['nome'],'perna_pf':item['perna'],
                'metadata_legacy':ref.get('legacy_reference_metadata') if valid else None,
                'reconciliation_status':ref['reconciliation_status'],
                'operational_validation':'PENDENTE'
            }
            m['technical_items'].append(new_item)
            if not valid:
                unresolved.append({'sessao':m['codigo'],'ordem':item['ordem'],'codigo':item['codigo'],
                                   'motivo':ref['reconciliation_status']})
        m['notechs']=[n['codigo'] for n in notechs]
        models.append(m)
    if len(functional.get('codigos_canonicos',[]))!=94 or len(functional.get('relacoes_por_sessao',[]))!=108:
        raise ValueError('catálogo funcional legado diferente de 94 códigos/108 vínculos')
    counts=collections.Counter(x['sessao'] for x in functional['relacoes_por_sessao'])
    if len(counts)!=6 or set(counts.values())!={18}:
        raise ValueError('sessões de instrutor/examinador não são 6×18')
    return {
        'status':'DRAFT_NOT_IMPORTABLE_NOT_PUBLISHED',
        'source_sha256':approved_sha,
        'totals':{
            'aircraft_sessions':len(models),'aircraft_links':sum(len(m['technical_items']) for m in models),
            'notechs_codes':len(notechs),'notechs_links':len(models)*len(notechs),
            'functional_sessions':len(counts),'functional_links':len(functional['relacoes_por_sessao']),
            'total_models':len(models)+len(counts),
            'total_technical_links':sum(len(m['technical_items']) for m in models)+len(functional['relacoes_por_sessao']),
            'conditional_s76_extra_sessions':sum(bool(m['condicional']) for m in models),
            'unresolved_technical_positions':len(unresolved),
        },
        'unresolved':unresolved,'sessions':models,
        'functional_source':'legado controlado; exige validação contra seção de instrutor/examinador do PTO',
    }

def main():
    p=argparse.ArgumentParser()
    for arg in ('sessions','technical','notechs','reconciliation','functional','manifest','out'):
        p.add_argument('--'+arg,type=Path,required=True)
    opts=p.parse_args()
    load=lambda path: json.loads(path.read_text())
    data=build(load(opts.sessions),load(opts.technical),load(opts.notechs),
        load(opts.reconciliation),load(opts.functional),load(opts.manifest)['sha256_fonte'])
    opts.out.parent.mkdir(parents=True,exist_ok=True)
    opts.out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(data['totals'],ensure_ascii=False,indent=2))
if __name__=='__main__':
    main()
