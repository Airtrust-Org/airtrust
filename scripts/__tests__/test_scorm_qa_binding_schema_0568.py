#!/usr/bin/env python3
"""Offline Schema V2 integrity tests. No Cloudflare access or user data."""
import hashlib
import json
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
F = ROOT/'worker-airtrust/schema-v2/changes/0568_lms_scorm_qa_evidence_bindings.sql'
P = ROOT/'worker-airtrust/schema-v2/plans/lms-scorm-qa-evidence-bindings-0568.md'
M = ROOT/'worker-airtrust/schema-v2/lms-scorm-qa-evidence-bindings-0568.json'
FIXTURE = """
CREATE TABLE lms_cursos(id INTEGER PRIMARY KEY,empresa_id INTEGER,scorm_package_r2_prefix TEXT,deleted_at TEXT);
CREATE TABLE lms_scorm_package_versions(id TEXT PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,package_sha256 TEXT,status TEXT,r2_prefix TEXT);
CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,deleted_at TEXT);
CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,matricula_id INTEGER,ciclo_atual INTEGER,deleted_at TEXT);
INSERT INTO lms_cursos VALUES(15,997,'active/',NULL),(16,998,'other/',NULL);
INSERT INTO lms_scorm_package_versions VALUES('123e4567-e89b-42d3-a456-426614174001',997,15,
'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','VALIDATED','candidate/');
INSERT INTO lms_matriculas VALUES(88,997,15,NULL),(89,998,16,NULL);
INSERT INTO lms_matricula_ciclos VALUES(555,997,15,88,1,NULL),(556,998,16,89,1,NULL);
"""
COLUMNS=['id','empresa_id','curso_id','package_id','package_sha256','matricula_id','ciclo_id',
         'staging_runtime_sha','approval_receipt_sha256','run_id','expires_at']
BASE=['binding-a',997,15,'123e4567-e89b-42d3-a456-426614174001','c'*64,88,555,
      'b'*40,'f'*64,'123e4567-e89b-42d3-a456-426614174099','2999-01-01 00:00:00']

class BindingTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript(FIXTURE)
        self.db.executescript(F.read_text())
    def tearDown(self): self.db.close()
    def insert(self,**kw):
        data=dict(zip(COLUMNS,BASE));data.update(kw)
        self.db.execute('INSERT INTO lms_scorm_qa_evidence_bindings ('+','.join(COLUMNS)+
          ') VALUES ('+','.join('?' for _ in COLUMNS)+')',[data[x] for x in COLUMNS])
    def test_tenant_course_cycle_and_sha(self):
        for change in ({'empresa_id':998},{'curso_id':16},{'matricula_id':89},
                       {'ciclo_id':556},{'package_sha256':'0'*64},
                       {'expires_at':'2000-01-01 00:00:00'}):
            with self.subTest(change=change):
                with self.assertRaises(sqlite3.IntegrityError):self.insert(**change)
        self.insert()
    def test_no_reused_active_enrollment(self):
        self.insert()
        with self.assertRaises(sqlite3.IntegrityError):self.insert(id='binding-b',run_id='123e4567-e89b-42d3-a456-426614174098')
    def test_never_bind_active_package(self):
        self.db.execute("UPDATE lms_scorm_package_versions SET status='ACTIVE'")
        with self.assertRaises(sqlite3.IntegrityError):self.insert()
    def test_commit_requires_proven_launch(self):
        self.insert()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_scorm_qa_evidence_bindings SET last_committed_package_sha256=?",
                            ('c'*64,))
        self.db.execute("UPDATE lms_scorm_qa_evidence_bindings SET launched_package_sha256=?",
                        ('c'*64,))
        self.db.execute("UPDATE lms_scorm_qa_evidence_bindings SET last_committed_package_sha256=?",
                        ('c'*64,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_scorm_qa_evidence_bindings SET launched_package_sha256=NULL")
    def test_no_cross_tenant_mutation_or_reactivation(self):
        self.insert()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_scorm_qa_evidence_bindings SET empresa_id=998")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM lms_scorm_qa_evidence_bindings")
        self.db.execute("UPDATE lms_scorm_qa_evidence_bindings SET status='REVOKED'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_scorm_qa_evidence_bindings SET status='ACTIVE'")
    def test_reject_non_hex_hashes_and_malformed_run_uuid(self):
        for invalid in (
            {'package_sha256':'G'*64},
            {'package_sha256':'C'*64},
            {'staging_runtime_sha':'-'*40},
            {'approval_receipt_sha256':'x'*64},
            {'run_id':'not-a-uuid'},
            {'run_id':'123e4567-e89b-42d3-a456-42661417409-'},
            {'run_id':'123e4567-e89b-42d3-a456-42661417409g'},
        ):
            with self.subTest(invalid=invalid):
                with self.assertRaises(sqlite3.IntegrityError):self.insert(**invalid)
        self.insert()

    def test_reject_invalid_witness_hex(self):
        self.insert()
        for witness in ('launched_package_sha256','last_committed_package_sha256'):
            with self.subTest(witness=witness):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.db.execute('UPDATE lms_scorm_qa_evidence_bindings SET '+witness+'=?',
                                    ('x'*64,))
        self.assertEqual(self.db.execute(
            'SELECT launched_package_sha256,last_committed_package_sha256 '
            'FROM lms_scorm_qa_evidence_bindings'
        ).fetchone(), (None,None))

    def test_iso_expiry_fails_closed(self):
        # A past ISO UTC timestamp compares lexically *after* a newer
        # SQLite space-separated datetime. The trigger must compare real dates.
        for expires in (
            '2000-01-01T00:00:00Z',
            'not-an-expiry',
            self.db.execute("SELECT strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 minute')").fetchone()[0],
        ):
            with self.subTest(expires=expires):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.insert(expires_at=expires)
        valid=self.db.execute(
            "SELECT strftime('%Y-%m-%dT%H:%M:%SZ','now','+1 hour')"
        ).fetchone()[0]
        self.insert(expires_at=valid)
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM lms_scorm_qa_evidence_bindings"
            " WHERE julianday(expires_at)>julianday('now')"
        ).fetchone()[0], 1)
        self.assertEqual(self.db.execute(
            "SELECT julianday(?)>julianday(?)",
            ('2026-10-23T20:00:00Z','2026-10-23 21:00:00')
        ).fetchone()[0], 0)

    def test_manifest_byte_hashes(self):
        m=json.loads(M.read_text())
        self.assertEqual(m['changeId'],'lms-scorm-qa-evidence-bindings-0568')
        for key,path in [('fileHash',F),('planHash',P)]:
            self.assertEqual(m[key],hashlib.sha256(path.read_bytes()).hexdigest())
        for forbidden in ('UPDATE LMS_MATRICULAS','DELETE FROM LMS_MATRICULAS',
                          'UPDATE LMS_PROGRESSO_SCORM'):
            self.assertNotIn(forbidden,F.read_text().upper())

if __name__=='__main__':unittest.main()
