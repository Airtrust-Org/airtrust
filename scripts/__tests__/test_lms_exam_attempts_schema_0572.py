#!/usr/bin/env python3
"""Offline Schema V2 integrity tests for 0572 (exam plans, bindings, attempts). No remote DB."""
import hashlib
import json
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
F = ROOT / 'worker-airtrust/schema-v2/changes/0572_lms_exam_attempts.sql'
P = ROOT / 'worker-airtrust/schema-v2/plans/lms-exam-attempts-0572.md'
M = ROOT / 'worker-airtrust/schema-v2/lms-exam-attempts-0572.json'
PKG = 'c' * 64
PLAN = 'd' * 64
FIXTURE = """
CREATE TABLE lms_cursos(id INTEGER, empresa_id INTEGER, deleted_at TEXT, PRIMARY KEY(empresa_id,id));
CREATE TABLE lms_scorm_package_versions(id TEXT PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
  package_sha256 TEXT, status TEXT);
CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
  matricula_id INTEGER, ciclo_atual INTEGER, status TEXT, deleted_at TEXT);
INSERT INTO lms_cursos(id,empresa_id) VALUES(26,6),(26,7);
INSERT INTO lms_scorm_package_versions VALUES('p1',6,26,'""" + PKG + """','VALIDATED'),
  ('p2',6,26,'""" + 'e' * 64 + """','REJECTED');
INSERT INTO lms_matricula_ciclos VALUES(1,6,26,10,1,'EM_ANDAMENTO',NULL),(2,7,26,11,1,'EM_ANDAMENTO',NULL);
"""


