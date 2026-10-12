#!/usr/bin/env python3
"""In-memory only: Schema V2 0548 D1 SQL safety regression; no remote database."""
import pathlib
import sqlite3

sql = pathlib.Path("worker-airtrust/schema-v2/changes/0548_training_compliance_maintenance_iio_aprs_assistants.sql").read_text()

def fixture(valid=True, extra_rule=False):
    db = sqlite3.connect(":memory:")
    db.executescript("""
    CREATE TABLE qualificacoes_tipos(id INTEGER, empresa_id INTEGER, codigo TEXT, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE funcoes(id INTEGER, empresa_id INTEGER, nome TEXT, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE funcionarios(id INTEGER, empresa_id INTEGER, funcao_id INTEGER, status TEXT, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE treinamento_requisitos(
      id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_tipo_id INTEGER,
      escopo TEXT, funcao_id INTEGER, obrigatoriedade TEXT, critico_operacional INTEGER,
      origem TEXT, referencia_normativa TEXT, justificativa TEXT, fundamento_tipo TEXT,
      fundamento_documento TEXT, validade_fonte TEXT, modalidade_requerida TEXT,
      auto_matricular_ead INTEGER, ativo INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    INSERT INTO qualificacoes_tipos VALUES(127,6,'MNT_IIO_APRS',1,NULL);
    INSERT INTO funcoes VALUES (5,6,'Mecânico',1,NULL),(38,6,'Auxiliar de Manutenção',1,NULL),
        (39,6,'Coordenador de Engenharia',1,NULL),(38,7,'Auxiliar de Manutenção',1,NULL);
    INSERT INTO treinamento_requisitos(
        id,empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,
        origem,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,
        auto_matricular_ead,ativo)
      VALUES
      (198,6,127,'FUNCAO',5,'OBRIGATORIA',0,'EMPRESA','original mechanic',
       'POLITICA_INTERNA','Política interna','EVIDENCIA',0,1),
      (199,6,127,'FUNCAO',39,'OBRIGATORIA',0,'EMPRESA','original coordinator',
       'POLITICA_INTERNA','Política interna','EVIDENCIA',0,1);
    """)
    for i in range(6 if valid else 5):
        db.execute("INSERT INTO funcionarios VALUES(?,6,38,'ATIVO',1,NULL)", (1000+i,))
    db.execute("INSERT INTO funcionarios VALUES(2000,7,38,'ATIVO',1,NULL)")
    if extra_rule:
        db.execute("INSERT INTO treinamento_requisitos(id,empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,ativo) VALUES(200,6,127,'FUNCAO',38,'OBRIGATORIA',1)")
    db.commit()
    return db

db = fixture()
db.executescript(sql)
assert db.execute("SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6").fetchone()[0] == 3
assert db.execute("SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=7").fetchone()[0] == 0
assert db.execute("SELECT justificativa FROM treinamento_requisitos WHERE id=198").fetchone()[0] == "original mechanic"
new = db.execute("SELECT obrigatoriedade,auto_matricular_ead,validade_fonte,justificativa FROM treinamento_requisitos WHERE empresa_id=6 AND funcao_id=38").fetchone()
assert new[0:3] == ("OBRIGATORIA", 0, "EVIDENCIA")
assert "não concede" in new[3]

for valid, extra_rule in [(False, False),(True, True)]:
    db = fixture(valid=valid, extra_rule=extra_rule)
    before = db.execute("SELECT COUNT(*) FROM treinamento_requisitos").fetchone()[0]
    try:
        db.executescript(sql)
        raise AssertionError("preflight must reject mismatched fixture")
    except sqlite3.DatabaseError:
        pass
    after = db.execute("SELECT COUNT(*) FROM treinamento_requisitos").fetchone()[0]
    assert before == after

print("Schema 0548 synthetic positive/negative/cross-tenant checks passed")
