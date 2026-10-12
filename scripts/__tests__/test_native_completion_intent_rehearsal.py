"""OFFLINE ONLY — Native completion-intent Schema V2 review concept.

Reuses the real versioned 0550 and the two review-only 0551/0552 candidates
in SQLite memory. Does not touch D1, R2, users, certificates or production.
"""
import sqlite3
import unittest
from pathlib import Path
from scripts.__tests__.test_native_atomic_enrollment_pinning_rehearsal import fixture,provision,HASH
from scripts.__tests__.test_native_atomic_terminal_state_guard import sql_from_source

ROOT=Path(__file__).resolve().parents[2]
CANDIDATE=ROOT/'worker-airtrust/schema-v2/plans/lms-native-canonical-completion-0552.REVIEW-ONLY.sql.txt'
NONCE='d'*64

def setup():
    db=fixture()
    db.executescript(CANDIDATE.read_text(encoding='utf8'))
    m,cy,b=provision(db)
    db.execute("UPDATE lms_matriculas SET status='EM_ANDAMENTO' WHERE id=?",(m,))
    db.execute("UPDATE lms_matricula_ciclos SET status='EM_ANDAMENTO' WHERE id=?",(cy,))
    db.execute("""INSERT INTO lms_native_eventos(
      vinculo_id,event_id,sequencia,unidade_id,payload_sha256
    ) VALUES(?,'lesson-visit',1,'lesson-1',?)""",(b,HASH))
    att=db.execute("""INSERT INTO lms_native_tentativas(
      vinculo_id,tentativa_numero,answers_json,answers_sha256,policy,
      score_pct,assessment_satisfied
    ) VALUES(?,1,'[]',?,'SCORED',85,1)""",(b,HASH)).lastrowid
    db.commit()
    return db,m,cy,b,att

