#!/usr/bin/env python3
import collections
import pathlib
import re
import sqlite3

root = pathlib.Path(__file__).resolve().parents[2]
sql = (root / 'worker-airtrust/schema-v2/changes/0545_training_compliance_canonical_pdf_alignment.sql').read_text()
targets = re.findall(r" \('([^']+)','([^']+)'\)", sql)
expected = {'NR-11': 2, 'NR-12': 2, 'NR-20': 4, 'NR-26': 18, 'NR-35': 2, 'FOD': 20, 'PPSP': 20}
assert dict(collections.Counter(c for c, _ in targets)) == expected, targets
db = sqlite3.connect(':memory:')
db.executescript('''
CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT,categoria TEXT,categoria_id INTEGER,validade INTEGER,carga_horaria INTEGER,carga_horaria_inicial INTEGER,carga_horaria_recorrente INTEGER,observacoes TEXT,updated_at TEXT);
CREATE TABLE funcoes (id INTEGER PRIMARY KEY,empresa_id INTEGER,nome TEXT,ativo INTEGER,deleted_at TEXT);
CREATE TABLE compliance_condicoes (id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,ativo INTEGER,deleted_at TEXT);
CREATE TABLE treinamento_requisitos (id INTEGER PRIMARY KEY,empresa_id INTEGER,qualificacao_tipo_id INTEGER,escopo TEXT,funcao_id INTEGER,obrigatoriedade TEXT,critico_operacional INTEGER,origem TEXT,referencia_normativa TEXT,justificativa TEXT,modalidade_requerida TEXT,condicao_id INTEGER,fundamento_tipo TEXT,fundamento_documento TEXT,validade_fonte TEXT,auto_matricular_ead INTEGER,ativo INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
INSERT INTO compliance_condicoes (id,empresa_id,codigo,ativo) VALUES (1,6,'MEMBRO_CIPA',1),(11,7,'MEMBRO_CIPA',1);
''')
codes = sorted(set(c for c, _ in targets) | {'NR-05', 'FDM-MECANICO', 'REGRAS_OURO_PETROBRAS', 'AUD_COMP', 'MUDA'})
names = sorted(set(n for _, n in targets))
for i, code in enumerate(codes, 1):
    db.execute("INSERT INTO qualificacoes_tipos(id,empresa_id,codigo,ativo,categoria,validade,carga_horaria) VALUES (?,6,?,1,'EAD',24,2)", (i, code))
for i, name in enumerate(names, 1):
    db.execute("INSERT INTO funcoes(id,empresa_id,nome,ativo) VALUES (?,6,?,1)", (i, name))
ids = {code: db.execute('SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo=?', (code,)).fetchone()[0] for code in codes}
funcids = {name: db.execute('SELECT id FROM funcoes WHERE empresa_id=6 AND nome=?', (name,)).fetchone()[0] for name in names}
db.execute("INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,ativo) VALUES (6,?,'EMPRESA','OBRIGATORIA',1)", (ids['NR-05'],))
db.execute("INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,ativo) VALUES (6,?,'EMPRESA','OBRIGATORIA',1)", (ids['REGRAS_OURO_PETROBRAS'],))
for code, names_for_code in [
    ('NR-20', ['Auxiliar de Suprimentos', 'Supervisor de Suprimentos']),
    ('NR-26', [name for c, name in targets if c == 'NR-26'][:12]),
    ('FOD', [name for c, name in targets if c == 'FOD'][:13]),
    ('PPSP', [name for c, name in targets if c == 'PPSP'][:13]),
    ('FDM-MECANICO', ['Mecânico', 'Auxiliar de Manutenção']),
]:
    for name in names_for_code:
        db.execute("INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,ativo) VALUES (6,?,'FUNCAO',?,'OBRIGATORIA',1)", (ids[code], funcids[name]))
db.execute("INSERT INTO qualificacoes_tipos(id,empresa_id,codigo,ativo,categoria) VALUES (1007,7,'NR-05',1,'EAD')")
db.execute("INSERT INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,ativo) VALUES (7,1007,'EMPRESA','OBRIGATORIA',1)")
db.commit()
for run in (1,2):
    db.executescript(sql)
    for code, count in expected.items():
        actual = db.execute("SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=? AND escopo='FUNCAO' AND ativo=1 AND deleted_at IS NULL", (ids[code],)).fetchone()[0]
        assert actual == count, (run, code, actual, count)
    assert db.execute("SELECT categoria,validade,carga_horaria FROM qualificacoes_tipos WHERE id=?", (ids['NR-05'],)).fetchone() == ('Treinamento', None, None)
    assert db.execute("SELECT condicao_id FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=? AND ativo=1", (ids['NR-05'],)).fetchall() == [(1,)]
    assert db.execute("SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=? AND ativo=1", (ids['REGRAS_OURO_PETROBRAS'],)).fetchone()[0] == 0
    assert db.execute("SELECT validade,carga_horaria FROM qualificacoes_tipos WHERE id=?", (ids['FDM-MECANICO'],)).fetchone() == (None, 1)
    assert db.execute("SELECT categoria FROM qualificacoes_tipos WHERE id=1007 AND empresa_id=7").fetchone()[0] == 'EAD'
    assert db.execute("SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=7 AND ativo=1").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=? AND ativo=1", (ids['FDM-MECANICO'],)).fetchone()[0] == 2
print('TRAINING_COMPLIANCE_0545_SQLITE_PASS')
