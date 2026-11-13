#!/usr/bin/env python3
"""Reconcile *draft* PTO V18 maneuver catalog against older packages.

No heuristics, no fabricated RFM/QRH references, no production or D1 writes.
Matches require both exact code and normalized procedure name.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import importlib.util

AUDIT = Path(__file__).with_name('audit-pto-rev10-v18.py')
spec = importlib.util.spec_from_file_location('pto_v18_audit', AUDIT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

def reconcile(contract, catalogs):
    if len(contract) != 1476:
        raise ValueError(f'PTO V18 exige 1476 vínculos; recebidos {len(contract)}')
    all_items = []
    missing = []
    reconciled = []
    canonical = collections.defaultdict(dict)
    for aircraft, rows in catalogs.items():
        if aircraft not in ('AW139','S76') or not isinstance(rows, list):
            raise ValueError('catálogo por aeronave inválido')
        by_code = {}
        for row in rows:
            code=row['codigo']
            if code in by_code:
                raise ValueError(f'{aircraft}: código duplicado no catálogo legado {code}')
            by_code[code]=row
        canonical[aircraft]=by_code

    for item in contract:
        code=item['codigo']
        aircraft=item['aeronave']
        if aircraft not in canonical or not code:
            raise ValueError('vínculo sem aeronave/código canônico')
        previous=canonical[aircraft].get(code)
        matches=bool(previous and
            audit.normalize(previous['descricao_canonica']) == audit.normalize(item['nome']))
        status='EXACT_CATALOG_CODE_AND_NAME' if matches else (
            'CODE_MISSING_IN_LEGACY_CATALOG' if not previous else 'DESCRIPTION_CONFLICT')
        new_item={
            'aeronave':aircraft,'sessao':item['sessao'],'ordem':item['ordem'],
            'perna_pf':item['perna'],'codigo':code,
            'manobra_procedimento':item['nome'],'reconciliation_status':status,
            'operational_validation':'PENDENTE' # source match != operational validation
        }
        if matches:
            new_item['legacy_reference_metadata']={
                k:previous.get(k) for k in (
                    'familia','categoria','tipo_conteudo','fase','fonte_principal',
                    'aeronave_variante','localizacao_fonte','revisao_data_fonte')
                if previous.get(k) is not None
            }
        else:
            missing.append({
                'aeronave':aircraft,'sessao':item['sessao'],'ordem':item['ordem'],
                'codigo':code,'pto_nome':item['nome'],
                'legacy_nome':previous.get('descricao_canonica') if previous else None,
                'status':status,
                'needed':'Conferir no SOP/RFM/QRH controlado, variante, contexto e critério de avaliação'
            })
        all_items.append(new_item)
    if len(all_items) != 1476:
        raise ValueError('perda de vínculos no processamento')
    unique_unresolved=sorted({(row['aeronave'],row['codigo']) for row in missing})
    return {
        'status':'DRAFT_NOT_APPROVED_NOT_IMPORTABLE',
        'totals':{
            'technical_links':len(all_items),
            'exact_prior_catalog_matches':len(all_items)-len(missing),
            'technical_links_requiring_review':len(missing),
            'distinct_maneuver_codes_requiring_review':len(unique_unresolved),
            'by_reason':dict(sorted(collections.Counter(x['reconciliation_status'] for x in all_items).items()))
        },
        'unique_unresolved_codes':[{'aeronave':a,'codigo':c} for a,c in unique_unresolved],
        'unresolved':missing,
        'all_items':all_items,
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--pto-v18-matrix',type=Path,required=True)
    ap.add_argument('--pto-v18-manifest',type=Path,required=True)
    ap.add_argument('--aw139-catalog',type=Path,required=True)
    ap.add_argument('--s76-catalog',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    args=ap.parse_args()
    manifest=json.loads(args.pto_v18_manifest.read_text())
    if manifest.get('sha256_fonte') != '040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912':
        raise ValueError('Manifesto do PTO aprovado não reconhecido')
    if manifest.get('status') != 'NAO_APROVADO_NAO_IMPORTAVEL_NAO_PUBLICAVEL':
        raise ValueError('Esperado manifesto de reconciliação sem aprovação operacional')
    matrix=json.loads(args.pto_v18_matrix.read_text())
    catalog={
        'AW139':json.loads(args.aw139_catalog.read_text()),
        'S76':json.loads(args.s76_catalog.read_text()),
    }
    result=reconcile(matrix,catalog)
    result['source_sha256']=manifest['sha256_fonte']
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result['totals'],ensure_ascii=False,indent=2))
if __name__=='__main__':
    main()
