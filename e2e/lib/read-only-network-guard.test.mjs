import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyRequest } from './read-only-network-guard.mjs';

const API = 'https://airtrust-api-staging.airtrust.workers.dev';

test('GET / HEAD / OPTIONS are always allowed', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(classifyRequest({ method, url: `${API}/api/funcionarios` }).decision, 'allow');
  }
  assert.equal(
    classifyRequest({ method: 'GET', url: 'https://staging.airtrust.pages.dev/assets/app.js' })
      .decision,
    'allow',
  );
});

test('login and refresh POSTs are allowed only because they are allowlisted', () => {
  assert.equal(classifyRequest({ method: 'POST', url: `${API}/api/auth/login` }).decision, 'allow');
  assert.equal(
    classifyRequest({ method: 'POST', url: `${API}/api/auth/refresh` }).decision,
    'allow',
  );
  assert.equal(
    classifyRequest({ method: 'POST', url: `${API}/api/auth/empresas/select` }).decision,
    'allow',
  );
});

test('a non-allowlisted operational POST is blocked', () => {
  const r = classifyRequest({ method: 'POST', url: `${API}/api/simuladores/categorias` });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /operational-post/);
});

test('DELETE / PATCH / PUT are always blocked', () => {
  for (const method of ['DELETE', 'PATCH', 'PUT']) {
    const r = classifyRequest({ method, url: `${API}/api/simuladores/categorias/42` });
    assert.equal(r.decision, 'block', method);
    assert.match(r.reason, /mutation-method/);
  }
});

test('a POST to /api/auth/login on a sibling path is not silently widened', () => {
  const r = classifyRequest({ method: 'POST', url: `${API}/api/auth/login-as-other-tenant` });
  assert.equal(r.decision, 'block');
});

test('phase does not relax the mutation rules', () => {
  assert.equal(
    classifyRequest({ method: 'POST', url: `${API}/api/funcionarios`, phase: 'pre-auth' }).decision,
    'block',
  );
});
