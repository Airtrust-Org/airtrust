#!/usr/bin/env python3
# source_reference: issue #1376 tenant-6 synthetic 96 cancellation event, never remote D1.
# operational_decision: restore 81 required, leave 5 completed and 10 nonrequired cancellations.
# dry_run_required: synthetic SQLite positive and negative SQL execution only.
# rollback_plan_required: official production workflow requires Time Travel and reviewed hashes.
import json
import sqlite3
import sys

sql = sys.stdin.read()
assert "COMPLIANCE_81_RESTORE_PREFLIGHT_CHANGED" in sql

def fixture():
    d = sqlite3.connect(":memory:")
    d.executescript("""
      CREATE TABLE audit_logs (
        user_id INTEGER,action TEXT,entity_type TEXT,entity_id TEXT,
        old_values TEXT,new_values TEXT,empresa_id INTEGER,created_at TEXT);
      CREATE TABLE lms_matriculas (
        id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER,
        curso_id INTEGER,status TEXT,deleted_at TEXT,updated_at TEXT);
      CREATE TABLE lms_cursos (
        id INTEGER PRIMARY KEY,empresa_id INTEGER,qualificacao_tipo_id INTEGER);
      CREATE TABLE qualificacoes_tipos(
        id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT);
      CREATE TABLE funcionarios(
        id INTEGER PRIMARY KEY,empresa_id INTEGER,funcao_id INTEGER,
        setor_id INTEGER,deleted_at TEXT,ativo INTEGER,status TEXT);
      CREATE TABLE funcoes(id INTEGER PRIMARY KEY,empresa_id INTEGER,nome TEXT);
      CREATE TABLE treinamento_requisitos(
        empresa_id INTEGER,qualificacao_tipo_id INTEGER,funcao_id INTEGER,
        obrigatoriedade TEXT,ativo INTEGER,deleted_at TEXT,escopo TEXT,setor_id INTEGER);
      CREATE TABLE lms_matricula_ciclos(
        matricula_id INTEGER,empresa_id INTEGER,ciclo_atual INTEGER,
        deleted_at TEXT,status TEXT,updated_at TEXT);
      INSERT INTO funcoes VALUES (17,6,'Comandante'),(5,6,'Mecânico');
      INSERT INTO qualificacoes_tipos VALUES
        (1,6,'FDM-TRIPULACAO'),(2,6,'MNT_MCQ'),(3,6,'MNT_MGM'),
        (4,6,'MNT_MOM'),(5,6,'FDM_GATE'),(6,6,'NR-26');
      INSERT INTO lms_cursos VALUES
        (1,6,1),(2,6,2),(3,6,3),(4,6,4),(5,6,5),(6,6,6);
      INSERT INTO treinamento_requisitos VALUES
        (6,1,17,'OBRIGATORIA',1,NULL,'FUNCAO',NULL),
        (6,2,5,'OBRIGATORIA',1,NULL,'FUNCAO',NULL),
        (6,3,5,'OBRIGATORIA',1,NULL,'SETOR_FUNCAO',11),
        (6,4,5,'OBRIGATORIA',1,NULL,'SETOR_FUNCAO',11);
    """)
    course_counts=[
       (1,9,1,1,17),(2,18,0,5,5),(3,18,0,5,5),
       (4,20,0,4,5),(5,2,0,0,17),(6,3,0,10,17)
    ]
    mid=0
    for course, completed, progress, unstarted, func in course_counts:
        for original, count in [
            ('CONCLUIDO', completed),
            ('EM_ANDAMENTO', progress),
            ('NAO_INICIADO', unstarted),
        ]:
            for _ in range(count):
                mid+=1
                d.execute(
                    'INSERT INTO funcionarios VALUES (?,6,?,11,NULL,1,?)',
                    (mid,func,'ATIVO'))
                d.execute(
                    "INSERT INTO lms_matriculas (id,empresa_id,funcionario_id,curso_id,status) VALUES (?,6,?,?,'CANCELADO')",
                    (mid,mid,course))
                d.execute(
                    "INSERT INTO lms_matricula_ciclos VALUES (?,6,1,NULL,'CANCELADO',NULL)",
                    (mid,))
                d.execute(
                    "INSERT INTO audit_logs VALUES (NULL,'LMS_MATRICULA_COMPLIANCE_MATRIX_REPAIR','lms_matriculas',?,?,NULL,6,'2026-10-10 19:10:05')",
                    (str(mid),json.dumps({'status':original})))
    d.commit()
    assert mid==96
    return d

db=fixture()
db.executescript(sql)
summary=db.execute("""
  SELECT
   (SELECT COUNT(*) FROM lms_matriculas WHERE status='CONCLUIDO'),
   (SELECT COUNT(*) FROM lms_matriculas WHERE status='EM_ANDAMENTO'),
   (SELECT COUNT(*) FROM lms_matriculas WHERE status='NAO_INICIADO'),
   (SELECT COUNT(*) FROM lms_matriculas WHERE status='CANCELADO'),
   (SELECT COUNT(*) FROM audit_logs WHERE action='LMS_MATRICULA_RESTAURADA_20261010')
""").fetchone()
assert summary==(65,1,15,15,81),summary
print("POSITIVE:81-original-matriculas-and-cycles-restored")

for variant in ['altered_cycle','concurrent_audit']:
    db=fixture()
    if variant=='altered_cycle':
        db.execute(
            "UPDATE lms_matricula_ciclos SET status='NAO_INICIADO' WHERE matricula_id=1")
    else:
        db.execute(
            "INSERT INTO audit_logs VALUES(NULL,'UNEXPECTED','lms_matriculas','1',NULL,NULL,6,'2026-10-10 20:00:00')")
    db.commit()
    try:
        db.executescript(sql)
    except sqlite3.OperationalError as e:
        assert 'malformed JSON' in str(e),str(e)
    else:
        raise AssertionError('preflight should reject '+variant)
    remaining=db.execute(
        "SELECT COUNT(*) FROM audit_logs WHERE action='LMS_MATRICULA_RESTAURADA_20261010'").fetchone()[0]
    assert remaining==0
    print("NEGATIVE:"+variant+":PASS")
