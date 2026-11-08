#!/usr/bin/env python3
"""Memory-only regression for 0575: six assistants, drift guard, cross-tenant isolation."""
import pathlib
import sqlite3

SQL = pathlib.Path('worker-airtrust/schema-v2/changes/0575_training_compliance_iio_aprs_assistant_restore.sql').read_text()

def fixture(assistant_count=6, duplicate=False):
    db = sqlite3.connect(':memory:')
    db.executescript('''
    CREATE TABLE qualificacoes_tipos(id INTEGER, empresa_id INTEGER, codigo TEXT, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE funcoes(id INTEGER, empresa_id INTEGER, nome TEXT, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE funcionarios(id INTEGER, empresa_id INTEGER, funcao_id INTEGER, ativo INTEGER, status TEXT, deleted_at TEXT);
    CREATE TABLE treinamento_requisitos(id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_tipo_id INTEGER,
      escopo TEXT, funcao_id INTEGER, obrigatoriedade TEXT, auto_matricular_ead INTEGER,
      ativo INTEGER, deleted_at TEXT, updated_at TEXT);
    CREATE TABLE audit_logs(id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, entity_type TEXT,
      entity_id INTEGER, old_values TEXT, new_values TEXT, empresa_id INTEGER, created_at TEXT);
    INSERT INTO qualificacoes_tipos VALUES (127,6,'MNT_IIO_APRS',1,NULL);
    INSERT INTO funcoes VALUES (38,6,'Auxiliar de Manutenção',1,NULL),(38,7,'Auxiliar de Manutenção',1,NULL);
    INSERT INTO treinamento_requisitos VALUES
      (198,6,127,'FUNCAO',5,'OBRIGATORIA',0,1,NULL,'2026-09-30'),
      (199,6,127,'FUNCAO',39,'OBRIGATORIA',0,0,'2026-10-10 22:39:04','2026-10-10'),
      (704,6,127,'FUNCAO',38,'OBRIGATORIA',0,0,'2026-10-10 22:39:09','2026-10-10'),
      (705,7,127,'FUNCAO',38,'OBRIGATORIA',0,0,'2026-10-10','2026-10-10');
    ''')
    for n in range(assistant_count):
        db.execute('INSERT INTO funcionarios VALUES (?,6,38,1,\'ATIVO\',NULL)', (1000+n,))
    if duplicate:
        db.execute("INSERT INTO treinamento_requisitos VALUES (706,6,127,'FUNCAO',38,'OBRIGATORIA',0,1,NULL,'2026-10-10')")
    db.commit()
    return db

for count, dup, expected in [(6,False,1),(5,False,0),(6,True,0)]:
    db=fixture(count,dup)
    if expected:
        db.executescript(SQL)
    else:
        try:
            db.executescript(SQL)
            raise AssertionError('0575 must fail-closed on drift')
        except sqlite3.DatabaseError:
            pass
    changed=db.execute('SELECT ativo FROM treinamento_requisitos WHERE id=704').fetchone()[0]
    assert changed == expected, (count, dup, changed)
    audit=db.execute('SELECT COUNT(*) FROM audit_logs').fetchone()[0]
    assert audit == expected
    assert db.execute('SELECT ativo FROM treinamento_requisitos WHERE id=199').fetchone()[0] == 0
    assert db.execute('SELECT ativo FROM treinamento_requisitos WHERE id=198').fetchone()[0] == 1
    assert db.execute('SELECT ativo FROM treinamento_requisitos WHERE id=705').fetchone()[0] == 0
    if expected:
        try:
            db.executescript(SQL)
            raise AssertionError('replay must reject already-applied state')
        except sqlite3.DatabaseError:
            pass
        assert db.execute('SELECT COUNT(*) FROM audit_logs').fetchone()[0]==1
    db.close()
print('SCHEMA_0575_SQLITE_FIXTURE=PASS')
