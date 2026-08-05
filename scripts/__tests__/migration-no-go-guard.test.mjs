// source_reference: guard checks for the NO_GO_MIGRATION_PRODUCAO marker and
// the production migration apply wrapper that reads it.
// operational_decision: exercises pure helpers plus the wrapper's argument/gate
// validation; never actually invokes wrangler or touches a real database.
// dry_run_required: all assertions are local and deterministic.
// rollback_plan_required: no rollback needed; this test file is read-only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  isNoGoMigrationContent,
  isNoGoMigrationFile,
  listNoGoMigrations,
} from '../migration-no-go-lib.mjs';

test('detects the NO_GO marker in file content', () => {
  const content = [
    '-- Migration 9999: example',
    '-- NO_GO_MIGRATION_PRODUCAO',
    '-- Motivo: teste',
    'SELECT 1;',
  ].join('\n');
  assert.equal(isNoGoMigrationContent(content), true);
});

test('does not flag ordinary migrations', () => {
  const content = ['-- Migration 9999: example', '-- Data: 2026-07-15', 'SELECT 1;'].join('\n');
  assert.equal(isNoGoMigrationContent(content), false);
});

test('does not false-positive on a suffixed token', () => {
  const content = '-- NO_GO_MIGRATION_PRODUCAO_OUTRA_COISA\n';
  assert.equal(isNoGoMigrationContent(content), false);
});

test('blocked historical SQL is quarantined outside the canonical migrations directory', () => {
  const canonicalDir = path.join(process.cwd(), 'worker-airtrust', 'migrations');
  const manualNoGoDir = path.join(process.cwd(), 'scripts', 'sql', 'manual', 'no-go');
  assert.deepEqual(listNoGoMigrations(canonicalDir), []);
  const blocked = listNoGoMigrations(manualNoGoDir);
  assert.deepEqual(blocked, [
    '0432_revisao_completa_codigos_manobras.sql',
    '0433_fix_loft_references.sql',
    '0435_fix_vencimento_fim_mes_lms.sql',
  ]);
});

test('isNoGoMigrationFile reads real files from disk', () => {
  const tmpFile = path.join(os.tmpdir(), `no-go-guard-test-${process.pid}.sql`);
  fs.writeFileSync(tmpFile, '-- NO_GO_MIGRATION_PRODUCAO\nSELECT 1;\n');
  try {
    assert.equal(isNoGoMigrationFile(tmpFile), true);
  } finally {
    fs.rmSync(tmpFile);
  }
});

test('apply-migration-production.sh refuses a migration marked NO_GO', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-go-wrapper-test-'));
  const migrationsSubdir = path.join(tmpDir, 'worker-airtrust', 'migrations');
  fs.mkdirSync(migrationsSubdir, { recursive: true });
  const migrationRelPath = 'worker-airtrust/migrations/9999_test_blocked.sql';
  fs.writeFileSync(path.join(tmpDir, migrationRelPath), '-- NO_GO_MIGRATION_PRODUCAO\nSELECT 1;\n');

  fs.mkdirSync(path.join(tmpDir, 'scripts'), { recursive: true });
  for (const name of [
    'apply-migration-production.sh',
    'check-single-migration-no-go.mjs',
    'migration-no-go-lib.mjs',
    'guard-migrations-dir-purity.mjs',
    'migration-directory-policy.mjs',
  ]) {
    fs.cpSync(path.join(process.cwd(), 'scripts', name), path.join(tmpDir, 'scripts', name));
  }

  let threw = false;
  let stderr = '';
  try {
    execFileSync('bash', ['scripts/apply-migration-production.sh', migrationRelPath], {
      cwd: tmpDir,
      env: {
        ...process.env,
        AIRTRUST_ALLOW_PROD_DB_WRITE: 'YES',
        AIRTRUST_CONFIRM_PROD_DB_WRITE: 'I understand this may modify production data',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    threw = true;
    stderr = String(error.stderr ?? '');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  assert.equal(threw, true, 'wrapper must exit non-zero for a NO_GO migration');
  assert.match(stderr, /NO_GO_MIGRATION_PRODUCAO/);
  assert.match(stderr, /no override flag/i);
});

test('apply-migration-production.sh rejects paths outside worker-airtrust/migrations', () => {
  let threw = false;
  let stderr = '';
  try {
    execFileSync('bash', ['scripts/apply-migration-production.sh', 'sql/maintenance/whatever.sql'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    threw = true;
    stderr = String(error.stderr ?? '');
  }
  assert.equal(threw, true);
  assert.match(stderr, /must be under worker-airtrust\/migrations/);
});
