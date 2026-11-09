import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  APPLY_CONFIRMATION, DRY_RUN_CONFIRMATION, assertGates, parseArgs,
} from '../production/qualification-expiry-legacy-governed-executor.mjs';

const script = fileURLToPath(new URL('../production/qualification-expiry-legacy-governed-executor.mjs', import.meta.url));
const HASH = 'c'.repeat(64);
const base = ['--manifest=/var/tmp/plan.json', `--expected-plan-hash=${HASH}`, '--expected-count=3'];

function cli(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8', env: { PATH: process.env.PATH, ...env },
  });
}

test('defaults to dry-run and rejects unknown, duplicate or incomplete arguments', () => {
  assert.equal(parseArgs(base).apply, false);
  assert.throws(() => parseArgs([...base, '--write']), /UNRECOGNIZED_OR_DUPLICATE_ARGUMENT/);
  assert.throws(() => parseArgs([...base, '--expected-count=4']), /UNRECOGNIZED_OR_DUPLICATE_ARGUMENT/);
  assert.throws(() => parseArgs([...base, '--apply', '--apply']), /UNRECOGNIZED_OR_DUPLICATE_ARGUMENT/);
  assert.throws(() => parseArgs([...base, '--apply=yes']), /UNRECOGNIZED_OR_DUPLICATE_ARGUMENT/);
  assert.throws(() => parseArgs([...base, '--direction=rollback', '--direction=forward']), /UNRECOGNIZED_OR_DUPLICATE_ARGUMENT/);
  assert.throws(() => parseArgs(base.slice(1)), /MANIFEST_REQUIRED/);
  assert.throws(() => parseArgs(['--manifest=/var/tmp/p.json', '--expected-count=3']), /EXPECTED_PLAN_HASH_REQUIRED/);
  assert.throws(() => parseArgs(['--manifest=/var/tmp/p.json', `--expected-plan-hash=${HASH}`]), /EXPECTED_COUNT_REQUIRED/);
  assert.throws(() => parseArgs(['--manifest=relative.json', ...base.slice(1)]), /PATH_MUST_BE_ABSOLUTE_OUTSIDE_REPO/);
  assert.throws(() => parseArgs([...base, '--direction=rollback', '--emit-rollback=/var/tmp/r.json']), /EMIT_ROLLBACK_ONLY_FORWARD/);
});

test('apply is impossible without every explicit gate', () => {
  const apply = parseArgs([...base, '--apply']);
  assert.throws(() => assertGates(apply, {}), /EXPLICIT_CONFIRMATION_REQUIRED/);
  assert.throws(() => assertGates(apply, { AIRTRUST_EXPIRY_EXECUTOR_CONFIRMATION: DRY_RUN_CONFIRMATION }), /EXPLICIT_CONFIRMATION_REQUIRED/);
  const env = { AIRTRUST_EXPIRY_EXECUTOR_CONFIRMATION: APPLY_CONFIRMATION };
  assert.throws(() => assertGates(apply, env), /RECOVERY_POINT_ATTESTATION_REQUIRED/);
  assert.throws(() => assertGates(apply, { ...env, AIRTRUST_EXPIRY_RECOVERY_READY: 'yes' }), /ACTOR_REQUIRED/);
  assert.throws(
    () => assertGates(apply, { ...env, AIRTRUST_EXPIRY_RECOVERY_READY: 'yes', AIRTRUST_EXPIRY_ACTOR: 'owner', EXPECTED_SOURCE_SHA: 'd'.repeat(40) }),
    /SOURCE_SHA_MISMATCH/,
  );
});

test('dry-run confirmation does not unlock apply and the process refuses before any database access', () => {
  const noEnv = cli([...base, '--apply']);
  assert.equal(noEnv.status, 1);
  assert.match(noEnv.stderr, /EXPLICIT_CONFIRMATION_REQUIRED/);
  const dryRunEnvApply = cli([...base, '--apply'], { AIRTRUST_EXPIRY_EXECUTOR_CONFIRMATION: DRY_RUN_CONFIRMATION });
  assert.equal(dryRunEnvApply.status, 1);
  assert.match(dryRunEnvApply.stderr, /EXPLICIT_CONFIRMATION_REQUIRED/);
});
