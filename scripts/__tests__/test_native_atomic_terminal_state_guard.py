"""Offline execution of the EXACT Native terminal guard SQL from TypeScript.

This is NOT a completion writer; intentionally never writes CONCLUIDO.
Checks the failure conditions needed for the future D1.batch-based writer.
"""
import ast
import re
import sqlite3
import unittest
from pathlib import Path
from scripts.__tests__.test_native_atomic_enrollment_pinning_rehearsal import fixture, provision, HASH

ROOT=Path(__file__).resolve().parents[2]
GUARD=ROOT/'worker-airtrust/src/services/lms-native-terminal-transaction-guard.ts'

def sql_from_source():
    source=GUARD.read_text(encoding='utf8')
    match=re.search(r"const SQL=\[(.*?)\]\.join\(' '\);",source,re.S)
    if not match:
        raise AssertionError('NATIVE_TERMINAL_SQL_SOURCE_DRIFT')
    literals=[line.strip().rstrip(',') for line in match.group(1).splitlines() if line.strip()]
    return ' '.join(ast.literal_eval(item) for item in literals)


class NativeAtomicTerminalGuardTests(unittest.TestCase):
    def setUp(self):
        self.db=fixture()
        self.matricula,self.ciclo,self.binding=provision(self.db)
        self.db.execute("UPDATE lms_matriculas SET status='EM_ANDAMENTO' WHERE id=?",
                        (self.matricula,))
        self.db.execute("UPDATE lms_matricula_ciclos SET status='EM_ANDAMENTO' WHERE id=?",
                        (self.ciclo,))
        self.db.execute("""INSERT INTO lms_native_eventos(
          vinculo_id,event_id,sequencia,unidade_id,payload_sha256
        ) VALUES(?,'lesson-visit-001',1,'lesson-1',?)""",(self.binding,HASH))
        self.attempt=self.db.execute("""INSERT INTO lms_native_tentativas(
          vinculo_id,tentativa_numero,answers_json,answers_sha256,policy,
          score_pct,assessment_satisfied
        ) VALUES(?,1,'[]',?,'SCORED',80,1)""",(self.binding,HASH)).lastrowid
        self.db.commit()
        self.sql=sql_from_source()
        self.params=[900,self.matricula,6,10,69,self.ciclo,self.binding,1,HASH,
                     self.attempt,1,HASH,80,1,1,0,0,0,0]

    def tearDown(self):
        self.db.close()

    def permitted(self):
        return self.db.execute(self.sql,self.params).fetchone()[0]

    def denied(self):
        with self.assertRaisesRegex(sqlite3.OperationalError,'malformed JSON'):
            self.permitted()

    def test_unchanged_pinned_native_snapshot_allows_assertion_but_never_completes(self):
        self.assertEqual(self.permitted(),'null')
        self.assertEqual(self.db.execute('SELECT status FROM lms_matriculas WHERE id=?',
                                        (self.matricula,)).fetchone()[0],'EM_ANDAMENTO')
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_formative_null_score_can_be_anchored_without_inventing_percent(self):
        db=fixture()
        try:
            matricula,ciclo,binding=provision(db,nonce='c'*64)
            db.execute("UPDATE lms_matriculas SET status='EM_ANDAMENTO' WHERE id=?",
                       (matricula,))
            db.execute("UPDATE lms_matricula_ciclos SET status='EM_ANDAMENTO' WHERE id=?",
                       (ciclo,))
            db.execute("""INSERT INTO lms_native_eventos(
              vinculo_id,event_id,sequencia,unidade_id,payload_sha256
            ) VALUES(?,'lesson-formative',1,'lesson-1',?)""",(binding,HASH))
            attempt=db.execute("""INSERT INTO lms_native_tentativas(
              vinculo_id,tentativa_numero,answers_json,answers_sha256,
              policy,score_pct,assessment_satisfied
            ) VALUES(?,1,'[]',?,'FORMATIVE',NULL,1)""",(binding,HASH)).lastrowid
            args=[900,matricula,6,10,69,ciclo,binding,1,HASH,
                  attempt,1,HASH,None,1,1,0,0,0,0]
            self.assertEqual(db.execute(sql_from_source(),args).fetchone()[0],'null')
            args[12]=100
            with self.assertRaisesRegex(sqlite3.OperationalError,'malformed JSON'):
                db.execute(sql_from_source(),args)
        finally:
            db.close()

    def test_revocation_or_tenant_change_invalidates_old_readiness(self):
        self.db.execute('UPDATE usuarios SET active=0 WHERE id=900')
        self.denied()
        self.db.execute('UPDATE usuarios SET active=1 WHERE id=900')
        self.db.execute("UPDATE funcionarios SET status='INATIVO' WHERE id=69")
        self.denied()
        self.db.execute("UPDATE funcionarios SET status='ATIVO' WHERE id=69")
        self.params[2]=7
        self.denied()

    def test_newer_failed_attempt_after_success_invalidates_old_grade(self):
        self.db.execute("""INSERT INTO lms_native_tentativas(
          vinculo_id,tentativa_numero,answers_json,answers_sha256,policy,
          score_pct,assessment_satisfied
        ) VALUES(?,2,'[]',?,'SCORED',20,0)""",(self.binding,HASH))
        self.denied()

    def test_new_lesson_event_after_readiness_invalidates_snapshot(self):
        self.db.execute("""INSERT INTO lms_native_eventos(
          vinculo_id,event_id,sequencia,unidade_id,payload_sha256
        ) VALUES(?,'lesson-visit-002',2,'lesson-2',?)""",(self.binding,HASH))
        self.denied()

    def test_edition_cycle_score_hash_and_binding_must_match_exact_snapshot(self):
        for index,replacement in ((5,self.ciclo+10),(6,self.binding+10),
                                  (8,'b'*64),(9,self.attempt+10),(11,'c'*64),
                                  (12,90),(13,2),(14,2)):
            with self.subTest(index=index):
                original=self.params[index]
                self.params[index]=replacement
                self.denied()
                self.params[index]=original

    def test_inactive_qualification_category_cannot_pass_terminal_assertion(self):
        self.db.execute("""UPDATE lms_cursos SET gerar_qualificacao_ao_concluir=1,
          qualificacao_tipo_id=44 WHERE id=10""")
        self.params[-4:]=[1,44,1,45]
        self.assertEqual(self.permitted(),'null')
        self.db.execute("UPDATE qualificacoes_categorias SET ativo=0 WHERE id=45")
        self.denied()
        self.db.execute("UPDATE qualificacoes_categorias SET ativo=1,lms_integrada=0 WHERE id=45")
        self.denied()
        self.db.execute("UPDATE qualificacoes_categorias SET lms_integrada=1 WHERE id=45")
        self.db.execute("UPDATE qualificacoes_tipos SET empresa_id=7 WHERE id=44")
        self.denied()

    def test_canonical_batch_cannot_leave_history_if_native_terminal_is_ungoverned(self):
        # Existing 0551 review candidate intentionally forbids CONCLUIDO.
        # Even with a READY + unchanged atomic assertion, the canonical
        # history/audit/status batch must roll back until a separate
        # governed completion-intent/recovery contract has been approved.
        self.db.execute("""
          CREATE TABLE qualificacoes_historico(
            id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,
            funcionario_id INTEGER NOT NULL,status TEXT)
        """)
        self.db.execute("""
          CREATE TABLE audit_logs(
            id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,
            action TEXT NOT NULL)
        """)
        self.db.commit()
        with self.assertRaisesRegex(sqlite3.IntegrityError,
                                     'NATIVE_CATALOG_COMPLETION_NOT_GOVERNED'):
            with self.db:
                self.db.execute('BEGIN IMMEDIATE')
                self.assertEqual(self.permitted(),'null')
                self.db.execute("""INSERT INTO qualificacoes_historico(
                    empresa_id,funcionario_id,status
                ) VALUES(6,69,'CONCLUIDA')""")
                self.db.execute("""UPDATE lms_matriculas
                    SET status='CONCLUIDO',progresso_pct=100,
                        data_conclusao='2026-10-12'
                    WHERE id=?""",(self.matricula,))
                self.db.execute("""INSERT INTO audit_logs(empresa_id,action)
                    VALUES(6,'LMS_NATIVE_CANONICAL_CONCLUIDA')""")
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM qualificacoes_historico'
                                          ).fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM audit_logs'
                                          ).fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT status FROM lms_matriculas WHERE id=?',
                                          (self.matricula,)).fetchone()[0],'EM_ANDAMENTO')
        self.assertEqual(self.db.execute('SELECT status FROM lms_matricula_ciclos WHERE id=?',
                                          (self.ciclo,)).fetchone()[0],'EM_ANDAMENTO')
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_status_or_conclusion_change_never_allows_stale_terminal_write(self):
        # The SQL gate itself must reject even if future migration allows
        # a separate reviewed completion intent for canonical terminal update.
        self.db.execute("UPDATE lms_matriculas SET status='NAO_INICIADO' WHERE id=?",
                        (self.matricula,))
        self.denied()
        self.db.execute("UPDATE lms_matriculas SET status='EM_ANDAMENTO' WHERE id=?",
                        (self.matricula,))
        self.db.execute("UPDATE lms_matricula_ciclos SET status='NAO_INICIADO' WHERE id=?",
                        (self.ciclo,))
        self.denied()

if __name__=='__main__':
    unittest.main()
