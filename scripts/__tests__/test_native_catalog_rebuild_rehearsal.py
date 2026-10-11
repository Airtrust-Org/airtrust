"""Offline-only tests of proposed Native catalog rebuild against synthetic DDL."""
import hashlib
import importlib.util
import json
import pathlib
import unittest

FILE = pathlib.Path(__file__).resolve().parents[1] / 'schema-v2/rehearse-native-catalog-rebuild.py'
spec = importlib.util.spec_from_file_location('native_catalog_rehearsal', FILE)
assert spec and spec.loader
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

TABLE = """CREATE TABLE "lms_cursos" (
 id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL,
 titulo TEXT NOT NULL, updated_at TEXT,
 qualificacao_tipo_id INTEGER REFERENCES qualificacoes_tipos(id),
 formato_id INTEGER REFERENCES qualificacoes_formatos(id),
 tipo_conteudo TEXT NOT NULL DEFAULT 'scorm'
 CHECK (tipo_conteudo IN ('scorm', 'h5p', 'video', 'pdf', 'pptx')),
 FOREIGN KEY (empresa_id) REFERENCES empresas(id)
)"""


def synthetic_objects():
    definitions = [{'type':'table', 'name':'lms_cursos', 'sql':TABLE}]
    indexes = [
        ('idx_lms_cursos_empresa_deleted', '(empresa_id)'),
        ('idx_lms_cursos_empresa_publicado', '(tipo_conteudo)'),
        ('idx_lms_cursos_dominio_codigo', '(titulo)'),
        ('idx_lms_cursos_qualificacao_tipo', '(qualificacao_tipo_id)'),
        ('idx_lms_cursos_formato', '(formato_id)'),
        ('idx_lms_cursos_empresa_categoria', '(empresa_id,titulo)'),
    ]
    for name,columns in indexes:
        definitions.append({
            'type':'index','name':name,
            'sql':f'CREATE INDEX {name} ON lms_cursos{columns}',
        })
    for i,name in enumerate([
        'trg_lms_course_qualification_category_fk_insert_0457',
        'trg_lms_course_qualification_category_fk_update_0457',
        'trg_lms_course_qualification_category_snapshot_insert_0457',
        'trg_lms_course_qualification_category_snapshot_update_0457',
        'trg_lms_cursos_updated_at',
    ]):
        event = 'INSERT' if i % 2 == 0 else 'UPDATE'
        definitions.append({
            'type':'trigger','name':name,
            'sql':f'CREATE TRIGGER {name} AFTER {event} ON lms_cursos BEGIN SELECT 1; END',
        })
    return definitions


def sha(rows):
    canon = sorted(rows, key=lambda r:(r['type'],r['name']))
    raw=json.dumps([[r['type'],r['name'],r['sql']] for r in canon],
                   ensure_ascii=False,separators=(',',':'))
    return hashlib.sha256(raw.encode()).hexdigest()


class NativeCatalogRehearsalTests(unittest.TestCase):
    def snapshot(self):
        return [{'results':synthetic_objects()}]

    def test_exact_twelve_objects_and_three_fk_children_are_preserved(self):
        rows=synthetic_objects()
        result=mod.rehearse_snapshot([{'results':rows}],sha(rows))
        self.assertEqual(result['schema'],'AIRTRUST_NATIVE_CATALOG_OFFLINE_REHEARSAL_V1')
        self.assertTrue(result['offlineOnly'])
        self.assertFalse(result['migrationPrepared'])
        self.assertFalse(result['remoteMutationPerformed'])
        self.assertEqual(result['dependentDefinitionsPreserved'],11)
        self.assertTrue(result['originalAutoincrementPreserved'])
        self.assertEqual(result['foreignKeyCheck'],'PASS')
        self.assertEqual(result['integrityCheck'],'PASS')
        self.assertEqual(result['syntheticNativeWrite'],'PASS')
        self.assertTrue(result['requiresDedicatedGovernedD1Executor'])

    def test_simulated_crash_during_drop_restores_every_object_and_all_rows(self):
        rows=synthetic_objects()
        with self.assertRaisesRegex(RuntimeError,'SYNTHETIC_INJECTED_FAILURE'):
            mod.rehearse_snapshot([{'results':rows}],sha(rows),
                                 inject_fault_after_drop=True)

    def test_schema_fingerprint_drift_rejected_before_any_rebuild(self):
        rows=synthetic_objects()
        expected=sha(rows)
        rows[2]['sql']+=' -- unexpected drift'
        with self.assertRaisesRegex(mod.CatalogRehearsalError,'CATALOG_SNAPSHOT_DRIFT'):
            mod.rehearse_snapshot([{'results':rows}],expected)

    def test_missing_trigger_is_blocked_even_with_self_consistent_hash(self):
        rows=synthetic_objects()[:-1]
        with self.assertRaisesRegex(mod.CatalogRehearsalError,'CATALOG_SCHEMA_OBJECT_COUNT'):
            mod.rehearse_snapshot([{'results':rows}],sha(rows))

    def test_reordered_or_already_native_check_is_not_assumed_equivalent(self):
        for ddl in [
            TABLE.replace("'scorm', 'h5p'","'h5p', 'scorm'"),
            TABLE.replace("'pptx')","'pptx', 'native')"),
            TABLE.replace("CHECK (tipo_conteudo IN", "CHECK (conteudo IN"),
        ]:
            with self.subTest(ddl=ddl[-100:]):
                rows=synthetic_objects()
                rows[0]['sql']=ddl
                with self.assertRaisesRegex(mod.CatalogRehearsalError,
                                            'CATALOG_CHECK_UNEXPECTED'):
                    mod.rehearse_snapshot([{'results':rows}],sha(rows))

    def test_empty_hash_duplicate_index_and_other_table_are_rejected(self):
        rows=synthetic_objects()
        with self.assertRaisesRegex(mod.CatalogRehearsalError,'CATALOG_EXPECTED_SHA'):
            mod.rehearse_snapshot([{'results':rows}],'')
        rows[1]['name']=rows[2]['name']
        with self.assertRaisesRegex(mod.CatalogRehearsalError,'CATALOG_SCHEMA_OBJECT_COUNT'):
            mod.rehearse_snapshot([{'results':rows}],sha(rows))
        rows=synthetic_objects()
        rows[0]['name']='lms_cursos_other'
        with self.assertRaisesRegex(mod.CatalogRehearsalError,'CATALOG_SCHEMA_INVENTORY_DRIFT'):
            mod.rehearse_snapshot([{'results':rows}],sha(rows))


if __name__=='__main__':
    unittest.main()
