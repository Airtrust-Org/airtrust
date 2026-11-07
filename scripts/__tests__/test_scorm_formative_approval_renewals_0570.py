#!/usr/bin/env python3
"""Offline Schema V2 0570 contract: no remote access, no user data."""
import hashlib
import json
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHANGES = ROOT / 'worker-airtrust/schema-v2/changes'
F = CHANGES / '0570_lms_scorm_formative_approval_renewals.sql'
M = ROOT / 'worker-airtrust/schema-v2/lms-scorm-formative-approval-renewals-0570.json'
P = ROOT / 'worker-airtrust/schema-v2/plans/lms-scorm-formative-approval-renewals-0570.md'
PKG = '123e4567-e89b-42d3-a456-426614174001'
APPROVAL = 'appr-0123456789abcdef'
SHA = 'c' * 64
OLD = 'a' * 64
NEW = 'b' * 64

class Renewal0570Tests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript("""
          CREATE TABLE lms_cursos(id INTEGER,empresa_id INTEGER,tipo_conteudo TEXT,deleted_at TEXT,
            scorm_assessment_policy TEXT NOT NULL DEFAULT 'SCORED',PRIMARY KEY(empresa_id,id));
          CREATE TABLE lms_scorm_package_versions(id TEXT PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,
            package_sha256 TEXT,status TEXT,validation_result_json TEXT);
          CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,
            matricula_id INTEGER,ciclo_atual INTEGER,status TEXT,deleted_at TEXT);
          CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER);
          CREATE TABLE lms_progresso_scorm(id INTEGER PRIMARY KEY,empresa_id INTEGER);
          CREATE TABLE qualificacoes_historico(id INTEGER PRIMARY KEY,empresa_id INTEGER);
          INSERT INTO lms_cursos VALUES(26,6,'scorm',NULL,'SCORED');
          INSERT INTO lms_matriculas VALUES(10,6,26);
          INSERT INTO lms_matricula_ciclos VALUES(100,6,26,10,1,'CONCLUIDO',NULL);
          INSERT INTO lms_progresso_scorm VALUES(1000,6);
          INSERT INTO qualificacoes_historico VALUES(2000,6);
        """)
        self.db.execute('INSERT INTO lms_scorm_package_versions VALUES(?,?,?,?,?,?)',
                        (PKG,6,26,SHA,'VALIDATED',
                         json.dumps({'formativeCertification':{'attestationSha256':NEW}})))
        self.db.executescript((CHANGES/'0569_lms_scorm_edition_policy_approvals.sql').read_text())
        self.db.execute("UPDATE lms_scorm_package_versions SET assessment_policy='FORMATIVE',"
                        "certification_profile='FORMATIVE_NO_EXAM_V1' WHERE id=?", (PKG,))
        self.db.execute("""INSERT INTO lms_scorm_package_approvals
          (id,empresa_id,curso_id,package_id,package_sha256,certification_profile,
           attestation_sha256,approver_id,approval_note)
          VALUES(?,?,?,?,?,'FORMATIVE_NO_EXAM_V1',?,?,?)""",
          (APPROVAL,6,26,PKG,SHA,OLD,77,'Aprovação original preservada'))
        self.db.executescript(F.read_text())
    def tearDown(self):
        self.db.close()
    def renew(self, tenant=6, sequence=1, previous=OLD, digest=NEW):
        self.db.execute("""INSERT INTO lms_scorm_package_approval_renewals
          (id,approval_id,empresa_id,curso_id,package_id,package_sha256,sequence,
           previous_attestation_sha256,attestation_sha256,approver_id,approval_note)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
          ('renew-0123456789abcdef',APPROVAL,tenant,26,PKG,SHA,sequence,previous,digest,
           77,'Nova evidência homologada e revisada'))
    def test_exact_manifest_and_mirror(self):
        m=json.loads(M.read_text())
        self.assertEqual(m['changeId'],'lms-scorm-formative-approval-renewals-0570')
        self.assertEqual(m['fileHash'],hashlib.sha256(F.read_bytes()).hexdigest())
        self.assertEqual(m['planHash'],hashlib.sha256(P.read_bytes()).hexdigest())
        self.assertEqual(F.read_bytes(),(ROOT/'worker-airtrust/migrations/0570_lms_scorm_formative_approval_renewals.sql').read_bytes())
    def test_zero_backfill_and_unchanged_history(self):
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM lms_scorm_package_approval_renewals').fetchone()[0],0)
        for table in ('lms_scorm_package_approvals','lms_matriculas','lms_matricula_ciclos',
                      'lms_progresso_scorm','qualificacoes_historico'):
            self.assertEqual(self.db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0],1)
    def test_append_only_chain(self):
        self.renew()
        self.assertEqual(self.db.execute('SELECT attestation_sha256 FROM lms_scorm_package_approvals').fetchone()[0],OLD)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_scorm_package_approval_renewals SET approval_note='tampered'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM lms_scorm_package_approval_renewals")
    def test_cross_tenant_wrong_chain_and_unwitnessed_digest_rejected(self):
        for args in ({'tenant':7},{'sequence':2},{'previous':'d'*64},{'digest':'e'*64}):
            with self.assertRaises(sqlite3.IntegrityError):
                self.renew(**args)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM lms_scorm_package_approval_renewals').fetchone()[0],0)

if __name__=='__main__':
    unittest.main()
