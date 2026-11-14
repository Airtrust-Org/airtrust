#!/usr/bin/env python3
"""Compare read-only production D1 exports to PTO V18, without changing D1.

Requires Wrangler --json SELECT snapshots with meta.rows_written=0 and changed_db=false.
No API credentials, network operations or SQL execution happen in this script.
"""
import argparse
import collections
import hashlib
import importlib.util
import json
import re
import unicodedata
from pathlib import Path

AUDIT = Path(__file__).with_name('audit-pto-rev10-v18.py')
spec = importlib.util.spec_from_file_location('pto_v18_audit', AUDIT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

APPROVED_SHA = '040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912'

def load_readonly_export(path):
    entries = json.loads(path.read_text())
    if not isinstance(entries, list) or len(entries) != 1:
        raise ValueError(f'{path}: export JSON não é uma única consulta')
    entry = entries[0]
    if entry.get('success') is not True or not isinstance(entry.get('results'), list):
        raise ValueError(f'{path}: consulta não confirmada')
    meta = entry.get('meta', {})
    if meta.get('changed_db') is not False or int(meta.get('rows_written', -1)) != 0:
        raise ValueError(f'{path}: não há comprovação de consulta exclusivamente de leitura')
    return entry['results']

def compare(pto, models, links, guides):
    per_model = collections.defaultdict(list)
    for item in links:
        per_model[int(item['modelo_id'])].append(item)
    by_code = collections.defaultdict(list)
    for model in models:
        if int(model['id']) <= 0 or not model.get('codigo_corrente'):
            raise ValueError('modelo de produção sem identidade estável')
        by_code[model['codigo_corrente']].append(model)
    linked_guides = collections.defaultdict(list)
    for guide in guides:
        linked_guides[int(guide['modelo_id'])].append(guide)

    report_rows = []
    for code, session in pto.items():
        candidates = []
        for model in by_code.get(code, []):
            mid = int(model['id'])
            actual = sorted(per_model.get(mid, []), key=lambda row: int(row['ordem']))
            discrepancies = []
            for pos in range(max(len(actual), len(session['itens']))):
                if pos >= len(actual):
                    discrepancies.append({'ordem': pos + 1, 'kind': 'ITEM_MISSING'})
                    continue
                if pos >= len(session['itens']):
                    discrepancies.append({'ordem': pos + 1, 'kind': 'ITEM_EXTRA'})
                    continue
                observed, wanted = actual[pos], session['itens'][pos]
                if int(observed['ordem']) != wanted['ordem']:
                    discrepancies.append({'ordem': pos + 1, 'kind': 'ORDER', 'actual': observed['ordem']})
                if str(observed['manobra_codigo']) != str(wanted['codigo']):
                    discrepancies.append({'ordem': pos + 1, 'kind': 'CODE',
                                          'wanted': wanted['codigo'], 'actual': observed['manobra_codigo']})
                if audit.normalize(observed['manobra_nome']) != audit.normalize(wanted['nome']):
                    discrepancies.append({'ordem': pos + 1, 'kind': 'DESCRIPTION',
                                          'wanted': wanted['nome'], 'actual': observed['manobra_nome']})
            attached = linked_guides.get(mid, [])
            candidates.append({
                'modelo_id': mid, 'physical_code': model['codigo'],
                'version': int(model.get('versao') or 0),
                'technical_count': len(actual),
                'full_technical_match': len(actual) == 18 and not discrepancies,
                'discrepancies': discrepancies,
                'active_guide_links': len(attached),
                'guides': [{
                    'codigo': g['guia_codigo'],
                    'status': g['guia_status'],
                    'html_status': g['html_status']
                } for g in attached],
            })
        candidates.sort(key=lambda m: (-m['version'], m['modelo_id']))
        selected = candidates[0] if candidates else None
        report_rows.append({
            'codigo_pto': code,
            'aeronave': 'AW139' if code.startswith('A139-') else 'S76',
            'status': 'NO_CANONICAL_CODE_MATCH' if not selected else
                      'TECHNICAL_MATCH' if selected['full_technical_match'] else 'TECHNICAL_MISMATCH',
            'current_candidate': selected,
            'all_candidate_count': len(candidates),
            'other_candidate_ids': [c['modelo_id'] for c in candidates[1:]],
        })

    counts = collections.Counter(r['status'] for r in report_rows)
    return {
        'counts': {
            'active_model_records': len(models),
            'active_technical_links': len(links),
            'active_guide_links': len(guides),
            'active_models_linked_to_guides': len({int(g['modelo_id']) for g in guides}),
            'pto_sessions': len(pto),
            'pto_technical_items': sum(len(s['itens']) for s in pto.values()),
            'status_counts': dict(sorted(counts.items())),
            'matched_models_with_guide': sum(
                bool(r['current_candidate'] and r['current_candidate']['active_guide_links'])
                for r in report_rows),
        },
        'per_session': report_rows,
    }

def main():
    parser = argparse.ArgumentParser()
    for name in ('pto', 'models', 'links', 'guides', 'out'):
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    source_sha = hashlib.sha256(args.pto.read_bytes()).hexdigest()
    if source_sha != APPROVED_SHA:
        raise ValueError('PTO informado não corresponde à revisão V18 aprovada')
    pto = audit.pto_tables(args.pto)
    result = compare(pto, load_readonly_export(args.models),
                     load_readonly_export(args.links), load_readonly_export(args.guides))
    result['document_sha256'] = source_sha
    result['scope'] = 'READ_ONLY_PRODUCTION_SNAPSHOT_CODE_AND_TECHNICAL_PARITY'
    result['limitations'] = ['Sem equivalência semântica de códigos antigos',
        'Sem checagem de perna PF nos contextos D1',
        'Sem leitura do conteúdo HTML em R2',
        'Sem validação de NOTECHS/scores ou instrução/check',
        'Sem alteração de dados no D1']
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(result['counts'], ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
