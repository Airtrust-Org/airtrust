// source_reference: scripts/audit-dangerous-ops.sh — Guard 6 (self-protected
// invariant validation). The guard exempts ~17 production-adjacent scripts
// from Guard 3 (direct remote D1 execution) by PATH. This test proves that the
// exemption is now resilient: if the real protection is removed or weakened,
// the guard FAILS instead of silently passing on a stale path allowlist.
// operational_decision: real mutation testing — each protection is mutated one
// at a time in a temp fixture and the guard is run against that fixture. No
// wrangler, no network, no real database is ever touched.
// dry_run_required: all assertions are local, deterministic, filesystem-only.
// rollback_plan_required: none — fixtures live in os.tmpdir() and are removed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const GUARD = path.join('scripts', 'audit-dangerous-ops.sh');

function runGuard(args, { cwd = REPO_ROOT } = {}) {
  try {
    const stdout = execFileSync('bash', [GUARD, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: typeof error.status === 'number' ? error.status : 1,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? ''),
    };
  }
}

function checkSelfProtected(canonical, fixture) {
  return runGuard(['--check-self-protected', canonical, fixture]);
}

function listSelfProtectedFiles() {
  const { code, stdout } = runGuard(['--list-self-protected-files']);
  assert.equal(code, 0, 'listing self-protected files must succeed');
  return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}

function listInvariants(canonical) {
  const { code, stdout } = runGuard(['--print-self-protected-invariants', canonical]);
  assert.equal(code, 0, `listing invariants for ${canonical} must succeed`);
  return stdout.split('\n').filter((l) => l.length > 0);
}

// Turn an anchor literal into a string that no longer matches it, so that
// removing/renaming that single protection makes the anchor disappear.
function scramble(anchor) {
  return `__REMOVED_PROTECTION__${anchor.replace(/[A-Za-z]/g, 'x')}`;
}

function withFixture(canonical, mutate, fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-protected-'));
  try {
    const original = fs.readFileSync(path.join(REPO_ROOT, canonical), 'utf8');
    const fixture = path.join(tmpDir, path.basename(canonical));
    fs.writeFileSync(fixture, mutate(original));
    return fn(fixture);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const selfProtectedFiles = listSelfProtectedFiles();

test('there are self-protected files to validate', () => {
  assert.ok(selfProtectedFiles.length >= 15, `expected the full allowlist, got ${selfProtectedFiles.length}`);
});

test('the full guard passes on the real (unmutated) tree', () => {
  const { code, stdout } = runGuard([]);
  assert.equal(code, 0, `guard must pass on HEAD; stdout:\n${stdout}`);
  assert.match(stdout, /RESULT: PASS/);
});

// Baseline: every real self-protected file passes its own invariant check.
for (const canonical of selfProtectedFiles) {
  test(`baseline PASS: ${canonical}`, () => {
    withFixture(canonical, (c) => c, (fixture) => {
      const { code, stdout, stderr } = checkSelfProtected(canonical, fixture);
      assert.equal(code, 0, `expected PASS for unmutated ${canonical}; out:\n${stdout}${stderr}`);
    });
  });
}

// Mutation: removing ANY single required protection must FAIL the guard.
let mutationCount = 0;
for (const canonical of selfProtectedFiles) {
  const invariants = listInvariants(canonical);
  assert.ok(invariants.length > 0, `${canonical} must declare at least one invariant`);
  for (const anchor of invariants) {
    mutationCount += 1;
    test(`mutation FAIL: ${canonical} :: remove "${anchor}"`, () => {
      withFixture(
        canonical,
        (content) => content.split(anchor).join(scramble(anchor)),
        (fixture) => {
          const { code, stdout, stderr } = checkSelfProtected(canonical, fixture);
          assert.equal(
            code,
            1,
            `guard must FAIL when "${anchor}" is removed from ${canonical}; out:\n${stdout}${stderr}`,
          );
          assert.match(stdout + stderr, /RESULT: FAIL/);
        },
      );
    });
  }
}

test('mutation coverage matches the declared invariants', () => {
  const expected = selfProtectedFiles.reduce((sum, c) => sum + listInvariants(c).length, 0);
  assert.equal(mutationCount, expected, 'every declared invariant must have a mutation test');
});

// Approach B (hash pinning): a gate weakened WITHOUT removing an anchor literal
// — flipping the comparison operator — must still FAIL via the fingerprint pin.
test('pin FAIL: apply-migration-production.sh gate operator flip (!= -> ==)', () => {
  const canonical = 'scripts/apply-migration-production.sh';
  withFixture(
    canonical,
    (content) => content.replace('"${AIRTRUST_ALLOW_PROD_DB_WRITE:-}" != "YES"', '"${AIRTRUST_ALLOW_PROD_DB_WRITE:-}" == "YES"'),
    (fixture) => {
      const { code, stdout, stderr } = checkSelfProtected(canonical, fixture);
      assert.equal(code, 1, 'operator flip must FAIL');
      assert.match(stdout + stderr, /pin mismatch/);
    },
  );
});

test('pin FAIL: sync-d1-production-sanitized.sh confirm-string gate flip', () => {
  const canonical = 'scripts/sync-d1-production-sanitized.sh';
  withFixture(
    canonical,
    // Weaken the exact-confirmation comparison while keeping the anchor literal
    // (the CONFIRM_SYNC_TEXT assignment) present in the file.
    (content) => content.replace('== "$CONFIRM_SYNC_TEXT"', '!= "$CONFIRM_SYNC_TEXT"'),
    (fixture) => {
      const { code, stdout, stderr } = checkSelfProtected(canonical, fixture);
      assert.equal(code, 1, 'confirm-gate flip must FAIL');
      assert.match(stdout + stderr, /pin mismatch/);
    },
  );
});

// Approach C (forbidden bypass tokens): smuggling in an override for the NO_GO
// hard block must FAIL even though every required anchor is still present.
for (const token of ['SKIP_NO_GO', 'FORCE_NO_GO', 'OVERRIDE_NO_GO', 'ALLOW_NO_GO', 'BYPASS_NO_GO']) {
  test(`bypass FAIL: apply-migration-production.sh introduces ${token}`, () => {
    const canonical = 'scripts/apply-migration-production.sh';
    withFixture(
      canonical,
      (content) => `${content}\nif [[ "\${${token}:-}" == 1 ]]; then :; fi\n`,
      (fixture) => {
        const { code, stdout, stderr } = checkSelfProtected(canonical, fixture);
        assert.equal(code, 1, `${token} must FAIL`);
        assert.match(stdout + stderr, /bypass token/);
      },
    );
  });
}

// A file added to the allowlist without declared invariants must be rejected,
// so nobody can re-introduce blind path trust.
test('a self-protected path without declared invariants is rejected', () => {
  const { code, stdout, stderr } = runGuard([
    '--check-self-protected',
    'scripts/some-unknown-not-declared.sh',
    path.join(REPO_ROOT, GUARD),
  ]);
  assert.equal(code, 1);
  assert.match(stdout + stderr, /no declared invariants/);
});
