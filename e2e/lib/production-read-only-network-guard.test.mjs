import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProductionReadOnlyRequest } from './production-read-only-network-guard.mjs';

test('production guard permits production GET and authentication POST only', () => {
  assert.equal(
    classifyProductionReadOnlyRequest({
      method: 'GET',
      url: 'https://airtrust.online/treinamentos/compliance',
    }).decision,
    'allow',
  );
  assert.equal(
    classifyProductionReadOnlyRequest({
      method: 'GET',
      url: 'https://api.airtrust.online/api/compliance-treinamentos/resumo',
    }).decision,
    'allow',
  );
  assert.equal(
    classifyProductionReadOnlyRequest({
      method: 'POST',
      url: 'https://api.airtrust.online/api/auth/login',
    }).decision,
    'allow',
  );
  assert.equal(
    classifyProductionReadOnlyRequest({
      method: 'POST',
      url: 'https://api.airtrust.online/api/compliance-treinamentos/regras',
    }).decision,
    'block',
  );
  assert.equal(
    classifyProductionReadOnlyRequest({
      method: 'PUT',
      url: 'https://api.airtrust.online/api/compliance-treinamentos/regras/1',
    }).decision,
    'block',
  );
  assert.equal(
    classifyProductionReadOnlyRequest({ method: 'GET', url: 'https://evil.example/collect' })
      .decision,
    'block',
  );
});

test('production guard suppresses optional fonts and translation fallback', () => {
  assert.equal(
    classifyProductionReadOnlyRequest({
      method: 'GET',
      url: 'https://fonts.googleapis.com/css2?family=Inter',
    }).decision,
    'suppress',
  );
  assert.equal(
    classifyProductionReadOnlyRequest({
      method: 'POST',
      url: 'https://api.airtrust.online/api/public/translate',
    }).decision,
    'suppress',
  );
});
