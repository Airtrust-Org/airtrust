// source_reference: guard checks for staging/prod smoke URL policies and read-only smoke payload helpers.
// operational_decision: imports pure helpers only; no network, no deploy, no remote writes.
// dry_run_required: all assertions are local and deterministic.
// rollback_plan_required: no rollback needed; this test file is read-only.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertAllowedProductionBaseUrl,
  assertAllowedStagingBaseUrl,
  buildReadOnlyEndpointSpecs,
  normalizeBaseUrl,
} from '../smoke-auth-common.mjs';

test('production canonical host is accepted', () => {
  assert.equal(assertAllowedProductionBaseUrl('https://api.airtrust.online'), 'https://api.airtrust.online');
});

test('production fallback host is accepted', () => {
  assert.equal(
    assertAllowedProductionBaseUrl('https://airtrust-api-production.airtrust.workers.dev'),
    'https://airtrust-api-production.airtrust.workers.dev',
  );
});

test('blocked production alias is rejected', () => {
  assert.throws(() => assertAllowedProductionBaseUrl('https://airtrust-api.airtrust.workers.dev'), /nao pode apontar/i);
});

test('staging host is accepted', () => {
  assert.equal(
    assertAllowedStagingBaseUrl('https://airtrust-api-staging.airtrust.workers.dev'),
    'https://airtrust-api-staging.airtrust.workers.dev',
  );
});

test('production host is rejected by staging guard', () => {
  assert.throws(() => assertAllowedStagingBaseUrl('https://api.airtrust.online'), /deve apontar/i);
});

test('base URLs with path are rejected', () => {
  assert.throws(() => normalizeBaseUrl('https://api.airtrust.online/api', 'TEST_BASE_URL'), /raiz do host/i);
});

test('read-only auth/me helper redacts raw email from sample', () => {
  const [authMe] = buildReadOnlyEndpointSpecs('smoke.staging.test@example.invalid');
  const result = authMe.validate(
    {
      success: true,
      data: {
        id: 1,
        email: 'smoke.staging.test@example.invalid',
        role: 'ADMIN',
        nome: 'Smoke Staging Admin',
      },
    },
    { expectedEmail: 'smoke.staging.test@example.invalid' },
  );

  assert.equal(result.sample.emailMatchesSecret, true);
  assert.deepEqual(Object.keys(result.sample).sort(), ['emailMatchesSecret', 'role']);
});
