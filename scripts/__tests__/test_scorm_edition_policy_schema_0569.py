#!/usr/bin/env python3
"""Offline Schema V2 integrity tests for 0569. No Cloudflare access or user data."""
import hashlib
import json
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
F = ROOT/'worker-airtrust/schema-v2/changes/0569_lms_scorm_edition_policy_approvals.sql'
P = ROOT/'worker-airtrust/schema-v2/plans/lms-scorm-edition-policy-approvals-0569.md'
M = ROOT/'worker-airtrust/schema-v2/lms-scorm-edition-policy-approvals-0569.json'
PKG = '123e4567-e89b-42d3-a456-426614174001'
SHA = 'c'*64
FIXTURE = """
CREATE TABLE lms_cursos(id INTEGER,empresa_id INTEGER,tipo_conteudo TEXT,deleted_at TEXT,
  scorm_assessment_policy TEXT NOT NULL DEFAULT 'SCORED',PRIMARY KEY(empresa_id,id));
CREATE TABLE lms_scorm_package_versions(id TEXT PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,
  package_sha256 TEXT,status TEXT);
CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,
  matricula_id INTEGER,ciclo_atual INTEGER,status TEXT,deleted_at TEXT);
INSERT INTO lms_cursos(id,empresa_id,tipo_conteudo) VALUES(26,6,'scorm'),(26,7,'scorm'),(27,6,'h5p');
INSERT INTO lms_scorm_package_versions VALUES('"""+PKG+"""',6,26,'"""+SHA+"""','VALIDATED');
INSERT INTO lms_matricula_ciclos VALUES(1,6,26,10,1,'CONCLUIDO',NULL),(2,6,26,11,1,'NAO_INICIADO',NULL);
"""
APPROVAL = ['appr-0123456789abcdef',6,26,PKG,SHA,'FORMATIVE_NO_EXAM_V1','a'*64,
            'review-ref-001',77,'Aprovado após revisão editorial']
COLS = ['id','empresa_id','curso_id','package_id','package_sha256','certification_profile',
        'attestation_sha256','editorial_review_ref','approver_id','approval_note']

