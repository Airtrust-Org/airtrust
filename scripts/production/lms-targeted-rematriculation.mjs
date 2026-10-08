import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  assert,
  assertAllowedProductionBaseUrl,
  decodeJwtPayload,
  extractAccessToken,
  fetchJson,
  login,
} from '../smoke-auth-common.mjs';

const DEFAULT_API_BASE_URL = 'https://api.airtrust.online';
const EXPECTED_TENANT_ID = 6;
const CONFIRMATION = 'AIRTRUST_PRODUCTION_TARGETED_LMS_REMATRICULATION';

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function asPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function selectCourse(rows, query) {
  const normalizedQuery = normalizeText(query);
  const candidates = (Array.isArray(rows) ? rows : []).filter((row) => {
    const id = asPositiveInt(row?.id);
    const title = normalizeText(row?.titulo);
    return id && title.includes(normalizedQuery);
  });
  const exact = candidates.filter((row) => normalizeText(row?.titulo) === normalizedQuery);
  if (exact.length === 1) return exact[0];
  if (candidates.length === 1) return candidates[0];
  throw new Error(`COURSE_RESOLUTION_AMBIGUOUS:count=${candidates.length}`);
}

export function filterEmployeeCandidates(rows, query) {
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const id = asPositiveInt(row?.id);
    const haystack = normalizeText(
      [row?.nome, row?.guerra, row?.email, row?.matricula].filter(Boolean).join(' '),
    );
    return id && tokens.every((token) => haystack.includes(token));
  });
}

function requirementMatchesCourse(requirement, course) {
  const courseQualificationId = asPositiveInt(course?.qualificacao_tipo_id);
  const requirementId = asPositiveInt(requirement?.qualificacao_tipo_id);
  if (courseQualificationId && requirementId === courseQualificationId) return true;
  const text = normalizeText(
    [requirement?.qualificacao_tipo_codigo, requirement?.qualificacao_tipo_nome].filter(Boolean).join(' '),
  );
  return text.includes('CFIT');
}

