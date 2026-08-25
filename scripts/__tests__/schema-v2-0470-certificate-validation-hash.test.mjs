import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/certificate-validation-hash-0470.json';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('pins reviewed hashes for certificate-validation-hash-0470', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath);
  const plan = readFileSync(manifest.planPath);

  assert.equal(manifest.changeId, 'certificate-validation-hash-0470');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(sql), manifest.fileHash);
  assert.equal(sha256(plan), manifest.planHash);
});

test('keeps 0470 additive: nullable hash column plus partial lookup index', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath, 'utf8');
  const executableSql = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  assert.match(sql, /ALTER TABLE qualificacoes_historico\s+ADD COLUMN validacao_hash TEXT/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_validacao_hash/i);
  assert.doesNotMatch(executableSql, /\b(?:DROP|DELETE|UPDATE|REPLACE)\b/i);
  assert.match(sql, /source_reference:/);
  assert.match(sql, /operational_decision:/);
  assert.match(sql, /dry_run_required:/);
  assert.match(sql, /rollback_plan_required:/);
});

test('official Schema V2 apply builder accepts the 0470 family locally', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0470-')),
    '0470-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: 'certificate-validation-hash-0470',
    githubSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(result.changeId, 'certificate-validation-hash-0470');
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /ALTER TABLE qualificacoes_historico/);
  assert.match(applied, /INSERT INTO airtrust_schema_changes_v2/);
});
