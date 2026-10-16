#!/usr/bin/env node
/**
 * Canonical reconciliation for historical SCORM enrollments stuck at 99/100%.
 *
 * Dry-run discovers tenant-scoped candidates through authenticated LMS APIs and
 * emits only aggregate evidence plus an irreversible cohort hash. Apply mode
 * may call ONLY the canonical /finalizar endpoint for rows whose current
 * server-owned closure_readiness is eligible_for_server_verification=true.
 *
 * No direct SQL writes, no fabricated score/status, no administrative override.
 */
import process from 'node:process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  assertAllowedProductionBaseUrl,
  extractAccessToken,
  fetchJson,
  login,
} from '../smoke-auth-common.mjs';

const API = assertAllowedProductionBaseUrl(
  process.env.PROD_API_BASE_URL || 'https://api.airtrust.online',
);
const MODE = String(process.env.LMS99_CANONICAL_MODE || 'dry-run').trim();
const MAIN = String(process.env.EXPECTED_MAIN_SHA || '').trim().toLowerCase();
const PROD = String(process.env.EXPECTED_PRODUCTION_SHA || '').trim().toLowerCase();
const TENANT = Number(process.env.TARGET_COMPANY_ID || 6);
const EXPECTED_HASH = String(process.env.EXPECTED_COHORT_HASH || '').trim().toLowerCase();
const LIMIT = 200;

function invariant(condition, code) {
  if (!condition) throw new Error('LMS99_CANONICAL_' + code);
}
function upper(value) {
  return String(value ?? '').trim().toUpperCase();
}
function rawProgress(row) {
  const value = Number(row?.progresso_bruto ?? row?.progresso_pct ?? -1);
  return Number.isFinite(value) ? value : -1;
}
function safeCode(value, fallback = 'UNCLASSIFIED') {
  const code = String(value || fallback).trim().toUpperCase();
  return /^[A-Z0-9_.-]{1,80}$/.test(code) ? code : fallback;
}

export function classifyEnrollment(detail) {
  const status = upper(detail?.status);
  const progress = rawProgress(detail);
  const contentType = String(detail?.tipo_conteudo || '').trim().toLowerCase();
  const closure = detail?.closure_readiness && typeof detail.closure_readiness === 'object'
    ? detail.closure_readiness
    : null;

  if (status === 'CONCLUIDO') return { bucket: 'ALREADY_COMPLETED', code: 'SCORM_ALREADY_COMPLETED', ready: false };
  if (status === 'CANCELADO') return { bucket: 'EXCLUDED', code: 'ENROLLMENT_CANCELLED', ready: false };
  if (status === 'REPROVADO') return { bucket: 'EXCLUDED', code: 'ENROLLMENT_FAILED', ready: false };
  if (contentType !== 'scorm') return { bucket: 'EXCLUDED', code: 'NOT_SCORM', ready: false };
  if (progress < 99) return { bucket: 'EXCLUDED', code: 'PROGRESS_BELOW_99', ready: false };
  if (!closure) return { bucket: 'BLOCKED', code: 'CLOSURE_READINESS_MISSING', ready: false };

  const code = safeCode(closure.code, 'CLOSURE_UNCLASSIFIED');
  const ready =
    closure.eligible_for_server_verification === true &&
    code === 'SCORM_READY_FOR_SERVER_VERIFICATION';

  return {
    bucket: ready ? 'CANONICAL_READY' : 'BLOCKED',
    code,
    ready,
  };
}

