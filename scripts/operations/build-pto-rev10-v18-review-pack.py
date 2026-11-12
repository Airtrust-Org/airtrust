#!/usr/bin/env python3
"""Generate private PTO V18 canonical curriculum and guide review drafts.

Never imports data to AirTrust. Generated guides are NOT operationally approved.
"""
import argparse
import hashlib
import html
import importlib.util
import json
from pathlib import Path
import zipfile
from xml.etree import ElementTree as ET

AUDIT = Path(__file__).with_name('audit-pto-rev10-v18.py')
spec = importlib.util.spec_from_file_location('pto_audit', AUDIT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
NS = audit.NS

def notechs_from_pto(docx):
    with zipfile.ZipFile(docx) as z:
        root=ET.fromstring(z.read('word/document.xml'))
    found=[]
    for table in root.findall('.//w:tbl',NS):
        rows=[[audit.cell_text(c) for c in r.findall('./w:tc',NS)] for r in table.findall('./w:tr',NS)]
        if not rows or rows[0][:2]!=['Código NOTECHS','Elemento']: continue
        for row in rows[1:]:
            if len(row)<4: raise ValueError('NOTECHS sem evidência no documento')
            found.append(dict(codigo=row[0],elemento=row[1],categoria=row[2],evidencia=row[3]))
    if len(found)!=15 or len({v['codigo'] for v in found})!=15:
        raise ValueError(f'Esperados 15 NOTECHS; encontrados {len(found)}')
    return found

def type_from_code(code):
    section=code.split('-')[1]
    return {'I':'Inicial','T':'Transição','P':'Periódico',
            'S':'Semestral','RQ':'Requalificação','REC':'Reaquisição de experiência recente',
            'NOT':'Treinamento noturno'}[section]

def html_page(session,notechs):
    esc=html.escape
    tech='\n'.join('<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>'.format(
        x['ordem'],esc(x['perna']),esc(x['codigo']),esc(x['nome']),'<em>Validar critério técnico no SOP/RFM/QRH da variante</em>')
        for x in session['itens'])
    nrows='\n'.join('<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>'.format(
        esc(x['codigo']),esc(x['elemento']),esc(x['categoria']),esc(x['evidencia']))
        for x in notechs)
    return '''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Guia em validação: {code}</title>
<style>body{{font-family:Arial,sans-serif;max-width:1100px;margin:2rem auto;line-height:1.5}}
h1,h2{{color:#173456}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #ccc;padding:7px;vertical-align:top}}
th{{background:#edf2f7}}.warning{{background:#fff0d2;border:2px solid #9c6200;padding:1em}}</style></head>
<body><div class="warning"><strong>RASCUNHO — NÃO UTILIZAR NA INSTRUÇÃO, CHECK OU TREINAMENTO REAL.</strong>
Este guia apenas transcreve a estrutura do PTO aprovado. Procedimentos, cenários, critérios, variantes, QRH/SOP e uso operacional exigem validação por instrutor habilitado e controle documental.</div>
<h1>{code} — {title}</h1><p><b>Aeronave:</b> {aircraft} · <b>Programa:</b> {program} · <b>Carga curricular:</b> {load}</p>
<h2>18 manobras e procedimentos — sequência e PF conforme PTO</h2>
<table><thead><tr><th>Nº</th><th>Perna</th><th>Código PTO</th><th>Manobra/procedimento</th><th>Conferência técnica</th></tr></thead><tbody>{technical}</tbody></table>
<h2>15 competências NOTECHS — registro separado</h2>
<p>Aplicar a rubrica aprovada, registrar as evidências individualmente e não compensar uma deficiência por média. A aplicabilidade operacional deve ser confirmada pela gerência.</p>
<table><thead><tr><th>Código</th><th>Elemento</th><th>Categoria</th><th>Evidência observável</th></tr></thead><tbody>{notechs}</tbody></table>
<h2>Validações obrigatórias antes da publicação</h2><ol><li>Manual aplicável à variante e configuração do FFS.</li><li>Sequência, cenário, objetivos, condições iniciais e limites de cada exercício.</li><li>Divisão de pernas PF A / PF B, transição somente em solo e distribuição PM.</li><li>Briefing, debriefing, rubricas NOTECHS, assinatura e registro da sessão.</li><li>Identificação de exame/check, critérios, independência da avaliação e proibição de coaching.</li><li>Versão do guia vinculada à versão exata do modelo, sem alteração de fichas históricas.</li></ol>
<p><small>Fonte: PRG-OPS-001 PTO Rev.10 V18; guia gerado automaticamente para revisão, sem aprovação operacional.</small></p></body></html>
'''.format(code=esc(session['codigo']),title=esc(session['titulo']),
    aircraft=esc(session['aeronave']),program=esc(session['programa']),load=esc(session['carga']),
    technical=tech,notechs=nrows)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--pto',required=True,type=Path)
    p.add_argument('--out',required=True,type=Path)
    a=p.parse_args()
    digest=hashlib.sha256(a.pto.read_bytes()).hexdigest()
    if digest!='040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912':
        raise ValueError('Fonte PTO não corresponde ao SHA aprovado')
    sessions=audit.pto_tables(a.pto)
    notechs=notechs_from_pto(a.pto)
    out=a.out
    (out/'guias-rascunho').mkdir(parents=True,exist_ok=True)
    canonical=[]
    technical=[]
    for code,s in sessions.items():
        aircraft='AW139' if code.startswith('A139-') else 'S76'
        r={**s,'aeronave':aircraft,'programa':type_from_code(code),'status':'PENDENTE_DE_VALIDACAO_TECNICA'}
        canonical.append(r)
        technical.extend({'sessao':code,'aeronave':aircraft,**item} for item in s['itens'])
        (out/'guias-rascunho'/(code.replace('/','_')+'.html')).write_text(html_page(r,notechs))
    assert len(canonical)==82 and len(technical)==1476
    (out/'sessoes_pto_v18.json').write_text(json.dumps(canonical,ensure_ascii=False,indent=2)+'\n')
    (out/'matriz_tecnica_pto_v18.json').write_text(json.dumps(technical,ensure_ascii=False,indent=2)+'\n')
    (out/'notechs_pto_v18.json').write_text(json.dumps(notechs,ensure_ascii=False,indent=2)+'\n')
    manifest={'fonte':'PRG-OPS-001 PTO Rev10 V18','sha256_fonte':digest,
        'sessoes':len(canonical),'vinculos_tecnicos':len(technical),
        'guias_em_revisao':len(canonical),'notechs':len(notechs),
        'status':'NAO_APROVADO_NAO_IMPORTAVEL_NAO_PUBLICAVEL'}
    (out/'manifesto_validacao.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(manifest,ensure_ascii=False,indent=2))
if __name__=='__main__':
    main()