def intent(db,m,cy,b,att,nonce=NONCE,actor=900,employee=69,
           tenant=6,answer_sha=HASH,score=85,qualification=False):
    db.execute("""INSERT INTO lms_native_completion_intents(
      nonce,empresa_id,curso_id,matricula_id,ciclo_id,funcionario_id,
      actor_user_id,edicao_id,vinculo_id,tentativa_id,tentativa_numero,
      answers_sha256,score_pct,event_count,distinct_lesson_count,
      gerar_qualificacao,qualificacao_tipo_id,qualificacao_categoria_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (nonce,tenant,10,m,cy,employee,actor,1,b,att,1,answer_sha,score,1,1,
     1 if qualification else 0,44 if qualification else None,
     45 if qualification else None))

def assert_guard(db,m,cy,b,att):
    values=[900,m,6,10,69,cy,b,1,HASH,att,1,HASH,85,1,1,0,0,0,0]
    assert db.execute(sql_from_source(),values).fetchone()[0]=='null'

def complete(db,m,cy):
    db.execute("""UPDATE lms_matriculas SET status='CONCLUIDO',
      progresso_pct=100,data_conclusao='2026-10-12' WHERE id=?""",(m,))
    db.execute("""UPDATE lms_matricula_ciclos SET status='CONCLUIDO',
      progresso_pct=100,data_conclusao='2026-10-12' WHERE id=?""",(cy,))

class NativeCompletionIntentReviewTests(unittest.TestCase):
    def test_valid_one_transaction_intent_consumption_unlocks_both_terminal_rows(self):
        db,m,cy,b,att=setup()
        try:
            with db:
                db.execute('BEGIN IMMEDIATE')
                assert_guard(db,m,cy,b,att)
                intent(db,m,cy,b,att)
                complete(db,m,cy)
                db.execute('DELETE FROM lms_native_completion_intents WHERE nonce=?',(NONCE,))
            self.assertEqual(db.execute('SELECT status FROM lms_matriculas WHERE id=?',(m,)
                                        ).fetchone()[0],'CONCLUIDO')
            self.assertEqual(db.execute('SELECT status FROM lms_matricula_ciclos WHERE id=?',(cy,)
                                        ).fetchone()[0],'CONCLUIDO')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM lms_native_completion_intents'
                                        ).fetchone()[0],0)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        finally: db.close()

    def test_no_intent_never_allows_legacy_completion(self):
        db,m,cy,b,att=setup()
        try:
            for sql in (
                "UPDATE lms_matriculas SET status='CONCLUIDO' WHERE id=?",
                "UPDATE lms_matricula_ciclos SET status='CONCLUIDO' WHERE id=?",
            ):
                with self.assertRaisesRegex(sqlite3.IntegrityError,
                                            'NATIVE_CATALOG_COMPLETION_NOT_GOVERNED'):
                    db.execute(sql,(m if 'lms_matriculas ' in sql else cy,))
            self.assertEqual(db.execute('SELECT status FROM lms_matriculas WHERE id=?',(m,)
                                        ).fetchone()[0],'EM_ANDAMENTO')
        finally: db.close()

    def test_unconsumed_intent_causes_commit_rollback_of_all_terminal_writes(self):
        db,m,cy,b,att=setup()
        try:
            with self.assertRaises(sqlite3.IntegrityError):
                with db:
                    db.execute('BEGIN IMMEDIATE')
                    assert_guard(db,m,cy,b,att)
                    intent(db,m,cy,b,att)
                    complete(db,m,cy)
                    # Missing DELETE must violate the deferred sentinel FK.
            self.assertEqual(db.execute('SELECT COUNT(*) FROM lms_native_completion_intents'
                                        ).fetchone()[0],0)
            self.assertEqual(db.execute('SELECT status FROM lms_matriculas WHERE id=?',(m,)
                                        ).fetchone()[0],'EM_ANDAMENTO')
            self.assertEqual(db.execute('SELECT status FROM lms_matricula_ciclos WHERE id=?',(cy,)
                                        ).fetchone()[0],'EM_ANDAMENTO')
        finally: db.close()

    def test_forged_user_employee_tenant_and_stale_grade_intent_denied(self):
        for changes in ({'actor':901},{'employee':70},{'tenant':7},
                        {'answer_sha':'b'*64},{'score':0}):
            with self.subTest(changes=changes):
                db,m,cy,b,att=setup()
                try:
                    with self.assertRaisesRegex(sqlite3.IntegrityError,
                                                'NATIVE_TERMINAL_INTENT_SCOPE_DENIED'):
                        intent(db,m,cy,b,att,**changes)
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM lms_native_completion_intents'
                                                ).fetchone()[0],0)
                    self.assertEqual(db.execute('SELECT status FROM lms_matriculas WHERE id=?',(m,)
                                                ).fetchone()[0],'EM_ANDAMENTO')
                finally: db.close()

    def test_intent_cannot_be_modified_and_nonce_format_is_validated(self):
        db,m,cy,b,att=setup()
        try:
            with self.assertRaises(sqlite3.IntegrityError):
                intent(db,m,cy,b,att,nonce='not-a-valid-nonce')
            # A rejected statement can leave an implicit SQLite transaction
            # open; the next independent test case needs an explicit rollback.
            db.rollback()
            db.execute('BEGIN IMMEDIATE')
            intent(db,m,cy,b,att)
            with self.assertRaisesRegex(sqlite3.IntegrityError,'NATIVE_TERMINAL_INTENT_IMMUTABLE'):
                db.execute("UPDATE lms_native_completion_intents SET curso_id=11 WHERE nonce=?",
                           (NONCE,))
            db.execute("DELETE FROM lms_native_completion_intents WHERE nonce=?",(NONCE,))
            db.commit()
        finally: db.close()

    def test_stale_after_newer_failed_attempt_intent_denied(self):
        db,m,cy,b,att=setup()
        try:
            db.execute("""INSERT INTO lms_native_tentativas(
              vinculo_id,tentativa_numero,answers_json,answers_sha256,policy,
              score_pct,assessment_satisfied
            ) VALUES(?,2,'[]',?,'SCORED',10,0)""",(b,HASH))
            with self.assertRaisesRegex(sqlite3.IntegrityError,
                                        'NATIVE_TERMINAL_INTENT_SCOPE_DENIED'):
                intent(db,m,cy,b,att)
        finally: db.close()

    def test_qualification_category_must_remain_integrated_inside_intent(self):
        db,m,cy,b,att=setup()
        try:
            db.execute("""UPDATE lms_cursos
              SET gerar_qualificacao_ao_concluir=1,qualificacao_tipo_id=44
              WHERE id=10""")
            db.execute("UPDATE qualificacoes_categorias SET lms_integrada=0 WHERE id=45")
            with self.assertRaisesRegex(sqlite3.IntegrityError,
                                        'NATIVE_TERMINAL_INTENT_SCOPE_DENIED'):
                intent(db,m,cy,b,att,qualification=True)
            db.rollback()
            # A fresh, valid transaction proves the integrated path still
            # works; no Native enrollment is concluded by this test.
            db.execute("UPDATE lms_cursos SET gerar_qualificacao_ao_concluir=1,qualificacao_tipo_id=44 WHERE id=10")
            db.execute("BEGIN") if not db.in_transaction else None
            intent(db,m,cy,b,att,qualification=True)
            db.execute('DELETE FROM lms_native_completion_intents WHERE nonce=?',(NONCE,))
            db.commit()
            self.assertEqual(db.execute('SELECT status FROM lms_matriculas WHERE id=?',
                                        (m,)).fetchone()[0],'EM_ANDAMENTO')
        finally: db.close()

    def test_second_apply_aborts_without_altering_existing_terminal_guards(self):
        db,m,cy,b,att=setup()
        try:
            before=db.execute("""SELECT sql FROM sqlite_master
              WHERE name='trg_native_catalog_no_ungoverned_matricula_completion_update'"""
                              ).fetchone()[0]
            with self.assertRaises(sqlite3.OperationalError):
                db.executescript(CANDIDATE.read_text(encoding='utf8'))
            self.assertEqual(db.execute("""SELECT sql FROM sqlite_master
              WHERE name='trg_native_catalog_no_ungoverned_matricula_completion_update'"""
                                ).fetchone()[0],before)
        finally: db.close()

if __name__=='__main__':
    unittest.main()