export function cohortHash(rows) {
  const normalized = rows
    .map((row) => ({ id: Number(row.id), course_id: Number(row.course_id) }))
    .sort((a, b) => a.course_id - b.course_id || a.id - b.id);
  invariant(
    normalized.every((row) => Number.isSafeInteger(row.id) && row.id > 0 &&
      Number.isSafeInteger(row.course_id) && row.course_id > 0),
    'COHORT_ID_INVALID',
  );
  invariant(new Set(normalized.map((row) => row.id)).size === normalized.length, 'COHORT_DUPLICATE');
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function summarizeEvaluations(evaluations) {
  const byCourse = Object.create(null);
  const byCode = Object.create(null);
  let ready = 0;
  let blocked = 0;
  let excluded = 0;
  let alreadyCompleted = 0;

  for (const row of evaluations) {
    const courseId = Number(row.course_id);
    invariant(Number.isSafeInteger(courseId) && courseId > 0, 'COURSE_ID_INVALID');
    const code = safeCode(row.code);
    byCode[code] = (byCode[code] || 0) + 1;
    const course = byCourse[courseId] ||= {
      total: 0, canonical_ready: 0, blocked: 0, excluded: 0, already_completed: 0, codes: {},
    };
    course.total += 1;
    course.codes[code] = (course.codes[code] || 0) + 1;

    if (row.bucket === 'CANONICAL_READY') {
      ready += 1; course.canonical_ready += 1;
    } else if (row.bucket === 'BLOCKED') {
      blocked += 1; course.blocked += 1;
    } else if (row.bucket === 'ALREADY_COMPLETED') {
      alreadyCompleted += 1; course.already_completed += 1;
    } else {
      excluded += 1; course.excluded += 1;
    }
  }

  return {
    total_evaluated: evaluations.length,
    canonical_ready: ready,
    blocked,
    excluded,
    already_completed: alreadyCompleted,
    by_course: byCourse,
    by_code: byCode,
  };
}

async function apiGet(token, route) {
  invariant(
    route.startsWith('/api/lms/') ||
      ['/api/auth/empresas', '/api/auth/me', '/api/empresas/minha'].includes(route),
    'READ_PATH_BLOCKED',
  );
  return fetchJson(API + route, { headers: { Authorization: 'Bearer ' + token } });
}

async function pinProduction() {
  const response = await fetchJson(API + '/api/version');
  invariant(response.status === 200, 'VERSION_HTTP_' + response.status);
  const data = response.json?.data && typeof response.json.data === 'object'
    ? response.json.data
    : response.json;
  invariant(String(data?.sourceSha || data?.source_sha || '').toLowerCase() === PROD, 'PRODUCTION_SHA_MISMATCH');
}

async function authorize() {
  const email = String(process.env.PROD_SMOKE_EMAIL || '').trim();
  const password = String(process.env.PROD_SMOKE_PASSWORD || '');
  invariant(email && password, 'PRODUCTION_CREDENTIALS_MISSING');

  let token = extractAccessToken(await login(API, email, password));
  invariant(token, 'ACCESS_TOKEN_MISSING');

  const companies = await apiGet(token, '/api/auth/empresas');
  invariant(companies.status === 200, 'AUTH_EMPRESAS_HTTP_' + companies.status);
  const list = Array.isArray(companies.json?.data?.empresas) ? companies.json.data.empresas : [];
  invariant(list.some((item) => Number(item?.id) === TENANT), 'TENANT_ACCESS_DENIED');

  if (Number(companies.json?.data?.empresaAtualId) !== TENANT) {
    const selected = await fetchJson(API + '/api/auth/select-empresa', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresaId: TENANT }),
    });
    invariant(selected.status === 200, 'TENANT_SELECT_HTTP_' + selected.status);
    token = String(selected.json?.data?.accessToken || '');
    invariant(token, 'TENANT_TOKEN_MISSING');
  }

  const me = await apiGet(token, '/api/auth/me');
  const company = await apiGet(token, '/api/empresas/minha');
  invariant(me.status === 200, 'AUTH_ME_HTTP_' + me.status);
  invariant(['ADMIN', 'ADMINISTRADOR'].includes(upper(me.json?.data?.role)), 'FULL_ADMIN_REQUIRED');
  invariant(company.status === 200 && Number(company.json?.data?.id) === TENANT, 'TENANT_CONTEXT_MISMATCH');
  return token;
}

