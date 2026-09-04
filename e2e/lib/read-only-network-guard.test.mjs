import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyRequest } from './read-only-network-guard.mjs';

const STG = 'https://airtrust-api-staging.airtrust.workers.dev';
const STG_PAGES = 'https://staging.airtrust.pages.dev';
const PROD_API = 'https://api.airtrust.online';
const PROD_WORKER = 'https://airtrust-api.airtrust.workers.dev';
const PROD_PAGES = 'https://airtrust.pages.dev';

test('GET / HEAD / OPTIONS to staging are allowed', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(classifyRequest({ method, url: `${STG}/api/funcionarios` }).decision, 'allow');
  }
  assert.equal(
    classifyRequest({ method: 'GET', url: `${STG_PAGES}/assets/app.js` }).decision,
    'allow',
  );
});

test('GET to a production host is blocked (host checked before method)', () => {
  const r = classifyRequest({ method: 'GET', url: `${PROD_API}/api/funcionarios` });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /production-host:GET/);
});

test('HEAD to a production host is blocked', () => {
  const r = classifyRequest({ method: 'HEAD', url: `${PROD_PAGES}/` });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /production-host:HEAD/);
});

test('GET to airtrust.online subdomain is blocked', () => {
  assert.equal(
    classifyRequest({ method: 'GET', url: 'https://cdn.airtrust.online/x.js' }).decision,
    'block',
  );
  assert.equal(
    classifyRequest({ method: 'OPTIONS', url: `${PROD_WORKER}/api/version` }).decision,
    'block',
  );
});

test('auth POST is allowed only on an explicit staging host', () => {
  assert.equal(classifyRequest({ method: 'POST', url: `${STG}/api/auth/login` }).decision, 'allow');
  assert.equal(
    classifyRequest({ method: 'POST', url: `${STG}/api/auth/refresh` }).decision,
    'allow',
  );
  assert.equal(
    classifyRequest({ method: 'POST', url: `${STG_PAGES}/api/auth/login` }).decision,
    'allow',
  );
});

test('auth POST on evil.example is blocked', () => {
  const r = classifyRequest({ method: 'POST', url: 'https://evil.example/api/auth/login' });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /auth-post-untrusted-host/);
});

test('auth POST on a production host is blocked', () => {
  const r = classifyRequest({ method: 'POST', url: `${PROD_API}/api/auth/login` });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /production-host:POST/);
});

test('a non-allowlisted operational POST to staging is blocked', () => {
  const r = classifyRequest({ method: 'POST', url: `${STG}/api/documentos/1` });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /operational-post/);
});

test('a POST to a sibling of /api/auth/login is not widened', () => {
  assert.equal(
    classifyRequest({ method: 'POST', url: `${STG}/api/auth/login-as-other-tenant` }).decision,
    'block',
  );
});

test('DELETE / PATCH / PUT are always blocked', () => {
  for (const method of ['DELETE', 'PATCH', 'PUT']) {
    const r = classifyRequest({ method, url: `${STG}/api/documentos/42` });
    assert.equal(r.decision, 'block', method);
    assert.match(r.reason, /mutation-method/);
  }
});
