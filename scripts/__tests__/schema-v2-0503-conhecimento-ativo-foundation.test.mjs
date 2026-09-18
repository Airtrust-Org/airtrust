// source_reference: worker-airtrust/schema-v2/conhecimento-ativo-foundation-0503.json
// operational_decision: static/local governance test only; never writes to staging or production D1
// dry_run_required: true
// rollback_plan_required: worker-airtrust/schema-v2/plans/conhecimento-ativo-foundation-0503.md
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReviewedSchemaApply } from '../schema-v2/build-reviewed-schema-apply.mjs';

const MANIFEST = 'worker-airtrust/schema-v2/conhecimento-ativo-foundation-0503.json';
const MIGRATION = 'worker-airtrust/migrations/0503_conhecimento_ativo_foundation.sql';
const CHANGE_ID = 'conhecimento-ativo-foundation-0503';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('pins reviewed hashes and canonical SQL for 0503', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.changeId, CHANGE_ID);
  assert.equal(manifest.baselineId, 'production-d1-baseline-v2-20260714');
  assert.equal(sha256(readFileSync(manifest.filePath)), manifest.fileHash);
  assert.equal(sha256(readFileSync(manifest.planPath)), manifest.planHash);
  assert.equal(readFileSync(manifest.filePath, 'utf8'), readFileSync(MIGRATION, 'utf8'));
});

test('official Schema V2 builder accepts 0503 and appends exactly one ledger row', () => {
  const outputPath = path.join(mkdtempSync(path.join(tmpdir(), 'airtrust-0503-')), 'apply.sql');
  const result = buildReviewedSchemaApply({
    manifestPath: MANIFEST,
    outputPath,
    expectedChangeId: CHANGE_ID,
    githubSha: 'ffffffffffffffffffffffffffffffffffffffff',
  });
  assert.equal(result.changeId, CHANGE_ID);
  const sql = readFileSync(outputPath, 'utf8');
  assert.equal((sql.match(/INSERT INTO airtrust_schema_changes_v2/g) ?? []).length, 1);
});

test('0503 builds the 13-table Conhecimento Ativo foundation on disposable SQLite', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'airtrust-0503-sqlite-'));
  const dbPath = path.join(tempDir, 'knowledge.sqlite');
  execFileSync('sqlite3', [
    dbPath,
    'CREATE TABLE usuarios(id INTEGER PRIMARY KEY);' +
      'CREATE TABLE funcionarios(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT);' +
      'CREATE TABLE legacy_trigger_target(id INTEGER PRIMARY KEY);' +
      'CREATE TRIGGER trg_calc_vencimento_insert AFTER INSERT ON legacy_trigger_target BEGIN SELECT 1; END;',
  ]);
  execFileSync('sqlite3', [dbPath], { input: readFileSync(MIGRATION) });
  const tableCount = Number(
    execFileSync('sqlite3', [
      dbPath,
      "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name GLOB 'conhecimento_ativo_*';",
    ])
      .toString()
      .trim(),
  );
  const triggerCount = Number(
    execFileSync('sqlite3', [
      dbPath,
      "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name GLOB 'trg_ca_*';",
    ])
      .toString()
      .trim(),
  );
  assert.equal(tableCount, 13);
  assert.equal(triggerCount, 9);

  const legacyTriggerCount = Number(
    execFileSync('sqlite3', [
      dbPath,
      "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name='trg_calc_vencimento_insert';",
    ])
      .toString()
      .trim(),
  );
  assert.equal(legacyTriggerCount, 1);
});

test('production workflow wires dedicated 0503 preflight and postconditions', () => {
  const workflow = readFileSync('.github/workflows/apply-schema-change-v2.yml', 'utf8');
  assert.match(workflow, /inputs\.change_id == 'conhecimento-ativo-foundation-0503'/);
  assert.match(workflow, /validate-0503-production-preflight\.sh/);
  assert.match(workflow, /validate-0503-production-postconditions\.sh/);

  for (const file of [
    'scripts/schema-v2/validate-0503-production-preflight.sh',
    'scripts/schema-v2/validate-0503-production-postconditions.sh',
  ]) {
    execFileSync('bash', ['-n', file]);
    const src = readFileSync(file, 'utf8');
    assert.match(src, /airtrust-db/);
    assert.doesNotMatch(src, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
  }
});

test('staging allowlists 0503 and routes it through guarded recovery-point runner', () => {
  const outer = readFileSync('scripts/staging/apply-approved-migrations.sh', 'utf8');
  assert.match(outer, /0503_conhecimento_ativo_foundation\.sql/);
  assert.match(outer, /apply-0503-conhecimento-ativo-foundation\.sh/);

  const generic = readFileSync(
    'scripts/staging/apply-approved-migration-with-recovery-point.sh',
    'utf8',
  );
  assert.match(generic, /0503_conhecimento_ativo_foundation\.sql/);
  assert.match(generic, /validate-0503-postconditions\.sh/);

  const runner = readFileSync(
    'scripts/staging/apply-0503-conhecimento-ativo-foundation.sh',
    'utf8',
  );
  assert.match(runner, /SCHEMA_CHANGE_ID="conhecimento-ativo-foundation-0503"/);
  assert.match(runner, /apply-approved-migration-with-recovery-point\.sh/);
  assert.match(runner, /validate-0503-postconditions\.sh/);

  execFileSync('bash', ['-n', 'scripts/staging/apply-0503-conhecimento-ativo-foundation.sh']);
  execFileSync('bash', ['-n', 'scripts/staging/validate-0503-postconditions.sh']);
});