async function listCourses(token) {
  const all = [];
  let expected = null;
  for (let page = 1; page <= 20; page += 1) {
    const response = await apiGet(token, '/api/lms/cursos?page=' + page + '&limit=' + LIMIT);
    invariant(response.status === 200, 'COURSES_HTTP_' + response.status);
    const rows = Array.isArray(response.json?.data) ? response.json.data : [];
    const total = Number(response.json?.pagination?.total ?? all.length + rows.length);
    if (expected == null) expected = total;
    invariant(total === expected, 'COURSE_TOTAL_DRIFT');
    all.push(...rows);
    if (all.length >= total) break;
    invariant(rows.length > 0 && page < 20, 'COURSE_PAGINATION_EXHAUSTED');
  }
  invariant(expected !== null && all.length === expected, 'COURSE_COUNT_MISMATCH');
  return all.filter((course) =>
    Number(course?.ativo) === 1 &&
    Number(course?.publicado) === 1 &&
    String(course?.tipo_conteudo || '').toLowerCase() === 'scorm'
  );
}

async function candidateIds(token, courses) {
  const out = [];
  for (const course of courses) {
    let fetched = 0;
    let expected = null;
    for (let page = 1; page <= 100; page += 1) {
      const response = await apiGet(
        token,
        '/api/lms/matriculas/curso/' + Number(course.id) + '?status=EM_ANDAMENTO&page=' + page + '&limit=' + LIMIT,
      );
      invariant(response.status === 200, 'ENROLLMENTS_HTTP_' + Number(course.id) + '_' + response.status);
      const rows = Array.isArray(response.json?.data) ? response.json.data : [];
      const total = Number(response.json?.pagination?.total ?? 0);
      if (expected == null) expected = total;
      invariant(expected === total, 'ENROLLMENT_TOTAL_DRIFT');
      for (const row of rows) {
        const status = upper(row?.status);
        const progress = rawProgress(row);
        if (status === 'EM_ANDAMENTO' && progress >= 99) {
          const id = Number(row?.id);
          invariant(Number.isSafeInteger(id) && id > 0, 'ENROLLMENT_ID_INVALID');
          out.push({ id, course_id: Number(course.id) });
        }
      }
      fetched += rows.length;
      if (fetched >= total) {
        invariant(fetched === total, 'ENROLLMENT_COUNT_MISMATCH');
        break;
      }
      invariant(rows.length > 0 && page < 100, 'ENROLLMENT_PAGINATION_EXHAUSTED');
    }
  }
  invariant(out.length <= 500, 'CANDIDATE_LIMIT');
  invariant(new Set(out.map((row) => row.id)).size === out.length, 'CANDIDATE_DUPLICATE');
  return out;
}

async function evaluateCandidates(token, candidates) {
  const evaluations = [];
  const ready = [];
  for (const candidate of candidates) {
    const response = await apiGet(token, '/api/lms/matriculas/' + candidate.id);
    invariant(response.status === 200, 'ENROLLMENT_DETAIL_HTTP_' + response.status);
    const detail = response.json?.data;
    invariant(detail && Number(detail.id) === candidate.id, 'ENROLLMENT_DETAIL_INVALID');
    invariant(Number(detail.curso_id) === candidate.course_id, 'ENROLLMENT_COURSE_DRIFT');
    invariant(Number(detail.empresa_id) === TENANT, 'ENROLLMENT_TENANT_DRIFT');
    const classification = classifyEnrollment(detail);
    evaluations.push({
      course_id: candidate.course_id,
      bucket: classification.bucket,
      code: classification.code,
    });
    if (classification.ready) ready.push(candidate);
  }
  return { evaluations, ready };
}

