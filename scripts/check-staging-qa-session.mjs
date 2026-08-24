#!/usr/bin/env node
// Narrow authenticated check used by ensure-staging-qa-session.sh. It reuses
// the sanctioned smoke auth primitives without executing unrelated domain
// regression assertions or printing credentials/tokens.
import {
  assert,
  assertAllowedStagingBaseUrl,
  decodeJwtPayload,
  extractAccessToken,
  fetchJson,
  login,
} from './smoke-auth-common.mjs';

const baseUrl = assertAllowedStagingBaseUrl(
  process.env.STAGING_API_BASE_URL || 'https://airtrust-api-staging.airtrust.workers.dev',
);
const email = String(process.env.STAGING_SMOKE_EMAIL || '').trim().toLowerCase();
const password = String(process.env.STAGING_SMOKE_PASSWORD || '');
const expectedEmpresaId = Number(process.env.STAGING_SMOKE_EMPRESA_ID || '999002');

try {
  assert(email && password, 'credenciais QA de staging ausentes');
  assert(Number.isInteger(expectedEmpresaId) && expectedEmpresaId > 0, 'tenant QA esperado invalido');
  const loginPayload = await login(baseUrl, email, password);
  const accessToken = extractAccessToken(loginPayload);
  const claims = decodeJwtPayload(accessToken);
  assert(claims && String(claims.email || '').toLowerCase() === email, 'identidade autenticada divergente');
  assert(Number(claims.empresa_id) === expectedEmpresaId, 'tenant QA divergente');
  const role = String(claims.role || '').toLowerCase();
  assert(role === 'admin' || role === 'administrador', 'RBAC QA sem administracao');
  const me = await fetchJson(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  assert(me.status === 200, `auth/me retornou ${me.status}`);
  const courses = await fetchJson(`${baseUrl}/api/lms/cursos`, { headers: { Authorization: `Bearer ${accessToken}` } });
  assert(courses.status === 200, `LMS cursos retornou ${courses.status}`);
  process.stdout.write('STAGING_QA_AUTH_TENANT_RBAC_OK\n');
} catch (error) {
  process.stderr.write(`STAGING_QA_AUTH_TENANT_RBAC_FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
