// source_reference: local-only eDB 0483 Schema V2 verification
// operational_decision: verify reviewed hashes and fail-closed exclusions only
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/edb-diary-persistence-0483.json';
const MIGRATION = 'worker-airtrust/migrations/0483_edb_diary_persistence_foundation.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function executable(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

test('pins reviewed hashes for edb-diary-persistence-0483', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath);
  const plan = readFileSync(manifest.planPath);

  assert.equal(manifest.changeId, 'edb-diary-persistence-0483');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(sql), manifest.fileHash);
  assert.equal(sha256(plan), manifest.planHash);
});

test('0483 is local-only additive schema and excludes unresolved ANAC/legacy semantics', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = readFileSync(manifest.filePath, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');

  for (const sql of [change, migration]) {
    const body = executable(sql);
    assert.match(body, /CREATE TABLE IF NOT EXISTS edb_diarios/i);
    assert.match(body, /CREATE TABLE IF NOT EXISTS edb_volumes/i);
    assert.match(body, /CREATE TABLE IF NOT EXISTS edb_incidentes_integridade/i);
    assert.doesNotMatch(body, /CREATE TABLE IF NOT EXISTS edb_anac_/i);
    assert.doesNotMatch(body, /ANAC_PENDING|ANAC_SYNCED/);
    assert.doesNotMatch(body, /ALTER TABLE\s+cv_voo_etapas/i);
    assert.doesNotMatch(body, /tempo_ifr_real_minutos|tempo_ifr_simulado_minutos/i);
    assert.doesNotMatch(body, /\b(?:INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|DROP TABLE)\b/i);
  }
});

test('migration and Schema V2 change are byte-identical', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(
    readFileSync(manifest.filePath, 'utf8'),
    readFileSync(MIGRATION, 'utf8'),
  );
});

test('official Schema V2 builder accepts 0483 and appends exactly one schema ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0483-')),
    '0483-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: 'edb-diary-persistence-0483',
    githubSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(result.changeId, 'edb-diary-persistence-0483');

  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /CREATE TABLE IF NOT EXISTS edb_diarios/);
  const ledgerRows = applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? [];
  assert.equal(ledgerRows.length, 1);
  assert.match(applied, /'edb-diary-persistence-0483'/);
});
