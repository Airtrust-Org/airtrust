#!/usr/bin/env node

import {
  assert,
  assertAllowedStagingBaseUrl,
  assertArrayPayload,
  decodeJwtPayload,
  extractAccessToken,
  fetchJson,
  login,
  selectEmpresa,
} from '../smoke-auth-common.mjs';

const API = assertAllowedStagingBaseUrl(
  process.env.STAGING_API_BASE_URL || 'https://airtrust-api-staging.airtrust.workers.dev',
);
const EMAIL = String(process.env.QA_LMS_STUDENT_EMAIL || '').trim().toLowerCase();
const PASSWORD = String(process.env.QA_LMS_STUDENT_PASSWORD || '');
const TENANT_CODE = 'qa_lms_catalog_audit_smoke';

async function main() {
  assert(EMAIL && PASSWORD, 'QA_LMS_STUDENT_CREDENTIALS_MISSING');
  const version = await fetchJson(`${API}/api/version`);
  assert(version.status === 200, `STAGING_VERSION_HTTP_${version.status}`);

  const session = await login(API, EMAIL, PASSWORD);
  let token = extractAccessToken(session);
  const memberships = await fetchJson(`${API}/api/auth/empresas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(memberships.status === 200, `STUDENT_COMPANIES_HTTP_${memberships.status}`);
  const companies = memberships.json?.data?.empresas;
  assert(Array.isArray(companies), 'STUDENT_COMPANIES_SHAPE_INVALID');
  assert(companies.length === 1, 'STUDENT_MUST_HAVE_ONLY_DEDICATED_QA_TENANT');
  const tenant = companies.find((item) => item?.codigo === TENANT_CODE);
  assert(tenant && Number(tenant.id) > 0, 'STUDENT_QA_TENANT_MISSING');
  assert(String(tenant.role).toLowerCase() === 'student', 'STUDENT_TENANT_ROLE_INVALID');

  const currentTenantId = Number(memberships.json?.data?.empresaAtualId || 0);
  if (currentTenantId !== Number(tenant.id)) {
    const switched = await selectEmpresa(API, token, Number(tenant.id));
    assert(switched.status === 200, `STUDENT_TENANT_SWITCH_HTTP_${switched.status}`);
    token = extractAccessToken(switched.json);
  }

  const claims = decodeJwtPayload(token);
  assert(Number(claims?.funcionario_id) > 0, 'STUDENT_EMPLOYEE_LINK_MISSING');

  const me = await fetchJson(`${API}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(me.status === 200, `STUDENT_ME_HTTP_${me.status}`);
  assert(String(me.json?.data?.role).toLowerCase() === 'student', 'STUDENT_EFFECTIVE_ROLE_INVALID');

  const catalog = await fetchJson(`${API}/api/lms/cursos?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(catalog.status === 200, `STUDENT_CATALOG_HTTP_${catalog.status}`);
  const courses = assertArrayPayload(catalog.json, 'lms/cursos');
  process.stdout.write(
    `${JSON.stringify({
      result: 'QA_LMS_STUDENT_READY',
      environment: 'staging',
      role: 'student',
      employee_link: true,
      isolated_tenant: true,
      catalog_access: 'read_only',
      visible_course_count: courses.length,
      production_target_used: false,
    })}\n`,
  );
}

main().catch((error) => {
  const message = String(error?.message || error).replace(/[\r\n]/g, ' ').slice(0, 240);
  process.stderr.write(`LMS_AUDIT_STUDENT_READINESS_FAILED: ${message}\n`);
  process.exitCode = 1;
});
