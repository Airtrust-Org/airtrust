import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  inspectNativeCatalogSchemaSnapshot,
  NativeCatalogPreflightError,
} from '../schema-v2/native-v1-catalog-readonly-preflight.mjs';

const rows = [
  { type: 'table', name: 'lms_cursos',
    sql: "CREATE TABLE lms_cursos (id INTEGER PRIMARY KEY, empresa_id INTEGER, titulo TEXT, " +
         "tipo_conteudo TEXT CHECK (tipo_conteudo IN ('scorm', 'h5p', 'video', 'pdf', 'pptx')), " +
         "scorm_assessment_policy TEXT, qualificacao_tipo_id INTEGER)" },
  { type: 'index', name: 'idx_lms_cursos_tenant',
    sql: 'CREATE INDEX idx_lms_cursos_tenant ON lms_cursos(empresa_id)' },
  { type: 'trigger', name: 'trg_lms_cursos_update',
    sql: 'CREATE TRIGGER trg_lms_cursos_update AFTER UPDATE ON lms_cursos BEGIN SELECT 1; END' },
];
const fingerprint = (input) => createHash('sha256')
  .update(JSON.stringify([...input].sort((a,b) =>
    a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
  ).map((r) => [r.type,r.name,r.sql]))).digest('hex');
const snapshot = (data=rows) => [{ success:true, results:data }];

test('read-only Native catalog guard fingerprints table plus dependent objects', () => {
  const result=inspectNativeCatalogSchemaSnapshot(snapshot(),fingerprint(rows));
  assert.equal(result.status,'REVIEW_ONLY_REBUILD_REQUIRED');
  assert.equal(result.migrationPrepared,false);
  assert.equal(result.remoteMutationPerformed,false);
  assert.equal(result.snapshotHash,fingerprint(rows));
  assert.equal(result.objectCount,3);
  assert.deepEqual(result.dependentObjectNames,[
    'idx_lms_cursos_tenant','trg_lms_cursos_update',
  ]);
});

test('rejects changed catalogs including an already-native CHECK', () => {
  const newRows=structuredClone(rows);
  newRows[0].sql = newRows[0].sql.replace("'pptx')", "'pptx', 'native')");
  assert.throws(() => inspectNativeCatalogSchemaSnapshot(snapshot(newRows),fingerprint(newRows)),
    (e) => e instanceof NativeCatalogPreflightError &&
    e.code === 'CATALOG_CONTENT_TYPE_DRIFT_OR_ALREADY_NATIVE');
});

test('rejects any change to a trigger or index even if table DDL is unchanged', () => {
  const altered=structuredClone(rows);
  altered[2].sql += ' -- altered';
  assert.throws(() => inspectNativeCatalogSchemaSnapshot(snapshot(altered),fingerprint(rows)),
    (e) => e.code === 'CATALOG_SNAPSHOT_HASH_MISMATCH');
});

test('requires a precise expected hash and refuses an empty dependent inventory', () => {
  assert.throws(() => inspectNativeCatalogSchemaSnapshot(snapshot(),undefined),
    (e) => e.code === 'CATALOG_EXPECTED_SHA_REQUIRED');
  assert.throws(() => inspectNativeCatalogSchemaSnapshot(snapshot([rows[0]]),fingerprint([rows[0]])),
    (e) => e.code === 'CATALOG_DEPENDENCY_INVENTORY_INCOMPLETE');
});

test('rejects duplicate object names and invalid D1 source rows', () => {
  const dupe=[...rows, rows[1]];
  assert.throws(() => inspectNativeCatalogSchemaSnapshot(snapshot(dupe),fingerprint(dupe)),
    (e) => e.code === 'CATALOG_DUPLICATE_SCHEMA_OBJECT');
  assert.throws(() => inspectNativeCatalogSchemaSnapshot([{ results:[{ sql:'DROP TABLE users',name:'x',type:'table' }] }],fingerprint(rows)),
    (e) => e.code === 'CATALOG_INVALID_SCHEMA_OBJECT');
});
