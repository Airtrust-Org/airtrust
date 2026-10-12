"""OFFLINE schema rehearsal for an activation table, never a D1 apply."""
from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve()
module_path = HERE.parents[1] / 'schema-v2' / 'rehearse-native-catalog-activation-table.py'
spec = importlib.util.spec_from_file_location('native_activation_rehearsal',module_path)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
digest = module.HELPERS['digest']

def synthetic():
    ddl = ("CREATE TABLE lms_cursos (id INTEGER PRIMARY KEY AUTOINCREMENT,"
           "empresa_id INTEGER REFERENCES empresas(id), titulo TEXT NOT NULL,"
           "tipo_conteudo TEXT NOT NULL DEFAULT 'scorm' "
           "CHECK(tipo_conteudo IN ('scorm','h5p','video','pdf','pptx')),"
           "deleted_at TEXT, scorm_launch_file TEXT, scorm_package_r2_prefix TEXT,"
           "scorm_assessment_policy TEXT, qualificacao_tipo_id INTEGER)")
    rows = [{'type':'table','name':'lms_cursos','sql':ddl}]
    for i in range(6):
        rows.append({'type':'index','name':f'idx_course_synthetic_{i}',
                     'sql':f'CREATE INDEX idx_course_synthetic_{i} ON lms_cursos(empresa_id)'})
    for i in range(5):
        rows.append({'type':'trigger','name':f'trg_course_synthetic_{i}',
                     'sql':f'CREATE TRIGGER trg_course_synthetic_{i} AFTER UPDATE ON lms_cursos '
                           'BEGIN SELECT 1; END'})
    rows.sort(key=lambda row: (row['type'],row['name']))
    return [{'results':rows}], digest(json.dumps([
        [r['type'],r['name'],r['sql']] for r in rows
    ],ensure_ascii=False,separators=(',',':')))

class NativeActivationTableRehearsalTests(unittest.TestCase):
    def test_marker_table_keeps_catalog_and_all_legacy_ddl_unchanged(self):
        data,sha=synthetic()
        out=module.rehearse_marker_table(data,sha)
        self.assertEqual(out['foreignKeyCheck'],'PASS')
        self.assertEqual(out['integrityCheck'],'PASS')
        self.assertEqual(out['originalDependentObjectsPreserved'],11)
        self.assertTrue(out['nativeEffectiveIdentityOnNewCourse'])
        self.assertTrue(out['preexistingScormCourseIsNotNative'])
        self.assertTrue(out['legacyRoutesStillRequireNativeExclusion'])
        self.assertFalse(out['migrationPrepared'])
        self.assertFalse(out['remoteMutationPerformed'])
        self.assertFalse(out['approvalForActivation'])

    def test_invalid_fingerprint_rejected_before_schema_creation(self):
        data,_=synthetic()
        with self.assertRaisesRegex(ValueError,'CATALOG_SNAPSHOT_DRIFT'):
            module.rehearse_marker_table(data,'f'*64)

    def test_catalog_ddl_drift_rejected(self):
        data,sha=synthetic()
        data[0]['results'][0]['sql'] += ' -- changed'
        with self.assertRaisesRegex(ValueError,'CATALOG_SNAPSHOT_DRIFT'):
            module.rehearse_marker_table(data,sha)

    def test_required_source_columns_are_mandatory(self):
        data,_=synthetic()
        ddl=data[0]['results'][0]
        ddl['sql']=ddl['sql'].replace('scorm_launch_file TEXT, ','')
        data[0]['results'].sort(key=lambda row:(row['type'],row['name']))
        new_sha=digest(json.dumps([[r['type'],r['name'],r['sql']]
            for r in data[0]['results']],ensure_ascii=False,separators=(',',':')))
        with self.assertRaisesRegex(ValueError,'REQUIRED_CATALOG_COLUMNS_MISSING'):
            module.rehearse_marker_table(data,new_sha)

    def test_injected_transaction_failure_restores_marker_and_catalog(self):
        data,sha=synthetic()
        db,objects,_=module.fixture(data,sha)
        try:
            before=db.execute(
                "SELECT sql FROM sqlite_master WHERE name='lms_cursos'").fetchone()[0]
            with self.assertRaisesRegex(RuntimeError,'INJECTED'):
                db.execute('BEGIN IMMEDIATE')
                try:
                    # executescript auto-commits: execute DDL statement by
                    # statement inside the existing transaction instead.
                    db.execute(module.ACTIVATION_DDL.split(';')[0])
                    raise RuntimeError('INJECTED')
                except Exception:
                    db.rollback()
                    raise
            self.assertEqual(db.execute(
                "SELECT sql FROM sqlite_master WHERE name='lms_cursos'").fetchone()[0],before)
            self.assertIsNone(db.execute(
                "SELECT name FROM sqlite_master WHERE name='lms_native_catalog_activation'"
            ).fetchone())
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
            self.assertEqual(len(objects),11)
        finally:
            db.close()

if __name__=='__main__':
    unittest.main()
