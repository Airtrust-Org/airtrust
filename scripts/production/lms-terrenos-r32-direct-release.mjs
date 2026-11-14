#!/usr/bin/env node
/**
 * One exact tenant/course/ZIP replacement using the existing admin-only
 * server-side Quality Gate and transactional /scorm-replace endpoint.
 *
 * The script never writes a matricula, SCORM CMI, approval, or qualification.
 * No admin credential, token, course content or learner data is printed.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  assertAllowedProductionBaseUrl, extractAccessToken, fetchJson, login,
} from '../smoke-auth-common.mjs';

const SHA = /^[a-f0-9]{64}$/;
export const TARGET = Object.freeze({ empresaId: 6, cursoId: 9, matriculaId: 1215 });
const api = assertAllowedProductionBaseUrl('https://api.airtrust.online');
const fail = code => { throw new Error(code); };
const required = (ok, code) => { if (!ok) fail(code); };
const expectedZip = String(process.env.ZIP_SHA || '').trim().toLowerCase();
const previous = String(process.env.PREVIOUS_ZIP_SHA || '').trim().toLowerCase();
const expectedWorker = String(process.env.EXPECTED_WORKER_SHA || '').trim().toLowerCase();
const file = String(process.env.PRIVATE_ZIP_FILE || '').trim();
const mode = process.env.REPLACEMENT_MODE === 'apply' ? 'apply' : 'preflight';
const noSecretLog = (label, obj) => {
  console.log(label, JSON.stringify(obj));
};
async function call(token, path, options = {}) {
  const response = await fetch(api + path, {
    ...options, headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) },
    signal: AbortSignal.timeout(120000),
    cache: 'no-store',
  });
  let body;
  try { body = await response.json(); } catch { body = null; }
  return { status: response.status, body };
}
async function main() {
  required(SHA.test(expectedZip) && SHA.test(previous), 'PACKAGE_SHA_INPUT_INVALID');
  required(/^[a-f0-9]{40}$/.test(expectedWorker), 'EXPECTED_WORKER_SHA_INVALID');
  required(process.env.CONFIRMATION === 'AIRTRUST_TENANT6_COURSE9_R32_DIRECT', 'EXACT_CONFIRMATION_REQUIRED');
  const prod = await fetchJson(api + '/api/version');
  required(prod.status === 200, 'PRODUCTION_VERSION_NOT_AVAILABLE');
  const live = String(prod.json?.data?.sourceSha || prod.json?.sourceSha || '').toLowerCase();
  required(live === expectedWorker, 'PRODUCTION_WORKER_SHA_CHANGED');
  const email = String(process.env.PROD_SMOKE_EMAIL || '').trim();
  const password = String(process.env.PROD_SMOKE_PASSWORD || '');
  required(Boolean(email && password), 'PRODUCTION_ADMIN_CREDENTIALS_UNAVAILABLE');
  let token = extractAccessToken(await login(api, email, password));
  required(Boolean(token), 'ADMIN_TOKEN_UNAVAILABLE');
  const companies = await call(token, '/api/auth/empresas');
  required(companies.status === 200, 'COMPANY_SCOPE_UNAVAILABLE');
  const list = companies.body?.data?.empresas;
  required(Array.isArray(list) && list.some(e => Number(e?.id) === TARGET.empresaId), 'TENANT6_NOT_AUTHORIZED');
  if (Number(companies.body?.data?.empresaAtualId) !== TARGET.empresaId) {
    const selected = await call(token, '/api/auth/select-empresa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresaId: TARGET.empresaId }),
    });
    required(selected.status === 200 && selected.body?.data?.accessToken, 'TENANT6_SELECT_FAILED');
    token = selected.body.data.accessToken;
  }
  const me = await call(token, '/api/auth/me');
  required(me.status === 200 && ['admin', 'administrador'].includes(String(me.body?.data?.role || '').toLowerCase()),
    'ADMIN_ROLE_REQUIRED');
  const listing = await call(token, '/api/lms/cursos/9/scorm-package-versions');
  required(listing.status === 200 && listing.body?.success === true, 'SCORM_EDITION_LIST_UNAVAILABLE');
  const raw = listing.body?.data;
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.versions) ? raw.versions
    : Array.isArray(raw?.packages) ? raw.packages : Array.isArray(raw?.items) ? raw.items : [];
  required(rows.length > 0, 'EDITION_LIST_UNEXPECTED_SHAPE');
  const active = rows.find(v => String(v.status).toUpperCase() === 'ACTIVE');
  required(Boolean(active), 'ACTIVE_EDITION_NOT_FOUND');
  const activeSha = String(active.package_sha256 || active.packageSha256 || '').toLowerCase();
  const activeId = String(active.packageId || active.id || '');
  required(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(activeId), 'ACTIVE_PACKAGE_ID_UNAVAILABLE');
  if (activeSha === expectedZip) {
    noSecretLog('ALREADY_APPLIED', { courseId: TARGET.cursoId, sha: expectedZip, status: 'ACTIVE' });
    return;
  }
  required(activeSha === previous, 'ACTIVE_EDITION_CHANGED');
  noSecretLog('PREFLIGHT', { courseId: TARGET.cursoId, tenant: TARGET.empresaId,
    activeSha, incomingSha: expectedZip, runtimeSha: live, mode });
  if (mode !== 'apply') return;
  const bytes = await readFile(file);
  required(bytes.length > 1000 && bytes.length < 32 * 1024 * 1024, 'ZIP_SIZE_INVALID');
  required(createHash('sha256').update(bytes).digest('hex') === expectedZip, 'ZIP_SHA_MISMATCH');
  // The browser uses the same official endpoint. The Worker owns validation,
  // tenant RBAC, impact acknowledgement, CAS, and edition audit.
  const form = new FormData();
  form.set('arquivo', new Blob([bytes], { type: 'application/zip' }), 'Operacoes_Terrenos_Desabitados_R32.zip');
  const result = await call(token, '/api/lms/cursos/9/scorm-replace?confirm=REPLACE_AFTER_VALIDATION', {
    method: 'POST', body: form,
    headers: { 'X-Airtrust-Expected-Active-Package-Id': activeId },
  });
  if (result.status !== 200 || result.body?.success !== true) {
    const code = String(result.body?.code || result.body?.error_code || 'UNKNOWN').replace(/[^A-Z_0-9-]/gi,'').slice(0,80);
    fail('SCORM_REPLACEMENT_REJECTED_HTTP_' + result.status + '_' + code);
  }
  const data = result.body?.data || {};
  required(String(data.packageSha256 || '').toLowerCase() === expectedZip &&
    data.status === 'ACTIVE' && String(data.assessmentPolicy) === 'FORMATIVE', 'ACTIVATION_RECEIPT_INCONSISTENT');
  const verified = await call(token, '/api/lms/cursos/9/scorm-package-versions');
  required(verified.status === 200 && verified.body?.success === true, 'POST_ACTIVATION_READBACK_FAILED');
  const rows2 = Array.isArray(verified.body?.data) ? verified.body.data
    : verified.body?.data?.versions || verified.body?.data?.packages || verified.body?.data?.items || [];
  const active2 = rows2.find(v => String(v.status).toUpperCase() === 'ACTIVE');
  required(String(active2?.package_sha256 || active2?.packageSha256 || '').toLowerCase() === expectedZip,
    'ACTIVATION_NOT_VISIBLE');
  noSecretLog('SUCCESS', { courseId: TARGET.cursoId, tenant: TARGET.empresaId,
    packageSha256: expectedZip, policy: 'FORMATIVE', status: 'ACTIVE',
    impactedInProgress: data.impactedInProgress ?? null });
}

if (import.meta.url === new URL('file://' + process.argv[1]).href) {
  main().catch(error => { const message=String(error?.message||'UNKNOWN'); console.error('FAIL', /^[A-Z0-9_-]{3,160}$/.test(message) ? message : 'UNEXPECTED_EXECUTOR_ERROR'); process.exitCode=1; });
}
