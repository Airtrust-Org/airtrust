import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/staging/migration-ledger-preflight.mjs');
const source = readFileSync(SCRIPT, 'utf8');

test('official staging workflow preflight derives scope from approved_migrations', () => {
  assert.match(source, /function getOfficialDispatchScopeTokens\(\)/);
  assert.match(source, /GITHUB_WORKFLOW !== 'Deploy Staging \(Official\)'/);
  assert.match(source, /GITHUB_EVENT_NAME !== 'workflow_dispatch'/);
  assert.match(source, /GITHUB_REF !== 'refs\/heads\/main'/);
  assert.match(source, /event\?\.inputs\?\.approved_migrations/);
  assert.match(source, /PREFLIGHT_SCOPE_FROM_APPROVED_MIGRATIONS=/);
  assert.match(source, /const dispatchRequested = getOfficialDispatchScopeTokens\(\)/);
  assert.match(source, /const requested = dispatchRequested \?\? scopeArg/);
});

test('approved migration filenames are strict and still must exist locally', () => {
  assert.match(source, /approved_migrations contém nome inválido/);
  assert.match(source, /Migration fora da scope local\/versionada/);
  assert.match(source, /\^\(\\d\{4\}\)_/);
});

test('preflight remains staging-only and syntactically valid', () => {
  assert.match(source, /ALLOWED_STAGING_DB_NAME = 'airtrust-db-staging-baseline-20260701'/);
  assert.match(source, /BLOCKED_DB_NAMES/);
  assert.match(source, /BLOCKED_DB_IDS/);
  execFileSync(process.execPath, ['--check', SCRIPT]);
});
