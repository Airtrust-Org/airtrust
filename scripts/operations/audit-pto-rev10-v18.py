#!/usr/bin/env python3
"""Read-only PTO Rev.10 V18 vs private AirTrust import packages, without external dependencies."""
import argparse
import collections
import hashlib
import json
import re
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def cell_text(cell):
    paragraphs = cell.findall('.//w:p', NS)
    return '\n'.join(''.join(t.text or '' for t in p.findall('.//w:t', NS)) for p in paragraphs).strip()

def normalize(value):
    s = unicodedata.normalize('NFKD', str(value or ''))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^A-Z0-9]+', '', s.upper())

def pto_tables(path):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    session_rows = {}
    for table in root.findall('.//w:tbl', NS):
        rows = [[cell_text(c) for c in row.findall('./w:tc', NS)]
                for row in table.findall('./w:tr', NS)]
        if len(rows) != 21 or not rows or len(rows[0]) < 4: continue
        head = rows[0]
        if head[0] != 'Código' or not re.match(r'^(A139|S76)-', head[1]): continue
        code = head[1].strip()
        if code in session_rows: raise ValueError('Código duplicado no PTO: '+code)
        items=[]
        for i, r in enumerate(rows[3:], 1):
            if len(r)<4 or int(r[0]) != i: raise ValueError('Posição inconsistente: '+code)
            items.append({'ordem':i,'perna':r[1].strip(),'codigo':r[2].strip(),'nome':r[3].strip()})
        if len(items)!=18: raise ValueError('Falta posição: '+code)
        session_rows[code]={'codigo':code,'titulo':rows[1][1].strip(),'carga':head[3].strip() if len(head)>3 else '', 'itens':items}
    if len(session_rows)!=82: raise ValueError(f'PTO: esperadas 82 sessões, extraídas {len(session_rows)}')
    return session_rows

def duration_equivalent(a, b):
    # O PTO pode registrar horas de prática; o pacote inclui briefing/exame/debriefing.
    match_a=re.match(r'^(\d+) horas?',str(a))
    match_b=re.match(r'^(\d+) horas?',str(b))
    if match_a and match_b and match_a.group(1)==match_b.group(1):return True
    if 'práticas em FFS' in str(a) and 'práticas em FFS' in str(b) and str(a) in str(b):return True
    return normalize(a)==normalize(b)

def compare(pto, package_dirs):
    issues=[]
    for aircraft, d in package_dirs.items():
        sessions=json.loads((d/'sessoes.json').read_text())
        matrix=json.loads((d/'matriz_tecnica.json').read_text())
        source={s['sessao']:s for s in sessions}
        rows=collections.defaultdict(list)
        for row in matrix: rows[row['sessao']].append(row)
        subset={k:v for k,v in pto.items() if k.startswith('A139-' if aircraft=='AW139' else 'S76-')}
        for code in sorted(subset.keys()-source.keys()):
            issues.append({'severity':'P0','kind':'SESSION_MISSING','aircraft':aircraft,'session':code})
        for code in sorted(source.keys()-subset.keys()):
            issues.append({'severity':'P1','kind':'SESSION_NOT_IN_PTO','aircraft':aircraft,'session':code})
        for code in sorted(subset.keys() & source.keys()):
            expected=subset[code]
            actual=source[code]
            if normalize(expected['titulo']) != normalize(actual.get('titulo')):
                issues.append({'severity':'P1','kind':'TITLE','aircraft':aircraft,'session':code,'pto':expected['titulo'],'airtrust':actual.get('titulo')})
            if not duration_equivalent(expected['carga'], actual.get('carga_sessao')):
                issues.append({'severity':'P0','kind':'DURATION','aircraft':aircraft,'session':code,'pto':expected['carga'],'airtrust':actual.get('carga_sessao')})
            got=sorted(rows.get(code,[]),key=lambda x:int(x['ordem']))
            if len(got)!=18:
                issues.append({'severity':'P0','kind':'ITEM_COUNT','aircraft':aircraft,'session':code,'pto':18,'airtrust':len(got)})
            for i,exp in enumerate(expected['itens']):
                if i>=len(got): break
                a=got[i]
                for key, pkey in [('codigo','codigo'),('manobra_procedimento','nome'),('perna_pf','perna')]:
                    if normalize(exp[pkey]) != normalize(a.get(key)):
                        issues.append({'severity':'P0' if key=='codigo' else 'P1','kind':key.upper(),'aircraft':aircraft,'session':code,'ordem':i+1,'pto':exp[pkey],'airtrust':a.get(key)})
        # Guia do instrutor precisa estar associado a código exato e conter os eventos do PTO.
        guides=list((d/'html').glob('*.html'))
        for code, expected in subset.items():
            matches=[g for g in guides if normalize(code) in normalize(g.stem)]
            if not matches:
                issues.append({'severity':'P0','kind':'GUIDE_MISSING','aircraft':aircraft,'session':code})
                continue
            if len(matches)!=1:
                issues.append({'severity':'P0','kind':'GUIDE_AMBIGUOUS','aircraft':aircraft,'session':code,'count':len(matches)})
                continue
            content=matches[0].read_text(errors='replace')
            for item in expected['itens']:
                if item['codigo'] not in content:
                    issues.append({'severity':'P0','kind':'GUIDE_EVENT_MISSING','aircraft':aircraft,'session':code,'ordem':item['ordem'],'codigo':item['codigo']})
    return issues

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--pto',required=True,type=Path)
    ap.add_argument('--aw139',required=True,type=Path)
    ap.add_argument('--s76',required=True,type=Path)
    ap.add_argument('--out',required=True,type=Path)
    a=ap.parse_args()
    document_hash=hashlib.sha256(a.pto.read_bytes()).hexdigest()
    if document_hash != '040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912':
        raise ValueError('PTO diferente da revisão 10 V18 aprovada: hash inesperado')
    pto=pto_tables(a.pto)
    issues=compare(pto,{'AW139':a.aw139,'S76':a.s76})
    counts=collections.Counter(i['kind'] for i in issues)
    report={'source':'PRG-OPS-001 PTO Rev.10 V18','pto_sha256':hashlib.sha256(a.pto.read_bytes()).hexdigest(),
        'pto_session_count':len(pto),'pto_item_count':sum(len(s['itens']) for s in pto.values()),
        'pto_aircraft_counts':dict(collections.Counter('AW139' if k.startswith('A139-') else 'S76' for k in pto)),
        'issues_by_kind':dict(sorted(counts.items())),'issues_count':len(issues),'issues':issues}
    a.out.parent.mkdir(parents=True,exist_ok=True)
    a.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='issues'},ensure_ascii=False,indent=2))
    return 1 if issues else 0
if __name__=='__main__':
    raise SystemExit(main())
