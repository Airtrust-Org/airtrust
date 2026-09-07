// source_reference: qualification-renewal 0487 Schema V2 verification
// operational_decision: verify reviewed hashes and additive local schema contract
// dry_run_required: false
// rollback_plan_required: false
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/qualificacoes-renovacoes-0487.json';
const MIGRATION = 'worker-airtrust/migrations/0487_qualificacoes_renovacoes.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('pins reviewed hashes for qualification renewals 0487', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath);
  const plan = readFileSync(manifest.planPath);
  assert.equal(manifest.changeId, 'qualificacoes-renovacoes-0487');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(sql), manifest.fileHash);
  assert.equal(sha256(plan), manifest.planHash);
});

test('0487 Schema V2 SQL is byte-equivalent to the canonical additive migration', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = readFileSync(manifest.filePath, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');
  assert.equal(change, migration);
  assert.match(change, /CREATE TABLE IF NOT EXISTS qualificacoes_renovacoes/);
  assert.match(change, /FOREIGN KEY \(qualificacao_historico_id\) REFERENCES qualificacoes_historico\(id\)/);
  assert.match(change, /idx_qualificacoes_renovacoes_historico/);
  assert.match(change, /idx_qualificacoes_renovacoes_status_data/);
  assert.doesNotMatch(change, /\b(?:INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|DROP TABLE)\b/i);
});

test('official Schema V2 builder accepts 0487 and appends exactly one ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0487-')),
    '0487-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: 'qualificacoes-renovacoes-0487',
    githubSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(result.changeId, 'qualificacoes-renovacoes-0487');
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /CREATE TABLE IF NOT EXISTS qualificacoes_renovacoes/);
  const ledgerRows = applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? [];
  assert.equal(ledgerRows.length, 1);
  assert.match(applied, /'qualificacoes-renovacoes-0487'/);
});
