#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  assertAllowedProductionBaseUrl,
  extractAccessToken,
  fetchJson,
  login,
} from '../smoke-auth-common.mjs';

const DEFAULT_API = 'https://api.airtrust.online';
const TARGET_COMPANY_ID = Number(process.env.TARGET_COMPANY_ID || 6);
const TARGET_PATTERNS = [
  ['NR20', /\bNR\s*[- ]?\s*20\b/i],
  ['NR26_FDS', /\bNR\s*[- ]?\s*26\b|PRODUTOS?\s+QUIMIC|\bFISPQ\b|\bFDS\b/i],
  ['REGRAS_OURO', /REGRAS?\s+DE\s+OURO/i],
  ['CULTURA_JUSTA', /CULTURA\s+JUSTA|JUST\s+CULTURE/i],
  ['STOP_WORK', /STOP\s+WORK/i],
  ['ETICA_CONDUTA', /\bETICA\b|CODIGO\s+DE\s+CONDUTA|CONDUTA\s+ETICA/i],
  ['LGPD', /\bLGPD\b|PROTECAO\s+DE\s+DADOS|SEGURANCA\s+DA\s+INFORMACAO/i],
  ['CRM', /\bCRM\b|CREW\s+RESOURCE\s+MANAGEMENT/i],
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function assertReadOnlyApiRequest(method, route) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const normalizedRoute = String(route || '');
  if (normalizedRoute.startsWith('/api/lms/')) {
    if (normalizedMethod !== 'GET') throw new Error(`LMS_WRITE_BLOCKED:${normalizedMethod}:${normalizedRoute}`);
    return true;
  }
  if (normalizedMethod === 'GET') return true;
  if (normalizedMethod === 'POST' && normalizedRoute === '/api/auth/select-empresa') return true;
  throw new Error(`NON_READONLY_ROUTE_BLOCKED:${normalizedMethod}:${normalizedRoute}`);
}

export function targetTagsForCourse(course) {
  const haystack = normalizeText([
    course?.titulo,
    course?.qualificacao_tipo_nome,
    course?.qualificacao_tipo_codigo,
    course?.categoria,
  ].filter(Boolean).join(' | '));
  return TARGET_PATTERNS.filter(([, pattern]) => pattern.test(haystack)).map(([tag]) => tag);
}

export function sanitizeCourse(course) {
  const sanitized = {
    course_id: Number(course?.id || 0),
    titulo: String(course?.titulo || ''),
    tipo_conteudo: course?.tipo_conteudo ? String(course.tipo_conteudo) : null,
    ativo: Number(course?.ativo || 0) === 1,
    publicado: Number(course?.publicado || 0) === 1,
    scorm_versao: course?.scorm_versao ? String(course.scorm_versao) : null,
    has_scorm_package: Boolean(String(course?.scorm_package_r2_prefix || '').trim()),
    has_scorm_launch: Boolean(String(course?.scorm_launch_file || '').trim()),
    version_tag: course?.version_tag ? String(course.version_tag) : null,
    qualificacao_tipo_id: Number(course?.qualificacao_tipo_id || 0) || null,
    qualificacao_tipo_nome: course?.qualificacao_tipo_nome ? String(course.qualificacao_tipo_nome) : null,
    qualificacao_tipo_codigo: course?.qualificacao_tipo_codigo ? String(course.qualificacao_tipo_codigo) : null,
    gerar_qualificacao_ao_concluir: Number(course?.gerar_qualificacao_ao_concluir || 0) === 1,
    carga_horaria_minutos: Number.isFinite(Number(course?.carga_horaria_minutos)) ? Number(course.carga_horaria_minutos) : null,
    carga_horaria_inicial_horas: Number.isFinite(Number(course?.carga_horaria_inicial_horas)) ? Number(course.carga_horaria_inicial_horas) : null,
    carga_horaria_recorrente_horas: Number.isFinite(Number(course?.carga_horaria_recorrente_horas)) ? Number(course.carga_horaria_recorrente_horas) : null,
  };
  return { ...sanitized, target_tags: targetTagsForCourse(sanitized) };
}

function safeMessage(value) {
  return String(value || '')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[\w.+-]+@[\w.-]+\b/g, '[email]')
    .slice(0, 400);
}

