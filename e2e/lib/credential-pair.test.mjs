import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCredentialPair } from './credential-pair.mjs';

test('complete admin pair is used as-is', () => {
  const p = resolveCredentialPair({
    QA_ADMIN_EMAIL: 'a@staging.invalid',
    QA_ADMIN_PASSWORD: 'apass',
    E2E_EMAIL: 's@staging.invalid',
    E2E_PASSWORD: 'spass',
  });
  assert.deepEqual(p, { email: 'a@staging.invalid', password: 'apass', profile: 'admin' });
});

test('no admin values falls back to the smoke pair', () => {
  const p = resolveCredentialPair({ E2E_EMAIL: 's@staging.invalid', E2E_PASSWORD: 'spass' });
  assert.deepEqual(p, { email: 's@staging.invalid', password: 'spass', profile: 'smoke' });
});

test('admin email without admin password fails closed', () => {
  assert.throws(
    () => resolveCredentialPair({ QA_ADMIN_EMAIL: 'a@x', E2E_EMAIL: 's@x', E2E_PASSWORD: 'p' }),
    /QA_ADMIN_CREDENTIAL_PAIR_INCOMPLETE/,
  );
});

test('admin password without admin email fails closed', () => {
  assert.throws(
    () => resolveCredentialPair({ QA_ADMIN_PASSWORD: 'a', E2E_EMAIL: 's@x', E2E_PASSWORD: 'p' }),
    /QA_ADMIN_CREDENTIAL_PAIR_INCOMPLETE/,
  );
});

test('no usable pair at all fails closed', () => {
  assert.throws(() => resolveCredentialPair({}), /FRONTEND_PR_UI_QA_CREDENTIALS_MISSING/);
});

test('complete admin pair is accepted even when the smoke pair is absent (workflow parity)', () => {
  const p = resolveCredentialPair({ QA_ADMIN_EMAIL: 'a@x', QA_ADMIN_PASSWORD: 'apass' });
  assert.equal(p.profile, 'admin');
});

test('no admin values + complete smoke pair resolves to smoke', () => {
  const p = resolveCredentialPair({ E2E_EMAIL: 's@x', E2E_PASSWORD: 'spass' });
  assert.equal(p.profile, 'smoke');
});

test('admin pair is never mixed with smoke values', () => {
  const p = resolveCredentialPair({
    QA_ADMIN_EMAIL: 'a@x',
    QA_ADMIN_PASSWORD: 'apass',
  });
  assert.equal(p.email, 'a@x');
  assert.equal(p.password, 'apass');
});
