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

import { isNoGoMigrationContent, isNoGoMigrationFile, listNoGoMigrations } from '../migration-no-go-lib.mjs';

test('detects the NO_GO marker in file content', () => {
  const content = ['-- Migration 9999: example', '-- NO_GO_MIGRATION_PRODUCAO', '-- Motivo: teste', 'SELECT 1;'].join(
    '\n',
  );
  assert.equal(isNoGoMigrationContent(content), true);
});

test('does not flag ordinary migrations', () => {
  const content = ['-- Migration 9999: example', '-- Data: 2026-07-15', 'SELECT 1;'].join('\n');
  assert.equal(isNoGoMigrationContent(content), false);
});

test('does not false-positive on the word NO_GO appearing mid-sentence', () => {
  const content = ['-- Esta nao e uma migration NO_GO_MIGRATION_PRODUCAO_QUALQUER_OUTRA_COISA no meio do texto'].join(
    '\n',
  );
  // The marker requires the exact token at line start; a suffixed variant must not match.
  assert.equal(isNoGoMigrationContent(content), false);
});

test('0432 and 0435 are currently marked NO_GO in the real migrations directory', () => {
  const migrationsDir = path.join(process.cwd(), 'worker-airtrust', 'migrations');
  const blocked = listNoGoMigrations(migrationsDir);
  assert.ok(blocked.includes('0432_revisao_completa_codigos_manobras.sql'));
  assert.ok(blocked.includes('0435_fix_vencimento_fim_mes_lms.sql'));
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
  fs.cpSync(path.join(process.cwd(), 'scripts', 'apply-migration-production.sh'), path.join(tmpDir, 'apply.sh'));
  fs.cpSync(
    path.join(process.cwd(), 'scripts', 'check-single-migration-no-go.mjs'),
    path.join(tmpDir, 'check-single-migration-no-go.mjs'),
  );
  fs.cpSync(path.join(process.cwd(), 'scripts', 'migration-no-go-lib.mjs'), path.join(tmpDir, 'migration-no-go-lib.mjs'));
  // The wrapper shells out to `node scripts/check-single-migration-no-go.mjs`
  // relative to CWD, so lay the copies out at the same relative path.
  fs.mkdirSync(path.join(tmpDir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(tmpDir, 'check-single-migration-no-go.mjs'), path.join(tmpDir, 'scripts', 'check-single-migration-no-go.mjs'));
  fs.cpSync(path.join(tmpDir, 'migration-no-go-lib.mjs'), path.join(tmpDir, 'scripts', 'migration-no-go-lib.mjs'));

  let threw = false;
  let stderr = '';
  try {
    execFileSync('bash', ['apply.sh', migrationRelPath], {
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