async function authJson(api, token, route, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  assertReadOnlyApiRequest(method, route);
  return fetchJson(`${api}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function assertPinnedProduction(api, expectedSha) {
  invariant(/^[0-9a-f]{40}$/.test(expectedSha), 'EXPECTED_PRODUCTION_SHA_INVALID');
  const version = await fetchJson(`${api}/api/version`);
  invariant(version.status === 200, `PRODUCTION_VERSION_HTTP_${version.status}`);
  const actual = String(version.json?.data?.sourceSha || version.json?.sourceSha || '').toLowerCase();
  invariant(actual === expectedSha, `PRODUCTION_SHA_MISMATCH:${actual || 'missing'}`);
}

async function selectTargetCompany(api, token) {
  const empresas = await authJson(api, token, '/api/auth/empresas');
  invariant(empresas.status === 200, `AUTH_EMPRESAS_HTTP_${empresas.status}`);
  const list = Array.isArray(empresas.json?.data?.empresas) ? empresas.json.data.empresas : [];
  const target = list.find((item) => Number(item?.id || 0) === TARGET_COMPANY_ID);
  invariant(target?.id, 'TARGET_COMPANY_NOT_AUTHORIZED');

  let selectedToken = token;
  const current = Number(empresas.json?.data?.empresaAtualId || 0);
  if (current !== TARGET_COMPANY_ID) {
    const switched = await authJson(api, token, '/api/auth/select-empresa', {
      method: 'POST',
      body: { empresaId: TARGET_COMPANY_ID },
    });
    invariant(switched.status === 200, `SELECT_EMPRESA_HTTP_${switched.status}`);
    selectedToken = String(switched.json?.data?.accessToken || '');
    invariant(selectedToken, 'SELECT_EMPRESA_TOKEN_MISSING');
  }

  const mine = await authJson(api, selectedToken, '/api/empresas/minha');
  invariant(mine.status === 200, `EMPRESA_MINHA_HTTP_${mine.status}`);
  invariant(Number(mine.json?.data?.id || 0) === TARGET_COMPANY_ID, 'TARGET_COMPANY_CONTEXT_MISMATCH');
  return selectedToken;
}

async function listAllCourses(api, token) {
  const limit = 200;
  const rows = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await authJson(api, token, `/api/lms/cursos?page=${page}&limit=${limit}`);
    invariant(response.status === 200, `LMS_COURSES_HTTP_${response.status}`);
    const data = Array.isArray(response.json?.data) ? response.json.data : [];
    rows.push(...data);
    const total = Number(response.json?.pagination?.total || rows.length);
    if (rows.length >= total || data.length === 0) {
      invariant(rows.length === total, `LMS_COURSE_COUNT_MISMATCH:${rows.length}:${total}`);
      break;
    }
    invariant(page < 20, 'LMS_COURSE_PAGINATION_LIMIT_EXCEEDED');
  }
  const ids = rows.map((row) => Number(row?.id || 0));
  invariant(ids.every((id) => Number.isInteger(id) && id > 0), 'LMS_COURSE_ID_INVALID');
  invariant(new Set(ids).size === ids.length, 'LMS_COURSE_DUPLICATE_ID');
  return rows;
}

async function enrichCourseDetails(api, token, courses) {
  const enriched = [];
  for (const course of courses) {
    const id = Number(course.id);
    const detail = await authJson(api, token, `/api/lms/cursos/${id}`);
    invariant(detail.status === 200, `LMS_COURSE_DETAIL_HTTP_${id}_${detail.status}`);
    enriched.push({ ...course, ...(detail.json?.data || {}) });
  }
  return enriched;
}

export async function buildInventory() {
  const api = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || DEFAULT_API);
  const expectedSha = String(process.env.EXPECTED_PRODUCTION_SHA || '').trim().toLowerCase();
  await assertPinnedProduction(api, expectedSha);

  const email = String(process.env.PROD_SMOKE_EMAIL || '').trim();
  const password = String(process.env.PROD_SMOKE_PASSWORD || '');
  invariant(email && password, 'PRODUCTION_SMOKE_CREDENTIALS_MISSING');
  invariant(!email.toLowerCase().includes('staging.airtrust.invalid'), 'STAGING_IDENTITY_REJECTED');

  const logged = await login(api, email, password);
  let token = extractAccessToken(logged);
  invariant(token, 'PRODUCTION_ACCESS_TOKEN_MISSING');
  token = await selectTargetCompany(api, token);

  const listed = await listAllCourses(api, token);
  const detailed = await enrichCourseDetails(api, token, listed);
  const courses = detailed.map(sanitizeCourse).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  const targetMatches = courses.filter((course) => course.target_tags.length > 0);

  return {
    schema_version: 1,
    production_sha: expectedSha,
    empresa_id: TARGET_COMPANY_ID,
    course_count: courses.length,
    active_count: courses.filter((course) => course.ativo).length,
    published_count: courses.filter((course) => course.publicado).length,
    scorm_package_count: courses.filter((course) => course.has_scorm_package).length,
    target_match_count: targetMatches.length,
    target_matches: targetMatches,
    courses,
    writes: 'none (authentication/session selection POSTs only; LMS requests are GET-only)',
  };
}

async function main() {
  const report = await buildInventory();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  main().catch((error) => {
    console.error(`PRODUCTION_LMS_CATALOG_INVENTORY_FAILED:${safeMessage(error?.message || error)}`);
    process.exit(1);
  });
}
