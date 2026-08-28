import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/usuarios-empresas-perfis-reconciliation-0475.json';
const MIGRATION = 'worker-airtrust/migrations/0475_usuarios_empresas_perfis_reconciliation.sql';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function executable(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

test('pins reviewed hashes for usuarios-empresas-perfis-reconciliation-0475', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sql = readFileSync(manifest.filePath);
  const plan = readFileSync(manifest.planPath);

  assert.equal(manifest.changeId, 'usuarios-empresas-perfis-reconciliation-0475');
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(sql), manifest.fileHash);
  assert.equal(sha256(plan), manifest.planHash);
});

test('reconciliation is additive and idempotent — no destructive or user-specific DML', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = readFileSync(manifest.filePath, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');

  for (const sql of [change, migration]) {
    const body = executable(sql);
    assert.match(body, /CREATE TABLE IF NOT EXISTS usuarios_empresas_perfis/i);
    assert.match(body, /CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_perfis_lookup/i);
    assert.match(body, /INSERT OR IGNORE INTO usuarios_empresas_perfis/i);
    assert.match(body, /FROM usuarios_empresas\s+WHERE role IS NOT NULL AND role != ''/i);
    // fail-closed against a repeat of the 0473 governance mistake
    assert.doesNotMatch(body, /\b(?:DROP|DELETE|UPDATE|REPLACE)\b/i);
    assert.doesNotMatch(body, /@/); // no e-mail / user-specific grant
    assert.doesNotMatch(body, /WHERE\s+u\.email/i);
    assert.doesNotMatch(body, /'GESTOR'|'INSTRUTOR'|'ALUNO'/); // no literal role grants
    assert.doesNotMatch(body, /upper\(|lower\(/i); // no mass casing normalization
  }
});

test('reconciliation SQL carries the governed comment contract', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const change = readFileSync(manifest.filePath, 'utf8');
  assert.match(change, /source_reference:/);
  assert.match(change, /operational_decision:/);
  assert.match(change, /dry_run_required:/);
  assert.match(change, /rollback_plan_required:/);
  // never claim 0473 was governed
  assert.match(change, /0473/);
  assert.match(change, /Do NOT fabricate a historical ledger row/i);
});

test('the migration/ copy and the schema-v2 change carry the same executable SQL', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const normalize = (sql) =>
    executable(sql)
      .replace(/\s+/g, ' ')
      .trim();
  assert.equal(
    normalize(readFileSync(manifest.filePath, 'utf8')),
    normalize(readFileSync(MIGRATION, 'utf8')),
  );
});

test('official Schema V2 apply builder accepts 0475 and appends exactly one ledger row', () => {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), 'airtrust-0475-')),
    '0475-apply.sql',
  );
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: 'usuarios-empresas-perfis-reconciliation-0475',
    githubSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.equal(result.changeId, 'usuarios-empresas-perfis-reconciliation-0475');
  const applied = readFileSync(outputPath, 'utf8');
  assert.match(applied, /CREATE TABLE IF NOT EXISTS usuarios_empresas_perfis/);
  const ledgerRows = applied.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? [];
  assert.equal(ledgerRows.length, 1);
  assert.match(applied, /'usuarios-empresas-perfis-reconciliation-0475'/);
  assert.doesNotMatch(applied, /'0473'|usuarios-empresas-perfis-0473/);
});