class Policy0569Tests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript(FIXTURE)
        self.db.executescript(F.read_text())
    def tearDown(self): self.db.close()
    def approve(self, **kw):
        data = dict(zip(COLS, APPROVAL)); data.update(kw)
        self.db.execute('INSERT INTO lms_scorm_package_approvals ('+','.join(COLS)+') VALUES ('+
                        ','.join('?' for _ in COLS)+')', [data[c] for c in COLS])
    def stamp(self, **kw):
        self.db.execute("UPDATE lms_scorm_package_versions SET assessment_policy='FORMATIVE',"
                        "certification_profile='FORMATIVE_NO_EXAM_V1' WHERE id=?", (PKG,))

    def test_manifest_hashes_match_files(self):
        m = json.loads(M.read_text())
        self.assertEqual(m['changeId'], 'lms-scorm-edition-policy-approvals-0569')
        self.assertEqual(m['fileHash'], hashlib.sha256(F.read_bytes()).hexdigest())
        self.assertEqual(m['planHash'], hashlib.sha256(P.read_bytes()).hexdigest())
        self.assertTrue((ROOT/m['filePath']).exists() and (ROOT/m['planPath']).exists())

    def test_migration_has_no_data_mutation(self):
        sql = F.read_text().upper()
        for forbidden in ('INSERT INTO LMS_MATRICULAS', 'UPDATE LMS_MATRICULAS',
                          'UPDATE LMS_CURSOS', 'DELETE FROM', 'DROP '):
            self.assertNotIn(forbidden, sql)
        self.assertEqual(self.db.execute(
            'SELECT COUNT(*) FROM lms_matricula_ciclos WHERE assessment_policy IS NOT NULL').fetchone()[0], 0)
        self.assertEqual(self.db.execute(
            'SELECT COUNT(*) FROM lms_scorm_package_approvals').fetchone()[0], 0)

    def test_policy_values_are_constrained(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_scorm_package_versions SET assessment_policy='NONE'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_matricula_ciclos SET assessment_policy='OTHER' WHERE id=1")

    def test_profile_requires_formative_policy_on_insert(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO lms_scorm_package_versions"
                            "(id,empresa_id,curso_id,package_sha256,status,assessment_policy,certification_profile)"
                            " VALUES('p2',6,26,?, 'VALIDATED','SCORED','FORMATIVE_NO_EXAM_V1')", ('d'*64,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO lms_scorm_package_versions"
                            "(id,empresa_id,curso_id,package_sha256,status,certification_profile)"
                            " VALUES('p3',6,26,?, 'VALIDATED','FORMATIVE_NO_EXAM_V1')", ('e'*64,))
        self.db.execute("INSERT INTO lms_scorm_package_versions"
                        "(id,empresa_id,curso_id,package_sha256,status,assessment_policy,certification_profile)"
                        " VALUES('p4',6,26,?, 'VALIDATED','FORMATIVE','FORMATIVE_NO_EXAM_V1')", ('f'*64,))

    def test_edition_policy_is_write_once(self):
        self.db.execute("UPDATE lms_scorm_package_versions SET assessment_policy='SCORED' WHERE id=?", (PKG,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_scorm_package_versions SET assessment_policy='FORMATIVE' WHERE id=?", (PKG,))

    def test_cycle_policy_is_write_once_and_freeze_is_allowed_once(self):
        self.db.execute("UPDATE lms_matricula_ciclos SET assessment_policy='SCORED' WHERE id=1")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_matricula_ciclos SET assessment_policy='FORMATIVE' WHERE id=1")
        # An unrelated update of the same row (status/progress) must stay possible.
        self.db.execute("UPDATE lms_matricula_ciclos SET status='CONCLUIDO' WHERE id=1")
        self.assertEqual(self.db.execute(
            'SELECT assessment_policy FROM lms_matricula_ciclos WHERE id=2').fetchone()[0], None)

    def test_approval_requires_validated_same_scope_package_with_profile(self):
        with self.assertRaises(sqlite3.IntegrityError): self.approve()     # edition has no profile yet
        self.stamp()
        for change in ({'empresa_id':7},{'curso_id':27},{'package_sha256':'0'*64},
                       {'approval_note':'curta'},{'attestation_sha256':'z'*64},
                       {'approver_id':0},{'editorial_review_ref':'x'}):
            with self.subTest(change=change):
                with self.assertRaises(sqlite3.IntegrityError): self.approve(**change)
        self.approve()
        with self.assertRaises(sqlite3.IntegrityError): self.approve(id='appr-0123456789abcde0')  # duplicate

    def test_approval_not_allowed_for_active_or_deleted_course(self):
        self.stamp()
        self.db.execute("UPDATE lms_scorm_package_versions SET status='ACTIVE'")
        with self.assertRaises(sqlite3.IntegrityError): self.approve()
        self.db.execute("UPDATE lms_scorm_package_versions SET status='VALIDATED'")
        self.db.execute("UPDATE lms_cursos SET deleted_at='2026-10-28' WHERE empresa_id=6 AND id=26")
        with self.assertRaises(sqlite3.IntegrityError): self.approve()

    def test_approval_is_append_only(self):
        self.stamp(); self.approve()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_scorm_package_approvals SET approval_note='alterada depois da aprovação'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('DELETE FROM lms_scorm_package_approvals')

    def test_expected_objects_exist(self):
        names = {r[0] for r in self.db.execute(
            "SELECT name FROM sqlite_master WHERE type IN ('table','index','trigger')")}
        for n in ('lms_scorm_package_approvals','idx_lms_scorm_approvals_scope',
                  'trg_lms_scorm_edition_profile_consistent','trg_lms_scorm_edition_policy_immutable',
                  'trg_lms_ciclo_policy_immutable','trg_lms_scorm_approval_scope',
                  'trg_lms_scorm_approval_no_update','trg_lms_scorm_approval_no_delete'):
            self.assertIn(n, names)

if __name__ == '__main__':
    unittest.main()
