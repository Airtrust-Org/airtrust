import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  findGenericRemoteMigrationApplyViolations,
} from '../guard-no-generic-remote-migrations.mjs';
import { inspectMigrationsDirectory } from '../migration-directory-policy.mjs';

function withTempDir(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'airtrust-migrations-safety-'));
  try {
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function write(directory, name, content = 'SELECT 1;\n') {
  fs.writeFileSync(path.join(directory, name), content);
}

function violationTypes(result) {
  return new Set(result.violations.map((violation) => violation.type));
}

test('accepts a directory containing only canonical forward migrations', () => {
  withTempDir((directory) => {
    write(directory, '0001_create_example.sql');
    write(directory, '0002_add_example_index.sql');
    const result = inspectMigrationsDirectory(directory, { historicalDuplicateAllowlist: {} });
    assert.equal(result.ok, true);
    assert.deepEqual(result.candidateFiles, [
      '0001_create_example.sql',
      '0002_add_example_index.sql',
    ]);
  });
});

const rejectedNames = [
  ['0001_create_example_rollback.sql', 'rollback'],
  ['rollback_0001_create_example.sql', 'rollback'],
  ['0001_purge_example.sql', 'purge'],
  ['0001_example_preflight.sql', 'preflight'],
  ['0001_manual_fix.sql', 'manual_sql'],
  ['0001_example_diagnostic.sql', 'diagnostic_sql'],
  ['001-example.sql', 'invalid_filename'],
  ['0001-example.sql', 'invalid_filename'],
  ['0001_CREATE_EXAMPLE.sql', 'invalid_filename'],
];

for (const [name, expectedType] of rejectedNames) {
  test(`rejects ${name} as ${expectedType}`, () => {
    withTempDir((directory) => {
      write(directory, name);
      const result = inspectMigrationsDirectory(directory, { historicalDuplicateAllowlist: {} });
      assert.equal(result.ok, false);
      assert.ok(violationTypes(result).has(expectedType));
      assert.deepEqual(result.candidateFiles, []);
    });
  });
}

test('rejects a migration carrying NO_GO_MIGRATION_PRODUCAO', () => {
  withTempDir((directory) => {
    write(directory, '0001_blocked.sql', '-- NO_GO_MIGRATION_PRODUCAO\nSELECT 1;\n');
    const result = inspectMigrationsDirectory(directory, { historicalDuplicateAllowlist: {} });
    assert.ok(violationTypes(result).has('no_go_migration'));
    assert.deepEqual(result.candidateFiles, []);
  });
});

test('rejects incompatible duplicate prefixes', () => {
  withTempDir((directory) => {
    write(directory, '0001_first.sql');
    write(directory, '0001_second.sql');
    const result = inspectMigrationsDirectory(directory, { historicalDuplicateAllowlist: {} });
    assert.ok(violationTypes(result).has('duplicate_prefix'));
  });
});

test('rejects non-SQL files, nested directories and symlinks', () => {
  withTempDir((directory) => {
    write(directory, '0001_valid.sql');
    write(directory, 'README.md');
    fs.mkdirSync(path.join(directory, 'nested'));
    try {
      fs.symlinkSync(path.join(directory, '0001_valid.sql'), path.join(directory, '0002_link.sql'));
    } catch {
      // Symlink creation is not available on every test platform.
    }

    const result = inspectMigrationsDirectory(directory, { historicalDuplicateAllowlist: {} });
    const types = violationTypes(result);
    assert.ok(types.has('non_sql_file'));
    assert.ok(types.has('unexpected_entry'));
    if (fs.existsSync(path.join(directory, '0002_link.sql'))) assert.ok(types.has('symlink'));
  });
});

test('dry-run CLI prints the exact candidate list', () => {
  withTempDir((directory) => {
    write(directory, '0001_valid.sql');
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
    const output = execFileSync(
      process.execPath,
      ['scripts/guard-migrations-dir-purity.mjs', '--dry-run', '--dir', directory],
      { cwd: root, encoding: 'utf8' },
    );
    const parsed = JSON.parse(output);
    assert.equal(parsed.mode, 'dry-run');
    assert.deepEqual(parsed.candidateFiles, ['0001_valid.sql']);
  });
});

test('remote apply is accepted only in the exact governed wrapper', () => {
  withTempDir((root) => {
    const allowed = 'scripts/production/apply-simuladores-matriz-remote-migration.sh';
    const forbidden = 'scripts/deploy-worker-only.sh';
    fs.mkdirSync(path.join(root, 'scripts', 'production'), { recursive: true });
    fs.writeFileSync(
      path.join(root, allowed),
      'npx --no-install wrangler d1 migrations apply DB --remote --env production\n',
    );
    fs.writeFileSync(
      path.join(root, forbidden),
      'npx --no-install wrangler d1 migrations apply airtrust-db --env production --remote\n',
    );
    const violations = findGenericRemoteMigrationApplyViolations({
      root,
      files: [allowed, forbidden],
    });
    assert.deepEqual(violations, [forbidden]);
  });
});

test('deploy-worker-only contains no implicit migration application', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  const source = fs.readFileSync(path.join(root, 'scripts', 'deploy-worker-only.sh'), 'utf8');
  assert.doesNotMatch(source, /d1\s+migrations\s+apply/);
  assert.match(source, /never applies D1 migrations/i);
});

test('legacy 0091 remote executor is retired fail-closed', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  const script = path.join(
    root,
    'worker-airtrust',
    'scripts',
    'aplicar-migration-0091-seguro.sh',
  );
  const source = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /--remote|d1\s+migrations\s+apply/);

  let stderr = '';
  assert.throws(() => {
    try {
      execFileSync('bash', [script], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      stderr = String(error.stderr ?? '');
      throw error;
    }
  });
  assert.match(stderr, /retired/i);
  assert.match(stderr, /No database query or migration was executed/i);
});

test('the real canonical directory enumerates no destructive artifact', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  const result = inspectMigrationsDirectory(path.join(root, 'worker-airtrust', 'migrations'));
  assert.equal(result.ok, true, JSON.stringify(result.violations, null, 2));
  assert.equal(result.candidateFiles.some((name) => /rollback|purge|preflight|manual/i.test(name)), false);
});
