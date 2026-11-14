#!/usr/bin/env python3
"""Propose controlled PTO V18 lineage from read-only D1 metadata.

No automatic equivalence or retirements. Only one explicit syntactic alias
(SK76 -> S76 on S76 initial codes) may be suggested for human review.
"""
import argparse
import collections
import importlib.util
import json
from pathlib import Path

BASE=Path(__file__).with_name('audit-pto-v18-production-snapshot.py')
spec=importlib.util.spec_from_file_location('production_snapshot',BASE)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def safe_candidate_alias(code):
    if code.startswith('S76-I-') and code.count('/')==1:
        return 'SK76-' + code[len('S76-'):]
    return None

def classify(contract, models):
    if len(contract)!=82: raise ValueError('matriz curricular V18 exige 82 sessões')
    direct=collections.defaultdict(list)
    for row in models:
        if not row.get('codigo_corrente'):
            raise ValueError('modelo sem código canônico')
        direct[row['codigo_corrente']].append(row)
    seen=set()
    report=[]
    for session in contract:
        code=session['codigo']
        if code in seen: raise ValueError('código do PTO duplicado')
        seen.add(code)
        exact=direct.get(code,[])
        alias=safe_candidate_alias(code)
        alias_candidates=direct.get(alias,[]) if alias else []
        if exact:
            classification='EXACT_CANONICAL_CODE_PENDING_TECHNICAL_REVIEW'
            matches=exact
        elif alias_candidates:
            classification='SYNTACTIC_SK76_PREFIX_ALIAS_REQUIRES_APPROVAL'
            matches=alias_candidates
        else:
            classification='NO_SUPPORTED_LINEAGE'
            matches=[]
        report.append({
            'pto_code':code,'aircraft':session['aeronave'],
            'classification':classification,
            'alias_proposed':alias if alias_candidates and not exact else None,
            'model_candidates':sorted([{'id':int(row['id']),
                'physical_code':row['codigo'],
                'canonical_code':row['codigo_corrente'],
                'version':int(row.get('versao') or 0)}
                for row in matches],key=lambda x:(-x['version'],x['id'])),
            'manual_approval_required':True,
            'safe_to_auto_retire_or_merge':False,
        })
    counts=collections.Counter(x['classification'] for x in report)
    return {'status':'READ_ONLY_PROPOSAL_DO_NOT_APPLY',
        'totals':{'pto_sessions':82,'exact_code_matches':counts['EXACT_CANONICAL_CODE_PENDING_TECHNICAL_REVIEW'],
            'syntactic_sk76_aliases':counts['SYNTACTIC_SK76_PREFIX_ALIAS_REQUIRES_APPROVAL'],
            'unresolved_lineage':counts['NO_SUPPORTED_LINEAGE']},
        'sessions':report}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--contract',type=Path,required=True)
    p.add_argument('--models',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    contract=json.loads(a.contract.read_text())
    models=module.load_readonly_export(a.models)
    report=classify(contract,models)
    a.out.parent.mkdir(parents=True,exist_ok=True)
    a.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report['totals'],ensure_ascii=False,indent=2))
if __name__=='__main__':
    main()
