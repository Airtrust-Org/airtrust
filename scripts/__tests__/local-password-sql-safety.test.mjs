import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '../..');
const requireWorker = createRequire(join(root, 'worker-airtrust/package.json'));
const bcrypt = requireWorker('bcryptjs');
const renderer = join(root, 'scripts/render-local-dev-password-sql.mjs');
const marker = '__AIRTRUST_LOCAL_BCRYPT_HASH__';

test('renders a unique local bcrypt without keeping a shared repository literal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-local-pw-'));
  const fixture = join(dir, 'template.sql');
  const output = join(dir, 'rendered.sql');
  const testPassword = ['synthetic', 'randomized', 'test', 'password', 'only'].join('-');
  try {
    writeFileSync(fixture, "SELECT '" + marker + "' AS password_hash;\n");
    const result = spawnSync(process.execPath, [renderer, fixture, output], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, AIRTRUST_LOCAL_DEV_PASSWORD: testPassword },
    });
    assert.equal(result.status, 0, result.stderr);
    const sql = readFileSync(output, 'utf8');
    assert.equal(sql.includes(marker), false);
    const match = sql.match(/[$]2[aby][$]12[$][A-Za-z0-9./]{53}/);
    assert.ok(match, 'bcrypt with 12 rounds must be generated');
    assert.equal(bcrypt.compareSync(testPassword, match[0]), true);
    assert.equal(sql.includes(testPassword), false);
    assert.equal(statSync(output).mode & 0o077, 0);
    assert.equal(result.stdout.trim(), '', 'never print a password or hash');
    const second = join(dir, 'second.sql');
    const again = spawnSync(process.execPath, [renderer, fixture, second], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, AIRTRUST_LOCAL_DEV_PASSWORD: testPassword },
    });
    assert.equal(again.status, 0, again.stderr);
    assert.notEqual(sql, readFileSync(second, 'utf8'), 'must use a fresh bcrypt salt per render');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects insufficient password strength and does not output a valid fixture', () => {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-short-pw-'));
  try {
    const fixture = join(dir, 'template.sql');
    const output = join(dir, 'rendered.sql');
    writeFileSync(fixture, "SELECT '" + marker + "' AS password_hash;\n");
    const result = spawnSync(process.execPath, [renderer, fixture, output], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, AIRTRUST_LOCAL_DEV_PASSWORD: 'short' },
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('source templates do not contain baked bcrypt values', () => {
  for (const name of ['scripts/setup-local-overrides.sql', 'scripts/sync-d1-production-sanitized.sh']) {
    const source = readFileSync(join(root, name), 'utf8');
    assert.equal(/[$]2[aby][$][0-9]{2}[$][A-Za-z0-9./]{53}/.test(source), false, name);
    assert.ok(source.includes(marker), name);
  }
});
