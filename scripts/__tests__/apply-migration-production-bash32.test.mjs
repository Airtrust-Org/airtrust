import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import test, { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts', 'apply-migration-production.sh');

function runWrapper(args, env = {}) {
  return spawnSync('/bin/bash', [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  });
}

describe('apply-migration-production.sh Bash 3.2 & Governance Guards', () => {

  it('keeps HEAD != origin/main parity guard active', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf8');
    assert.ok(source.includes('if [[ "$head_sha" != "$origin_sha" ]]; then'));
    assert.ok(!source.includes('if false; then'));
  });

  it('rejects invocation without arguments', () => {
    const res = runWrapper([]);
    assert.strictEqual(res.status, 1);
    assert.ok((res.stdout + res.stderr).includes('usage: bash scripts/apply-migration-production.sh'));
  });

  it('rejects migration not in worker-airtrust/migrations/', () => {
    const res = runWrapper(['scripts/some-migration.sql']);
    assert.strictEqual(res.status, 1);
    assert.ok(res.stderr.includes('migration_file must be under worker-airtrust/migrations/'));
  });

  it('rejects non-canonical migration filename pattern', () => {
    const res = runWrapper(['worker-airtrust/migrations/invalid-name.sql']);
    assert.strictEqual(res.status, 1);
    assert.ok(res.stderr.includes('migration filename is not canonical forward SQL'));
  });

  it('rejects destructive operational migration keywords in Bash 3.2 without syntax error', () => {
    const res = runWrapper(['worker-airtrust/migrations/0999_test_rollback_schema.sql']);
    assert.strictEqual(res.status, 1);
    assert.ok(res.stderr.includes('operational/destructive SQL is not eligible'));
    // Ensure no "${migration_name,,}: bad substitution" in output
    assert.ok(!res.stderr.includes('bad substitution'));
  });

  it('rejects execution without AIRTRUST_ALLOW_PROD_DB_WRITE=YES', () => {
    const res = runWrapper(
      ['worker-airtrust/migrations/0461_refresh_tokens_empresa_id.sql'],
      {
        AIRTRUST_ALLOW_PROD_DB_WRITE: 'NO',
        AIRTRUST_CONFIRM_PROD_DB_WRITE: 'I understand this may modify production data',
      },
    );
    assert.strictEqual(res.status, 1);
    assert.ok((res.stdout + res.stderr).includes('set AIRTRUST_ALLOW_PROD_DB_WRITE=YES'));
  });

  it('rejects execution with wrong confirmation text', () => {
    const res = runWrapper(
      ['worker-airtrust/migrations/0461_refresh_tokens_empresa_id.sql'],
      {
        AIRTRUST_ALLOW_PROD_DB_WRITE: 'YES',
        AIRTRUST_CONFIRM_PROD_DB_WRITE: 'wrong text',
      },
    );
    assert.strictEqual(res.status, 1);
    assert.ok((res.stdout + res.stderr).includes('set AIRTRUST_CONFIRM_PROD_DB_WRITE exactly to: I understand this may modify production data'));
  });

  it('rejects non-production AIRTRUST_D1_ENV without explicit bypass', () => {
    const res = runWrapper(
      ['worker-airtrust/migrations/0461_refresh_tokens_empresa_id.sql'],
      {
        AIRTRUST_D1_ENV: 'staging',
        AIRTRUST_ALLOW_PROD_DB_WRITE: 'YES',
        AIRTRUST_CONFIRM_PROD_DB_WRITE: 'I understand this may modify production data',
      },
    );
    assert.strictEqual(res.status, 1);
    assert.ok((res.stdout + res.stderr).includes('AIRTRUST_D1_ENV must be production'));
  });
});
