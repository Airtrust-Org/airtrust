import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  isNoGoMigrationContent,
  isNoGoMigrationFile,
  listNoGoMigrations,
} from '../migration-no-go-lib.mjs';

const confirmationText = 'I understand this may modify production data';

function captureFailure(callback) {
  let stderr = '';
  assert.throws(() => {
    try {
      callback();
    } catch (error) {
      stderr = String(error.stderr ?? '');
      throw error;
    }
  });
  return stderr;
}

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
  const content = ['-- Migration 9999: example', '-- Data: 2026-07-15', 'SELECT 1;'];
  assert.equal(isNoGoMigrationContent(content.join('\n')), false);
});

test('does not false-positive on a suffixed token', () => {
  const content = '-- NO_GO_MIGRATION_PRODUCAO_OUTRA_COISA\n';
  assert.equal(isNoGoMigrationContent(content), false);
});

test('blocked SQL is quarantined outside canonical migrations', () => {
  const canonicalDir = path.join(process.cwd(), 'worker-airtrust', 'migrations');
  const manualNoGoDir = path.join(process.cwd(), 'scripts', 'sql', 'manual', 'no-go');
  assert.deepEqual(listNoGoMigrations(canonicalDir), []);
  assert.deepEqual(listNoGoMigrations(manualNoGoDir), [
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

test('production wrapper refuses a NO_GO migration', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-go-wrapper-test-'));
  const migration = 'worker-airtrust/migrations/9999_test_blocked.sql';
  fs.mkdirSync(path.join(tmpDir, 'worker-airtrust', 'migrations'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, migration), '-- NO_GO_MIGRATION_PRODUCAO\nSELECT 1;\n');

  const helpers = [
    'apply-migration-production.sh',
    'check-single-migration-no-go.mjs',
    'migration-no-go-lib.mjs',
    'guard-migrations-dir-purity.mjs',
    'migration-directory-policy.mjs',
  ];
  for (const name of helpers) {
    const source = path.join(process.cwd(), 'scripts', name);
    const destination = path.join(tmpDir, 'scripts', name);
    fs.cpSync(source, destination);
  }

  const stderr = captureFailure(() => {
    execFileSync('bash', ['scripts/apply-migration-production.sh', migration], {
      cwd: tmpDir,
      env: {
        ...process.env,
        AIRTRUST_ALLOW_PROD_DB_WRITE: 'YES',
        AIRTRUST_CONFIRM_PROD_DB_WRITE: confirmationText,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  assert.match(stderr, /NO_GO_MIGRATION_PRODUCAO/);
  assert.match(stderr, /no override flag/i);
});

test('production wrapper rejects paths outside canonical migrations', () => {
  const stderr = captureFailure(() => {
    execFileSync(
      'bash',
      ['scripts/apply-migration-production.sh', 'sql/maintenance/whatever.sql'],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  });
  assert.match(stderr, /must be under worker-airtrust\/migrations/);
});
