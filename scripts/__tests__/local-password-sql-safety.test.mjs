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
  for (const name of [
    'scripts/setup-local-overrides.sql',
    'scripts/sync-d1-production-sanitized.sh',
    'scripts/seed-local-lms-smoke.sql',
    'worker-airtrust/seeds/dev-seed.sql',
  ]) {
    const source = readFileSync(join(root, name), 'utf8');
    assert.equal(/[$]2[aby][$][0-9]{2}[$][A-Za-z0-9./]{53}/.test(source), false, name);
    assert.ok(source.includes(marker), name);
  }
});


test('local production import preflights bcrypt before any export or local D1 replacement', () => {
  const script = readFileSync(join(root, 'scripts/sync-d1-production-sanitized.sh'), 'utf8');
  const preflight = script.indexOf('PREFLIGHT_PASSWORD_SQL=');
  const exportCall = script.indexOf('info "Exportando D1 de produção para $EXPORT_FILE"');
  const localReset = script.indexOf('rm -rf "$WORKER_DIR/.wrangler/state/v3/d1"');
  assert.ok(preflight > 0 && exportCall > preflight && localReset > preflight,
    'password renderer must run before exporting or replacing the local database');
  assert.match(script.slice(preflight, exportCall), /render-local-dev-password-sql\.mjs/);
  assert.match(script.slice(preflight, exportCall), /\|\| fail/);
});


test('fixture password renders a fresh salted bcrypt so scripted local logins keep working', () => {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-fixture-pw-'));
  const fixturePassword = ['Fixture', '1234'].join('-');
  try {
    const template = join(dir, 'template.sql');
    writeFileSync(template, "SELECT '" + marker + "';\n");
    const render = (name, env) => {
      const out = join(dir, name);
      const result = spawnSync(process.execPath, [renderer, template, out], {
        cwd: root, encoding: 'utf8', env: { ...process.env, ...env },
      });
      return { result, out };
    };
    const first = render('a.sql', { AIRTRUST_LOCAL_FIXTURE_PASSWORD: fixturePassword });
    const second = render('b.sql', { AIRTRUST_LOCAL_FIXTURE_PASSWORD: fixturePassword });
    assert.equal(first.result.status, 0, first.result.stderr);
    assert.equal(first.result.stdout.trim(), '');
    const hashA = readFileSync(first.out, 'utf8').match(/[$]2[aby][$]12[$][A-Za-z0-9./]{53}/)[0];
    const hashB = readFileSync(second.out, 'utf8').match(/[$]2[aby][$]12[$][A-Za-z0-9./]{53}/)[0];
    assert.equal(bcrypt.compareSync(fixturePassword, hashA), true);
    assert.notEqual(hashA, hashB, 'salt must differ on every render');
    const tooShort = render('c.sql', { AIRTRUST_LOCAL_FIXTURE_PASSWORD: 'short' });
    assert.notEqual(tooShort.result.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no tracked script, seed or test embeds a real-looking bcrypt literal', () => {
  const tracked = spawnSync('git', ['ls-files', 'scripts', 'worker-airtrust/seeds', 'worker-airtrust/sql'], {
    cwd: root, encoding: 'utf8',
  }).stdout.split('\n').filter(Boolean);
  const literal = /[$]2[aby][$][0-9]{2}[$][A-Za-z0-9./]{53}/;
  const offenders = tracked.filter((name) => {
    if (!/[.](sql|sh|mjs|cjs|js|ts)$/.test(name)) return false;
    try { return literal.test(readFileSync(join(root, name), 'utf8')); } catch { return false; }
  });
  assert.deepEqual(offenders, [], 'bcrypt literals must be generated at runtime, not versioned');
});

test('smoke and dev seed consumers render the password marker before executing SQL', () => {
  const smoke = readFileSync(join(root, 'scripts/setup-local-lms-smoke-db.sh'), 'utf8');
  assert.match(smoke, /render-local-dev-password-sql[.]mjs" "[$]SEED_FILE"/);
  assert.doesNotMatch(smoke, /sqlite3 "[$]SQLITE_FILE" < "[$]SEED_FILE"/);
  const local = readFileSync(join(root, 'scripts/setup-local-db.sh'), 'utf8');
  assert.match(local, /render-local-dev-password-sql[.]mjs" "[$]SEED_FILE"/);
  assert.doesNotMatch(local, /sqlite3 "[$]SQLITE_FILE" < "[$]SEED_FILE"/);
  const remote = readFileSync(join(root, 'worker-airtrust/setup-dev-db.sh'), 'utf8');
  assert.match(remote, /render-local-dev-password-sql[.]mjs "[$]SEED_FILE"/);
  assert.doesNotMatch(remote, /--file "[$]SEED_FILE"/);
});
