"""Input safety tests for offline-only staged Native DDL compatibility check."""
import unittest
from pathlib import Path
import importlib.util

FILE=Path(__file__).resolve().parents[1]/'ops/rehearse-native-schema-from-staging-snapshot.py'
spec=importlib.util.spec_from_file_location('native_staging_schema_readonly',FILE)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def minimal():
    return [{'name':name,'sql':f'CREATE TABLE "{name}" (id INTEGER PRIMARY KEY)'}
            for name in sorted(mod.REQUIRED_TABLES)]

class NativeSchemaSnapshotTests(unittest.TestCase):
    def test_whitelisted_schema_tables_only(self):
        self.assertEqual(set(mod.parse_snapshot({'results': minimal()})),mod.REQUIRED_TABLES)

    def test_refuses_missing_extra_duplicate_and_error_result(self):
        rows=minimal()
        for value in [
            {'results':rows[:-1]}, {'results':rows+[rows[0]]},
            {'results':rows+[{'name':'people_private','sql':'CREATE TABLE people_private(id INT)'}]},
            {'success':False,'results':rows}, {'results': []},
        ]:
            with self.subTest(value=str(value)[:80]):
                with self.assertRaises(ValueError): mod.parse_snapshot(value)

    def test_refuses_non_ddl_or_multistatement(self):
        for bad in ['DROP TABLE usuarios',
                    'CREATE TABLE "usuarios"(id INT); DELETE FROM lms_cursos',
                    'CREATE VIEW "usuarios" AS SELECT 1']:
            rows=minimal()
            for row in rows:
                if row['name']=='usuarios':
                    row['sql']=bad
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError): mod.parse_snapshot({'results':rows})

    def test_refuses_missing_actual_staging_columns(self):
        with self.assertRaisesRegex(ValueError,'NATIVE_SCHEMA_COLUMN_DRIFT'):
            mod.rehearse({'results':minimal()})

if __name__=='__main__':
    unittest.main()
