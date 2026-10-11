"""Synthetic, offline-only additive Native catalog marker regression tests."""
import importlib.util
import sys
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / 'schema-v2' / 'rehearse-native-additive-marker.py'
spec = importlib.util.spec_from_file_location('native_additive_rehearsal', MODULE)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
parse_helper = module.HELPERS
digest = parse_helper['digest']


def synthetic():
    # Exactly the object inventory shape of the reviewed staging snapshot.
    ddl = ("CREATE TABLE lms_cursos (id INTEGER PRIMARY KEY AUTOINCREMENT,"
           "empresa_id INTEGER REFERENCES empresas(id), titulo TEXT NOT NULL,"
           "tipo_conteudo TEXT NOT NULL DEFAULT 'scorm' "
           "CHECK(tipo_conteudo IN ('scorm','h5p','video','pdf','pptx')),"
           "scorm_assessment_policy TEXT, qualificacao_tipo_id INTEGER)")
    rows = [{'type':'table','name':'lms_cursos','sql':ddl}]
    for i in range(6):
        rows.append({'type':'index','name':f'idx_course_synthetic_{i}',
                     'sql':f'CREATE INDEX idx_course_synthetic_{i} ON lms_cursos(empresa_id)'})
    for i in range(5):
        rows.append({'type':'trigger','name':f'trg_course_synthetic_{i}',
                     'sql':f'CREATE TRIGGER trg_course_synthetic_{i} AFTER UPDATE ON lms_cursos '
                           'BEGIN SELECT 1; END'})
    rows.sort(key=lambda row:(row['type'],row['name']))
    import json
    return [{'results':rows}], digest(json.dumps(
        [[r['type'],r['name'],r['sql']] for r in rows],
        ensure_ascii=False, separators=(',',':')))


class NativeAdditiveRehearsalTests(unittest.TestCase):
    def test_fk_safe_additive_marker_is_possible_but_does_not_isolate_scorm(self):
        snapshot, fingerprint = synthetic()
        result=module.rehearse_additive_marker(snapshot,fingerprint)
        self.assertEqual(result['foreignKeyCheck'],'PASS')
        self.assertEqual(result['integrityCheck'],'PASS')
        self.assertEqual(result['dependentDefinitionsPreserved'],11)
        self.assertTrue(result['foreignKeysKeptOn'])
        self.assertTrue(result['legacyDefaultUnchanged'])
        self.assertTrue(result['unmodifiedLegacyRouteWouldSeeScorm'])
        self.assertTrue(result['legacyRouteIsolationRequired'])
        self.assertFalse(result['migrationPrepared'])
        self.assertFalse(result['remoteMutationPerformed'])

    def test_any_schema_drift_refuses_the_rehearsal(self):
        snapshot, fingerprint=synthetic()
        snapshot[0]['results'][0]['sql'] += ' -- unwanted drift'
        with self.assertRaisesRegex(ValueError,'CATALOG_SNAPSHOT_DRIFT'):
            module.rehearse_additive_marker(snapshot,fingerprint)

    def test_nonmatching_or_missing_hash_fails_closed(self):
        snapshot, _=synthetic()
        with self.assertRaises(ValueError):
            module.rehearse_additive_marker(snapshot,'f'*64)
        with self.assertRaises(ValueError):
            module.rehearse_additive_marker(snapshot,'')


if __name__=='__main__':
    unittest.main()