class Exam0572Tests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript(FIXTURE)
        self.db.executescript(F.read_text(encoding='utf-8'))
        self.db.execute("INSERT INTO lms_exam_plans VALUES(6,26,'exam1',1,'{}',?,'u1',datetime('now'))", (PLAN,))
        self.db.commit()

    def bind(self, pkg=PKG, statutory=1):
        self.db.execute(
            "INSERT INTO lms_exam_edition_bindings(id,empresa_id,curso_id,package_sha256,exam_id,"
            "exam_version,plan_sha256,statutory_assessment_required,approver_id,approval_note) "
            "VALUES('bind-0123456789abcdef',6,26,?, 'exam1',1,?,?,77,'Aprovado após revisão editorial')",
            (pkg, PLAN, statutory))

    def attempt(self, key='idem-0001', no=1, aid='att-0123456789abcdef', ciclo=1):
        self.db.execute(
            "INSERT INTO lms_exam_attempts(id,empresa_id,curso_id,matricula_id,ciclo_id,attempt_no,"
            "package_sha256,exam_id,exam_version,plan_sha256,idempotency_key,started_by) "
            "VALUES(?,6,26,10,?,?,?, 'exam1',1,?,?,5)", (aid, ciclo, no, PKG, PLAN, key))

    def submit(self, aid, passed):
        self.db.execute(
            "UPDATE lms_exam_attempts SET state='SUBMITTED',submitted_at=datetime('now'),"
            "passed=?,result_json='{}' WHERE id=?", (passed, aid))

    def abort(self, code, fn):
        with self.assertRaises(sqlite3.DatabaseError) as ctx:
            fn()
        self.assertIn(code, str(ctx.exception))

    def test_plan_is_tenant_scoped_and_immutable(self):
        self.abort('LMS_EXAM_PLAN_COURSE_TENANT_MISMATCH', lambda: self.db.execute(
            "INSERT INTO lms_exam_plans VALUES(8,26,'exam1',1,'{}',?,'u1',datetime('now'))", (PLAN,)))
        self.abort('LMS_EXAM_PLAN_IMMUTABLE', lambda: self.db.execute("UPDATE lms_exam_plans SET plan_json='{}'"))
        self.abort('LMS_EXAM_PLAN_IMMUTABLE', lambda: self.db.execute("DELETE FROM lms_exam_plans"))

    def test_binding_needs_classified_statutory_flag_and_valid_package(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.bind(statutory=None)
        self.abort('LMS_EXAM_BINDING_PACKAGE_SCOPE_MISMATCH', lambda: self.bind(pkg='f' * 64))
        self.abort('LMS_EXAM_BINDING_PACKAGE_SCOPE_MISMATCH', lambda: self.bind(pkg='e' * 64))
        self.bind()
        with self.assertRaises(sqlite3.IntegrityError):
            self.bind()
        self.abort('LMS_EXAM_BINDING_IMMUTABLE', lambda: self.db.execute(
            "UPDATE lms_exam_edition_bindings SET statutory_assessment_required=0"))
        self.abort('LMS_EXAM_BINDING_IMMUTABLE', lambda: self.db.execute("DELETE FROM lms_exam_edition_bindings"))

    def test_attempt_requires_binding_and_cycle_scope(self):
        self.abort('LMS_EXAM_ATTEMPT_BINDING_MISMATCH', self.attempt)
        self.bind()
        self.abort('LMS_EXAM_ATTEMPT_CYCLE_SCOPE_MISMATCH', lambda: self.attempt(ciclo=2))
        self.attempt()

    def test_numbering_open_uniqueness_and_retry_after_fail(self):
        self.bind()
        self.attempt()
        self.abort('LMS_EXAM_ATTEMPT_NUMBER_INVALID', lambda: self.attempt(key='idem-0002', no=3, aid='att-b123456789abcdef'))
        with self.assertRaises(sqlite3.IntegrityError):
            self.attempt(key='idem-0002', no=2, aid='att-b123456789abcdef')
        self.submit('att-0123456789abcdef', 0)
        self.attempt(key='idem-0002', no=2, aid='att-b123456789abcdef')

    def test_pass_is_sealed_unique_and_blocks_new_attempts(self):
        self.bind()
        self.attempt()
        self.submit('att-0123456789abcdef', 1)
        self.abort('LMS_EXAM_ATTEMPT_SEALED', lambda: self.submit('att-0123456789abcdef', 0))
        self.abort('LMS_EXAM_ALREADY_PASSED', lambda: self.attempt(key='idem-0002', no=2, aid='att-b123456789abcdef'))
        self.abort('LMS_EXAM_ATTEMPT_DELETE_FORBIDDEN', lambda: self.db.execute("DELETE FROM lms_exam_attempts"))

    def test_attempt_identity_and_submit_shape(self):
        self.bind()
        self.attempt()
        self.abort('LMS_EXAM_ATTEMPT_INVALID_TRANSITION', lambda: self.db.execute(
            "UPDATE lms_exam_attempts SET plan_sha256=?", ('a' * 64,)))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_exam_attempts SET state='SUBMITTED'")

    def test_responses_only_while_open(self):
        self.bind()
        self.attempt()
        ins = ("INSERT INTO lms_exam_attempt_responses(attempt_id,empresa_id,question_key,choice_id) "
               "VALUES('att-0123456789abcdef',6,'q1',?) ON CONFLICT(attempt_id,question_key) "
               "DO UPDATE SET choice_id=excluded.choice_id,answered_at=datetime('now')")
        self.db.execute(ins, ('o1',))
        self.db.execute(ins, ('o2',))
        self.assertEqual(self.db.execute("SELECT choice_id FROM lms_exam_attempt_responses").fetchone()[0], 'o2')
        self.abort('LMS_EXAM_RESPONSE_DELETE_FORBIDDEN', lambda: self.db.execute("DELETE FROM lms_exam_attempt_responses"))
        self.submit('att-0123456789abcdef', 0)
        self.abort('LMS_EXAM_RESPONSE_ATTEMPT_NOT_OPEN', lambda: self.db.execute(ins, ('o1',)))
        self.abort('LMS_EXAM_RESPONSE_ATTEMPT_NOT_OPEN', lambda: self.db.execute(
            "INSERT INTO lms_exam_attempt_responses(attempt_id,empresa_id,question_key,choice_id) "
            "VALUES('att-0123456789abcdef',6,'q2','o1')"))

    def test_manifest_hashes_and_plain_additive_sql(self):
        m = json.loads(M.read_text(encoding='utf-8'))
        self.assertEqual(m['changeId'], 'lms-exam-attempts-0572')
        self.assertEqual(m['fileHash'], hashlib.sha256(F.read_bytes()).hexdigest())
        self.assertEqual(m['planHash'], hashlib.sha256(P.read_bytes()).hexdigest())
        self.assertEqual(ROOT / m['filePath'], F)
        self.assertEqual(ROOT / m['planPath'], P)
        sql = F.read_text(encoding='utf-8')
        for forbidden in ('IF NOT EXISTS', 'PRAGMA', 'DROP ', 'DELETE FROM', 'ALTER TABLE'):
            self.assertNotIn(forbidden, sql)
        self.assertEqual(sql.count('CREATE TABLE'), 4)
        self.assertEqual(sql.count('INDEX'), 3)
        self.assertEqual(sql.count('CREATE TRIGGER'), 12)


if __name__ == '__main__':
    unittest.main()
