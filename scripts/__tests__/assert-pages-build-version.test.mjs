import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertBuildVersion, extractBuildVersion } from '../ci/assert-pages-build-version.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const SCRIPT = 'scripts/ci/assert-pages-build-version.mjs';
const EXPECTED = '2026-08-29T00:06:35Z-a57694e';
const htmlWith = (v) =>
  `<!doctype html><html><head><meta name="build-version" content="${v}" /></head><body></body></html>`;

test('1. expected == observed => PASS', () => {
  const r = assertBuildVersion({ expected: EXPECTED, html: htmlWith(EXPECTED) });
  assert.equal(r.ok, true);
  assert.equal(r.code, 'PAGES_BUILD_VERSION_OK');
  const out = execFileSync(process.execPath, [SCRIPT, '--expected', EXPECTED, '--html', htmlWith(EXPECTED)], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /PAGES_BUILD_VERSION_OK/);
});

test('2. expected != observed => FAIL', () => {
  const r = assertBuildVersion({ expected: EXPECTED, html: htmlWith('2026-08-28T21:12:00Z-76ee1b7') });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PAGES_BUILD_VERSION_MISMATCH');
  assert.equal(r.observed, '2026-08-28T21:12:00Z-76ee1b7');
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [SCRIPT, '--expected', EXPECTED, '--html', htmlWith('2026-08-28T21:12:00Z-76ee1b7')],
        { cwd: ROOT, stdio: 'pipe' },
      ),
    (err) => {
      assert.equal(err.status, 1);
      assert.match(String(err.stderr), /PAGES_BUILD_VERSION_MISMATCH/);
      return true;
    },
  );
});

test('3. build-version absent => FAIL', () => {
  const bare = '<!doctype html><html><head><title>AirTrust</title></head><body></body></html>';
  assert.equal(extractBuildVersion(bare), null);
  const r = assertBuildVersion({ expected: EXPECTED, html: bare });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PAGES_BUILD_VERSION_MISSING');
  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT, '--expected', EXPECTED, '--html', bare], { cwd: ROOT, stdio: 'pipe' }),
    (err) => {
      assert.equal(err.status, 1);
      assert.match(String(err.stderr), /PAGES_BUILD_VERSION_MISSING/);
      return true;
    },
  );
});

test('empty expected is a usage error (exit 2), never a silent pass', () => {
  const r = assertBuildVersion({ expected: '', html: htmlWith(EXPECTED) });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'EXPECTED_REQUIRED');
});

test('the production Pages smoke step enforces equality against APP_VERSION', () => {
  const workflow = readWorkflow();
  const smoke = workflow.slice(workflow.indexOf('name: Smoke Pages'));
  assert.match(smoke, /assert-pages-build-version\.mjs/);
  assert.match(smoke, /--expected "\$\{APP_VERSION\}"|--expected "\$APP_VERSION"/);
  assert.match(smoke, /APP_VERSION:\s*\$\{\{\s*needs\.guard\.outputs\.app_version\s*\}\}/);
  // the old existence-only gate must be gone
  assert.doesNotMatch(
    smoke.slice(0, smoke.indexOf('name: Write pages summary')),
    /if grep -q 'build-version'/,
  );
});

import { readFileSync } from 'node:fs';
function readWorkflow() {
  return readFileSync(path.join(ROOT, '.github/workflows/deploy-airtrust.yml'), 'utf8');
}
