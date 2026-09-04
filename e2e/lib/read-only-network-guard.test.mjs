import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyRequest, STAGING_HOST_ALLOWLIST } from './read-only-network-guard.mjs';

const STG = 'https://airtrust-api-staging.airtrust.workers.dev';
const STG_PAGES = 'https://staging.airtrust.pages.dev';
const PROD_API = 'https://api.airtrust.online';
const PROD_WORKER = 'https://airtrust-api.airtrust.workers.dev';
const PROD_PAGES = 'https://airtrust.pages.dev';
const EVIL = 'https://attacker.example';

test('the canonical allowlist is exactly the two staging hosts', () => {
  assert.deepEqual([...STAGING_HOST_ALLOWLIST].sort(), [
    'airtrust-api-staging.airtrust.workers.dev',
    'staging.airtrust.pages.dev',
  ]);
});

test('GET staging frontend (Pages) is allowed', () => {
  assert.equal(classifyRequest({ method: 'GET', url: `${STG_PAGES}/assets/app.js` }).decision, 'allow');
});

test('GET staging Worker API is allowed', () => {
  assert.equal(classifyRequest({ method: 'GET', url: `${STG}/api/funcionarios` }).decision, 'allow');
});

test('GET / HEAD / OPTIONS to staging are allowed', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(classifyRequest({ method, url: `${STG}/api/funcionarios` }).decision, 'allow');
  }
});

test('GET attacker.example is blocked (non-allowlisted host)', () => {
  const r = classifyRequest({ method: 'GET', url: `${EVIL}/collect?token=abc` });
  assert.equal(r.decision, 'block');
  assert.equal(r.reason, 'NETWORK_HOST_NOT_ALLOWLISTED:attacker.example');
});

test('HEAD attacker.example is blocked', () => {
  const r = classifyRequest({ method: 'HEAD', url: `${EVIL}/ping` });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /NETWORK_HOST_NOT_ALLOWLISTED:attacker\.example/);
});

test('OPTIONS attacker.example is blocked', () => {
  const r = classifyRequest({ method: 'OPTIONS', url: `${EVIL}/` });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /NETWORK_HOST_NOT_ALLOWLISTED/);
});

test('GET a production host is blocked with the priority PRODUCTION_HOST_BLOCKED reason', () => {
  const r = classifyRequest({ method: 'GET', url: `${PROD_API}/api/funcionarios` });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /^PRODUCTION_HOST_BLOCKED:GET/);
});

test('HEAD / OPTIONS to production hosts are blocked with PRODUCTION_HOST_BLOCKED', () => {
  assert.match(
    classifyRequest({ method: 'HEAD', url: `${PROD_PAGES}/` }).reason,
    /^PRODUCTION_HOST_BLOCKED:HEAD/,
  );
  assert.match(
    classifyRequest({ method: 'OPTIONS', url: `${PROD_WORKER}/api/version` }).reason,
    /^PRODUCTION_HOST_BLOCKED:OPTIONS/,
  );
});

test('production takes priority over the generic not-allowlisted reason', () => {
  const r = classifyRequest({ method: 'GET', url: 'https://cdn.airtrust.online/x.js' });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /^PRODUCTION_HOST_BLOCKED/);
  assert.doesNotMatch(r.reason, /NOT_ALLOWLISTED/);
});

test('an unparseable request URL is blocked fail-closed', () => {
  const r = classifyRequest({ method: 'GET', url: 'not a URL' });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /request-host-unparseable:GET/);
});

test('auth POST is allowed on an allowlisted staging host', () => {
  assert.equal(classifyRequest({ method: 'POST', url: `${STG}/api/auth/login` }).decision, 'allow');
  assert.equal(classifyRequest({ method: 'POST', url: `${STG}/api/auth/refresh` }).decision, 'allow');
  assert.equal(
    classifyRequest({ method: 'POST', url: `${STG_PAGES}/api/auth/login` }).decision,
    'allow',
  );
});

test('auth POST on attacker.example is blocked (host not allowlisted)', () => {
  const r = classifyRequest({ method: 'POST', url: `${EVIL}/api/auth/login` });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /NETWORK_HOST_NOT_ALLOWLISTED:attacker\.example/);
});

test('auth POST on a production host is blocked with PRODUCTION_HOST_BLOCKED', () => {
  const r = classifyRequest({ method: 'POST', url: `${PROD_API}/api/auth/login` });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /^PRODUCTION_HOST_BLOCKED:POST/);
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

test('DELETE to staging is blocked', () => {
  const r = classifyRequest({ method: 'DELETE', url: `${STG}/api/documentos/42` });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /mutation-method:DELETE/);
});

test('DELETE / PATCH / PUT are always blocked', () => {
  for (const method of ['DELETE', 'PATCH', 'PUT']) {
    const r = classifyRequest({ method, url: `${STG}/api/documentos/42` });
    assert.equal(r.decision, 'block', method);
    assert.match(r.reason, /mutation-method/);
  }
});