async function apiJson(baseUrl, token, path, options = {}) {
  const response = await fetchJson(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = response.json;
  if (response.status < 200 || response.status >= 300 || payload?.success === false) {
    const code = String(payload?.code || payload?.error || 'API_ERROR').slice(0, 120);
    throw new Error(`${path}:HTTP_${response.status}:${code}`);
  }
  return payload;
}

async function resolveEmployee(baseUrl, token, query, course) {
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  const searchTerms = [query, ...tokens].filter(
    (value, index, values) =>
      normalizeText(value).length >= 2 &&
      values.findIndex((candidate) => normalizeText(candidate) === normalizeText(value)) === index,
  );
  const rowsById = new Map();

  for (const searchTerm of searchTerms) {
    const payload = await apiJson(
      baseUrl,
      token,
      `/api/funcionarios?search=${encodeURIComponent(searchTerm)}&limit=100&status=ativos`,
    );
    for (const row of Array.isArray(payload?.data) ? payload.data : []) {
      const id = asPositiveInt(row?.id);
      if (id) rowsById.set(id, row);
    }
  }

  let candidates = filterEmployeeCandidates([...rowsById.values()], query);
  if (candidates.length === 1) return candidates[0];

  if (candidates.length > 1) {
    const matching = [];
    for (const candidate of candidates) {
      const detail = await apiJson(
        baseUrl,
        token,
        `/api/compliance-treinamentos/funcionarios/${candidate.id}`,
      );
      const requirements = Array.isArray(detail?.data?.requisitos) ? detail.data.requisitos : [];
      if (requirements.some((requirement) => requirementMatchesCourse(requirement, course))) {
        matching.push(candidate);
      }
    }
    candidates = matching;
  }

  if (candidates.length !== 1) {
    throw new Error(`EMPLOYEE_RESOLUTION_AMBIGUOUS:query=${normalizeText(query)}:count=${candidates.length}`);
  }
  return candidates[0];
}

export function assertLegacyGatekeeperCompletions(sourceRows, employeeIds) {
  assert(Array.isArray(sourceRows), 'GATEKEEPER_LEGACY_HISTORY_INVALID');
  assert(Array.isArray(employeeIds) && employeeIds.length === 2,
    'GATEKEEPER_EXACTLY_TWO_REQUIRED');
  for (const employeeId of employeeIds) {
    const complete = sourceRows.filter((row) =>
      asPositiveInt(row?.funcionario_id) === employeeId &&
      normalizeText(row?.status) === 'CONCLUIDO',
    );
    assert(complete.length === 1, 'GATEKEEPER_LEGACY_COMPLETION_NOT_UNIQUE');
  }
  return true;
}

async function listActiveCourseEnrollments(baseUrl, token, courseId) {
  const payload = await apiJson(
    baseUrl,
    token,
    `/api/lms/matriculas/curso/${courseId}?limit=200&page=1`,
  );
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function executeTargetedRematriculation({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  email,
  password,
  targetQueries,
  courseQuery,
  sendEmail = false,
  gatekeeperLegacyTransfer = false,
} = {}) {
  assert(email && password, 'PRODUCTION_ADMIN_CREDENTIALS_MISSING');
  assert(Array.isArray(targetQueries) && targetQueries.length > 0, 'TARGETS_REQUIRED');
  assert(targetQueries.length <= 10, 'TARGETS_LIMIT_EXCEEDED');
  assert(targetQueries.every((value) => normalizeText(value).length >= 3), 'TARGET_QUERY_INVALID');
  assert(normalizeText(courseQuery).length >= 3, 'COURSE_QUERY_INVALID');

  const baseUrl = assertAllowedProductionBaseUrl(apiBaseUrl);
  const loginPayload = await login(baseUrl, email, password);
  const token = extractAccessToken(loginPayload);
  const claims = decodeJwtPayload(token);
  const tenantId = Number(claims?.empresa_id || 0);
  const rawRole = String(claims?.role || '').trim().toLowerCase();
  const role = rawRole === 'admin' ? 'administrador' : rawRole === 'manager' ? 'gestor' : rawRole;
  assert(tenantId === EXPECTED_TENANT_ID, `PRODUCTION_TENANT_MISMATCH:${tenantId}`);
  assert(['administrador', 'gestor'].includes(role), `PRODUCTION_ROLE_FORBIDDEN:${role}`);

  const coursePayload = await apiJson(
    baseUrl,
    token,
    `/api/lms/cursos?q=${encodeURIComponent(courseQuery)}&publicados=0&limit=100`,
  );
  const course = selectCourse(coursePayload?.data, courseQuery);
  const courseId = asPositiveInt(course?.id);
  assert(courseId, 'COURSE_ID_INVALID');
  if (gatekeeperLegacyTransfer) {
    assert(courseId === 73, 'GATEKEEPER_TARGET_MUST_BE_COURSE_73');
    const courseTitle = normalizeText(course?.titulo);
    assert(courseTitle.includes('FDM') && courseTitle.includes('COMITE') &&
      courseTitle.includes('GATEKEEPER'), 'GATEKEEPER_TARGET_TITLE_INVALID');
    assert(targetQueries.length === 2, 'GATEKEEPER_EXACTLY_TWO_REQUIRED');
    assert(sendEmail === false, 'GATEKEEPER_EMAIL_NOT_AUTHORIZED');
  }

  const employees = [];
  for (const query of targetQueries) {
    employees.push(await resolveEmployee(baseUrl, token, query, course));
  }
  const employeeIds = [...new Set(employees.map((row) => asPositiveInt(row?.id)).filter(Boolean))];
  assert(
    employeeIds.length === targetQueries.length,
    'TARGET_RESOLUTION_NOT_ONE_TO_ONE',
  );

  if (gatekeeperLegacyTransfer) {
    const legacy = await listActiveCourseEnrollments(baseUrl, token, 14);
    assertLegacyGatekeeperCompletions(legacy, employeeIds);
  }

  const beforeActive = await listActiveCourseEnrollments(baseUrl, token, courseId);
  const beforeActiveIds = new Set(beforeActive.map((row) => asPositiveInt(row?.funcionario_id)).filter(Boolean));
  const alreadyActive = employeeIds.filter((id) => beforeActiveIds.has(id)).length;

  const result = await apiJson(baseUrl, token, '/api/lms/matriculas/lote', {
    method: 'POST',
    body: JSON.stringify({
      funcionario_ids: employeeIds,
      curso_id: courseId,
      observacoes:
        gatekeeperLegacyTransfer
          ? 'Matrícula no FDM Comitê e Gatekeeper por decisão da Gerência de Treinamento. Curso Gatekeeper legado (14) concluído e preservado; novo treinamento ainda não realizado.'
          : 'Rematrícula pontual solicitada pela Gerência de Treinamento: matrícula anterior cancelada.',
      enviar_convite_email: Boolean(sendEmail),
    }),
  });

  const created = Number(result?.data?.criadas || 0);
  const ignored = Number(result?.data?.ignoradas || 0);
  const errors = Number(result?.data?.erros || 0);
  assert(errors === 0, `REMATRICULATION_API_ERRORS:${errors}`);
  assert(
    created + ignored === employeeIds.length,
    `REMATRICULATION_RESULT_MISMATCH:created=${created}:ignored=${ignored}:targets=${employeeIds.length}`,
  );

  const afterActive = await listActiveCourseEnrollments(baseUrl, token, courseId);
  const afterByEmployee = new Map(
    afterActive.map((row) => [asPositiveInt(row?.funcionario_id), row]).filter(([id]) => id),
  );
  for (const employeeId of employeeIds) {
    const enrollment = afterByEmployee.get(employeeId);
    assert(enrollment, 'POSTCONDITION_ACTIVE_ENROLLMENT_MISSING');
    assert(
      normalizeText(enrollment.status) !== 'CANCELADO',
      'POSTCONDITION_ENROLLMENT_STILL_CANCELLED',
    );
  }

  if (gatekeeperLegacyTransfer) {
    const legacyAfter = await listActiveCourseEnrollments(baseUrl, token, 14);
    assertLegacyGatekeeperCompletions(legacyAfter, employeeIds);
  }

  const summary = {
    tenant_id: tenantId,
    course_id: courseId,
    course_title: String(course?.titulo || ''),
    target_count: employeeIds.length,
    already_active_before: alreadyActive,
    rematriculated_or_created: created,
    ignored_existing_active: ignored,
    post_active_count: employeeIds.length,
    email_sent: Boolean(sendEmail),
    gatekeeper_legacy_14_preserved: Boolean(gatekeeperLegacyTransfer),
  };
  console.log(`TARGETED_LMS_REMATRICULATION=PASS ${JSON.stringify(summary)}`);
  return summary;
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GITHUB_ACTIONS_ONLY');
  if (process.env.AIRTRUST_PRODUCTION_REMATRICULATION_CONFIRMATION !== CONFIRMATION) {
    throw new Error('CONFIRMATION_REJECTED');
  }
  const targetQueries = JSON.parse(process.env.AIRTRUST_TARGET_EMPLOYEE_QUERIES || '[]');
  const sendEmail = String(process.env.AIRTRUST_SEND_EMAIL || 'false').toLowerCase() === 'true';
  await executeTargetedRematriculation({
    apiBaseUrl: process.env.PROD_API_BASE_URL || DEFAULT_API_BASE_URL,
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
    targetQueries,
    courseQuery: process.env.AIRTRUST_COURSE_QUERY || '',
    sendEmail,
    gatekeeperLegacyTransfer: String(process.env.AIRTRUST_GATEKEEPER_LEGACY_TRANSFER || 'false').toLowerCase() === 'true',
  });
}

const isDirectExecution = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
);
if (isDirectExecution) {
  main().catch((error) => {
    console.error(
      `Production targeted LMS rematriculation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
