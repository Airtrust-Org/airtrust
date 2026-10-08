#!/usr/bin/env node
/**
 * Read-only, tenant-scoped production LMS completion outcomes.
 * Deliberately emits only per-course aggregates; no learner IDs, names, emails,
 * individual dates, certificates, CMI values, R2 keys or enrollment payloads.
 */
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  assertAllowedProductionBaseUrl,
  extractAccessToken,
  fetchJson,
  login,
} from '../smoke-auth-common.mjs';

const API = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online');
const COMPANY_ID = Number(process.env.TARGET_COMPANY_ID || 6);
const PINNED_SHA = String(process.env.EXPECTED_PRODUCTION_SHA || '').trim().toLowerCase();
const MAX_COURSE_PAGES = 100;
const LIMIT = 200;

function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}
function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
export function aggregateEnrollments(rows) {
  const out = {
    matriculas: 0, concluidas: 0, sem_conclusao: 0,
    pendentes_99_ou_mais: 0, pendentes_100_bruto: 0,
    pendentes_95_a_98: 0, concluido_sem_data: 0,
  };
  for (const row of rows) {
    const status = String(row?.status || '').trim().toUpperCase();
    const raw = Math.max(0, asNumber(row?.progresso_bruto ?? row?.progresso_pct));
    out.matriculas += 1;
    if (status === 'CONCLUIDO') {
      out.concluidas += 1;
      if (!String(row?.data_conclusao || '').trim()) out.concluido_sem_data += 1;
    } else {
      out.sem_conclusao += 1;
      if (raw >= 99) out.pendentes_99_ou_mais += 1;
      if (raw >= 100) out.pendentes_100_bruto += 1;
      if (raw >= 95 && raw < 99) out.pendentes_95_a_98 += 1;
    }
  }
  return out;
}
export function addAggregates(target, fragment) {
  for (const key of Object.keys(fragment)) target[key] = (target[key] || 0) + fragment[key];
  return target;
}
export function sanitizeCourse(row, aggregate) {
  return {
    curso_id: Number(row?.id || 0),
    titulo: String(row?.titulo || '').slice(0, 160),
    formato: String(row?.tipo_conteudo || '').toLowerCase(),
    ...aggregate,
  };
}
async function readOnlyGet(token, route) {
  requireValue(route.startsWith('/api/lms/') || route === '/api/auth/empresas' || route === '/api/auth/me' || route === '/api/empresas/minha', 'READONLY_PATH_REJECTED');
  return fetchJson(API + route, { headers: { Authorization: 'Bearer ' + token } });
}
async function pinnedProduction() {
  requireValue(/^[0-9a-f]{40}$/.test(PINNED_SHA), 'EXPECTED_PRODUCTION_SHA_INVALID');
  requireValue(COMPANY_ID === 6, 'TARGET_COMPANY_INVALID');
  const response = await fetchJson(API + '/api/version');
  requireValue(response.status === 200, 'PRODUCTION_VERSION_HTTP_' + response.status);
  const body = response.json?.data && typeof response.json.data === 'object' ? response.json.data : response.json;
  const live = String(body?.sourceSha || body?.source_sha || '').toLowerCase();
  requireValue(live === PINNED_SHA, 'PRODUCTION_SHA_MISMATCH');
}
async function scopedToken() {
  const email = String(process.env.PROD_SMOKE_EMAIL || '').trim();
  const password = String(process.env.PROD_SMOKE_PASSWORD || '');
  requireValue(email.length > 0 && password.length > 0, 'PRODUCTION_SMOKE_CREDENTIALS_MISSING');
  const authResponse = await login(API, email, password);
  let token = extractAccessToken(authResponse);
  requireValue(Boolean(token), 'PRODUCTION_ACCESS_TOKEN_MISSING');
  const companies = await readOnlyGet(token, '/api/auth/empresas');
  requireValue(companies.status === 200, 'AUTH_EMPRESAS_HTTP_' + companies.status);
  const list = Array.isArray(companies.json?.data?.empresas) ? companies.json.data.empresas : [];
  requireValue(list.some((item) => Number(item?.id) === COMPANY_ID), 'TARGET_COMPANY_NOT_AUTHORIZED');
  if (Number(companies.json?.data?.empresaAtualId) !== COMPANY_ID) {
    const changed = await fetchJson(API + '/api/auth/select-empresa', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresaId: COMPANY_ID }),
    });
    requireValue(changed.status === 200, 'SELECT_EMPRESA_HTTP_' + changed.status);
    token = String(changed.json?.data?.accessToken || '');
    requireValue(Boolean(token), 'SELECT_EMPRESA_TOKEN_MISSING');
  }
  const mine = await readOnlyGet(token, '/api/empresas/minha');
  requireValue(mine.status === 200 && Number(mine.json?.data?.id) === COMPANY_ID, 'TARGET_COMPANY_CONTEXT_MISMATCH');
  // Manager-level identities can only see assigned sectors. A tenant-wide
  // course audit must fail closed rather than silently undercount employees.
  const me = await readOnlyGet(token, '/api/auth/me');
  requireValue(me.status === 200, 'AUTH_ME_HTTP_' + me.status);
  const role = String(me.json?.data?.role || '').trim().toLowerCase();
  requireValue(['admin', 'administrador'].includes(role), 'FULL_TENANT_ADMIN_SCOPE_REQUIRED');
  return token;
}
async function listActivePublished(token) {
  const all = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await readOnlyGet(token, '/api/lms/cursos?page=' + page + '&limit=' + LIMIT);
    requireValue(response.status === 200, 'COURSE_LIST_HTTP_' + response.status);
    const entries = Array.isArray(response.json?.data) ? response.json.data : [];
    all.push(...entries);
    const total = Number(response.json?.pagination?.total ?? all.length);
    if (!entries.length || all.length >= total) {
      requireValue(all.length === total, 'COURSE_LIST_PAGINATION_INCOMPLETE');
      break;
    }
    requireValue(page !== 20, 'COURSE_LIST_PAGE_LIMIT');
  }
  const courses = all.filter((r) => Number(r.ativo) === 1 && Number(r.publicado) === 1);
  const ids = courses.map((c) => Number(c.id));
  requireValue(ids.every((n) => Number.isInteger(n) && n > 0), 'COURSE_ID_INVALID');
  requireValue(new Set(ids).size === ids.length, 'DUPLICATE_COURSE_ID');
  return courses;
}
async function aggregateCourse(token, course) {
  const totals = aggregateEnrollments([]);
  let expectedTotal = null;
  let fetched = 0;
  for (let page = 1; page <= MAX_COURSE_PAGES; page += 1) {
    const route = '/api/lms/matriculas/curso/' + Number(course.id) + '?page=' + page + '&limit=' + LIMIT;
    const result = await readOnlyGet(token, route);
    requireValue(result.status === 200, 'COURSE_ENROLLMENTS_HTTP_' + course.id + '_' + result.status);
    const rows = Array.isArray(result.json?.data) ? result.json.data : [];
    const total = Number(result.json?.pagination?.total ?? 0);
    requireValue(Number.isInteger(total) && total >= 0, 'ENROLLMENT_TOTAL_INVALID');
    if (expectedTotal !== null) requireValue(total === expectedTotal, 'ENROLLMENT_TOTAL_CHANGED_RETRY_REQUIRED');
    expectedTotal = total;
    addAggregates(totals, aggregateEnrollments(rows));
    fetched += rows.length;
    if (fetched >= total) {
      requireValue(fetched === total, 'ENROLLMENT_COUNT_MISMATCH');
      return sanitizeCourse(course, totals);
    }
    requireValue(rows.length > 0 && page < MAX_COURSE_PAGES, 'ENROLLMENT_PAGE_LIMIT');
  }
  throw new Error('ENROLLMENT_PAGE_LIMIT');
}
export async function run() {
  await pinnedProduction();
  let token = await scopedToken();
  let issued = Date.now();
  const courses = await listActivePublished(token);
  const result = [];
  for (const course of courses) {
    if (Date.now() - issued >= 12 * 60_000) {
      await pinnedProduction();
      token = await scopedToken();
      issued = Date.now();
    }
    result.push(await aggregateCourse(token, course));
  }
  result.sort((a, b) => a.curso_id - b.curso_id);
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    production_sha: PINNED_SHA,
    empresa_id: COMPANY_ID,
    course_count: result.length,
    total_matriculas: result.reduce((n, row) => n + row.matriculas, 0),
    total_concluidas: result.reduce((n, row) => n + row.concluidas, 0),
    total_pendentes_99: result.reduce((n, row) => n + row.pendentes_99_ou_mais, 0),
    no_personal_data: true,
    writes: 'none (GET-only for LMS; authentication/company-selection POSTs only)',
    courses: result,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error('LMS_OUTCOMES_READONLY_FAILED:' + String(error?.message || 'unknown').slice(0, 160));
    process.exitCode = 1;
  });
}