async function finalizeReady(token, ready) {
  const results = { attempted: 0, completed: 0, already_completed: 0, rejected_409: 0, forbidden_403: 0, other_error: 0, by_code: {} };
  for (const candidate of ready) {
    await pinProduction();
    const before = await apiGet(token, '/api/lms/matriculas/' + candidate.id);
    invariant(before.status === 200, 'PRE_FINALIZE_READ_FAILED');
    const current = classifyEnrollment(before.json?.data);
    if (current.bucket === 'ALREADY_COMPLETED') {
      results.already_completed += 1;
      continue;
    }
    invariant(current.ready, 'COHORT_READINESS_DRIFT');

    const response = await fetchJson(API + '/api/lms/matriculas/' + candidate.id + '/finalizar', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: '{}',
    });
    results.attempted += 1;
    if (response.status === 409) {
      const code = safeCode(response.json?.code, 'HTTP_409');
      results.rejected_409 += 1;
      results.by_code[code] = (results.by_code[code] || 0) + 1;
      continue;
    }
    if (response.status === 403) {
      const code = safeCode(response.json?.code, 'HTTP_403');
      results.forbidden_403 += 1;
      results.by_code[code] = (results.by_code[code] || 0) + 1;
      continue;
    }
    if (response.status !== 200 || response.json?.success !== true) {
      results.other_error += 1;
      results.by_code['OTHER_ERROR'] = (results.by_code['OTHER_ERROR'] || 0) + 1;
      break;
    }

    const after = await apiGet(token, '/api/lms/matriculas/' + candidate.id);
    invariant(
      after.status === 200 &&
      upper(after.json?.data?.status) === 'CONCLUIDO' &&
      Number(after.json?.data?.progresso_pct) === 100 &&
      Boolean(String(after.json?.data?.data_conclusao || '').trim()),
      'POST_FINALIZE_STATE_INVALID',
    );
    results.completed += 1;
  }
  return results;
}

async function run() {
  invariant(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF === 'refs/heads/main', 'GITHUB_MAIN_REQUIRED');
  invariant(/^[a-f0-9]{40}$/.test(MAIN) && process.env.GITHUB_SHA === MAIN, 'MAIN_SHA_MISMATCH');
  invariant(/^[a-f0-9]{40}$/.test(PROD) && TENANT === 6, 'PRODUCTION_SCOPE_INVALID');
  invariant(['dry-run', 'apply'].includes(MODE), 'MODE_INVALID');
  if (MODE === 'apply') invariant(/^[a-f0-9]{64}$/.test(EXPECTED_HASH), 'EXPECTED_HASH_INVALID');

  await pinProduction();
  const token = await authorize();
  const courses = await listCourses(token);
  const candidates = await candidateIds(token, courses);
  const { evaluations, ready } = await evaluateCandidates(token, candidates);
  const summary = summarizeEvaluations(evaluations);
  const hash = cohortHash(ready);

  const baseReport = {
    schema_version: 1,
    repo_sha: MAIN,
    production_sha: PROD,
    tenant: TENANT,
    mode: MODE,
    no_personal_data: true,
    candidate_count: candidates.length,
    canonical_ready_count: ready.length,
    blocked_count: summary.blocked,
    excluded_count: summary.excluded,
    already_completed_during_scan: summary.already_completed,
    cohort_hash: hash,
    by_course: summary.by_course,
    by_code: summary.by_code,
  };

  if (MODE === 'dry-run') {
    process.stdout.write(JSON.stringify({ ...baseReport, writes: 0 }, null, 2) + '\n');
    return;
  }

  invariant(hash === EXPECTED_HASH, 'COHORT_HASH_CHANGED');
  const results = await finalizeReady(token, ready);
  const report = { ...baseReport, writes: results.completed, results };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  invariant(results.other_error === 0 && results.rejected_409 === 0 && results.forbidden_403 === 0, 'PARTIAL_RECONCILIATION_REVIEW_REQUIRED');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error('LMS99_CANONICAL_FAILED:' + String(error?.message || error).slice(0, 120));
    process.exitCode = 1;
  });
}
