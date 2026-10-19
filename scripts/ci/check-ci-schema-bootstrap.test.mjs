import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  extractDdlTargets,
  extractMigrationReferences,
  isReviewedCriticalChange,
  schemaV2ChangesAfter,
  validateContract,
} from './check-ci-schema-bootstrap.mjs';

test('extracts bootstrap migration references deterministically', () => {
  assert.deepEqual(
    extractMigrationReferences(`"$WORKER_DIR/migrations/0469_lms_completion_pendencias_snapshots.sql"\n"$WORKER_DIR/migrations/0470_certificado_validacao_hash_index.sql"`),
    ['0469_lms_completion_pendencias_snapshots.sql', '0470_certificado_validacao_hash_index.sql'],
  );
});

test('extracts table targets from table, index and trigger DDL', () => {
  const targets = extractDdlTargets(`
    ALTER TABLE lms_cursos ADD COLUMN x TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_x ON qualificacoes_historico(empresa_id);
    CREATE TRIGGER t AFTER INSERT ON lms_matriculas BEGIN SELECT 1; END;
  `);
  assert.deepEqual(new Set(targets), new Set(['lms_cursos', 'qualificacoes_historico', 'lms_matriculas']));
});

test('finds only Schema V2 changes newer than reviewed marker', () => {
  assert.deepEqual(
    schemaV2ChangesAfter(
      ['0486_edb_final_revision_persistence.sql', '0487_qualificacoes_renovacoes.sql', '0488_future.sql', 'README.md'],
      '0487_qualificacoes_renovacoes.sql',
    ),
    ['0488_future.sql'],
  );
});

test('current repository CI bootstrap contract is internally consistent', () => {
  const result = validateContract();
  assert.ok(result.migrations > 0);
  assert.equal(result.consumers, 3);
});

test('does not implicitly trust a lower-numbered future Schema V2 critical change', () => {
  const contents = 'ALTER TABLE lms_xapi_statements ADD COLUMN future TEXT;';
  const digest = createHash('sha256').update(contents).digest('hex');
  const reviewed = { '0557_lms_cycle_evidence_archive.sql': digest };
  assert.equal(isReviewedCriticalChange('0553_lms_native_v1_evidence.sql', contents, reviewed), false);
  assert.equal(isReviewedCriticalChange('0557_lms_cycle_evidence_archive.sql', contents, reviewed), true);
  assert.equal(isReviewedCriticalChange('0557_lms_cycle_evidence_archive.sql', contents + ' -- drift', reviewed), false);
});
