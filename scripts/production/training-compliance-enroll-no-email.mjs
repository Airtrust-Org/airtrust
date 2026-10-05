import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_API_BASE_URL = 'https://api.airtrust.online';
const CONFIRMATION = 'AIRTRUST_PRODUCTION_TRAINING_COMPLIANCE_ENROLL_NO_EMAIL';

function asPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function uniquePositiveInts(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(asPositiveInt).filter(Boolean))];
}

function uniqueCourses(values) {
  const byId = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const id = asPositiveInt(value?.id);
    if (!id) continue;
    byId.set(id, { id, titulo: String(value?.titulo || `Curso ${id}`) });
  }
  return [...byId.values()];
}

export function buildEnrollmentPlan(reconciliation) {
  const gaps = Array.isArray(reconciliation?.gaps_matricula) ? reconciliation.gaps_matricula : [];
  const plan = [];
  const unavailable = [];
  const ambiguous = [];

  for (const gap of gaps) {
    const funcionarioIds = uniquePositiveInts((gap?.funcionarios || []).map((item) => item?.id));
    if (funcionarioIds.length === 0) continue;

    const qualification = {
      id: asPositiveInt(gap?.qualificacao_tipo_id),
      codigo: String(gap?.qualificacao_tipo_codigo || '').trim(),
      nome: String(gap?.qualificacao_tipo_nome || '').trim(),
      pessoas: funcionarioIds.length,
    };
    const courses = uniqueCourses(gap?.cursos_ead);
    if (courses.length === 0) {
      unavailable.push(qualification);
      continue;
    }
    if (courses.length !== 1) {
      ambiguous.push({ ...qualification, cursos: courses.map((course) => course.id) });
      continue;
    }

    plan.push({
      ...qualification,
      curso: courses[0],
      funcionario_ids: funcionarioIds,
    });
  }

  return { plan, unavailable, ambiguous };
}

export function chunkIds(ids, size = 200) {
  const chunks = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}

async function parseJson(response, label) {
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success === false) {
    const code = String(json?.code || json?.error || '').slice(0, 160);
    throw new Error(`${label}_HTTP_${response.status}${code ? `:${code}` : ''}`);
  }
  return json;
}

async function login(fetchImpl, apiBaseUrl, email, password) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha: password }),
      });
      const json = await response.json().catch(() => null);
      if (response.status === 429 && attempt < 5) {
        await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(1000 * 2 ** (attempt - 1), 8000)));
        continue;
      }
      const token = String(json?.data?.accessToken || '');
      if (!response.ok || json?.success !== true || token.length < 20) {
        throw new Error(`PRODUCTION_AUTH_HTTP_${response.status}:${String(json?.code || json?.error || 'LOGIN_FAILED').slice(0, 120)}`);
      }
      return token;
    } catch (error) {
      lastError = error;
      if (attempt === 5) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(1000 * 2 ** (attempt - 1), 8000)));
    }
  }
  throw lastError || new Error('PRODUCTION_AUTH_FAILED');
}

async function authenticatedJson(fetchImpl, apiBaseUrl, token, path, options = {}) {
  const response = await fetchImpl(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  return parseJson(response, path.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase());
}

function appendOutput(values) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, ' ')}`);
  appendFileSync(output, `${lines.join('\n')}\n`);
}

export async function executeSilentEnrollment({
  fetchImpl = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  email,
  password,
} = {}) {
  if (!email || !password) throw new Error('PRODUCTION_SMOKE_CREDENTIALS_MISSING');
  const normalizedApiBaseUrl = String(apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  const token = await login(fetchImpl, normalizedApiBaseUrl, email, password);
  const beforeJson = await authenticatedJson(fetchImpl, normalizedApiBaseUrl, token, '/api/compliance-treinamentos/reconciliacao');
  const before = buildEnrollmentPlan(beforeJson?.data);

  if (before.ambiguous.length > 0) {
    const codes = before.ambiguous.map((item) => item.codigo || item.nome || item.id).join(',');
    throw new Error(`AMBIGUOUS_EAD_COURSE_MAPPING:${codes}`);
  }

  const summary = {
    groups_planned: before.plan.length,
    people_planned: before.plan.reduce((sum, item) => sum + item.funcionario_ids.length, 0),
    groups_without_ead: before.unavailable.length,
    people_without_ead: before.unavailable.reduce((sum, item) => sum + item.pessoas, 0),
    created: 0,
    ignored_existing: 0,
    errors: 0,
  };

  console.log(`SILENT_ENROLLMENT_PREFLIGHT groups=${summary.groups_planned} people=${summary.people_planned} unavailable_groups=${summary.groups_without_ead} unavailable_people=${summary.people_without_ead}`);
  if (before.unavailable.length > 0) {
    console.log(`SILENT_ENROLLMENT_NO_EAD=${before.unavailable.map((item) => item.codigo || item.nome || item.id).join(',')}`);
  }

  for (const item of before.plan) {
    for (const funcionarioIds of chunkIds(item.funcionario_ids, 200)) {
      const result = await authenticatedJson(fetchImpl, normalizedApiBaseUrl, token, '/api/lms/matriculas/lote', {
        method: 'POST',
        body: JSON.stringify({
          funcionario_ids: funcionarioIds,
          curso_id: item.curso.id,
          observacoes: 'Matrícula criada pela reconciliação do Compliance de Treinamentos — lote autorizado pela Gerência de Treinamento.',
          enviar_convite_email: false,
        }),
      });
      const data = result?.data || {};
      summary.created += Number(data.criadas || 0);
      summary.ignored_existing += Number(data.ignoradas || 0);
      summary.errors += Number(data.erros || 0);
    }
  }

  if (summary.errors > 0) throw new Error(`SILENT_ENROLLMENT_API_ERRORS:${summary.errors}`);

  const afterJson = await authenticatedJson(fetchImpl, normalizedApiBaseUrl, token, '/api/compliance-treinamentos/reconciliacao');
  const after = buildEnrollmentPlan(afterJson?.data);
  if (after.ambiguous.length > 0) throw new Error('POSTCONDITION_AMBIGUOUS_MAPPING');
  if (after.plan.length > 0) {
    const codes = after.plan.map((item) => item.codigo || item.nome || item.id).join(',');
    throw new Error(`POSTCONDITION_ACTIONABLE_GAPS_REMAIN:${codes}`);
  }

  console.log(`SILENT_ENROLLMENT_POSTCONDITION=PASS created=${summary.created} ignored=${summary.ignored_existing} unavailable_groups=${after.unavailable.length} unavailable_people=${after.unavailable.reduce((sum, item) => sum + item.pessoas, 0)}`);
  return {
    ...summary,
    remaining_without_ead_groups: after.unavailable.length,
    remaining_without_ead_people: after.unavailable.reduce((sum, item) => sum + item.pessoas, 0),
  };
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GITHUB_ACTIONS_ONLY');
  if (process.env.AIRTRUST_PRODUCTION_ENROLL_CONFIRMATION !== CONFIRMATION) throw new Error('CONFIRMATION_REJECTED');
  const summary = await executeSilentEnrollment({
    apiBaseUrl: process.env.PROD_API_BASE_URL || DEFAULT_API_BASE_URL,
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
  });
  appendOutput(summary);
}

const isDirectExecution = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(`Production silent enrollment failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
