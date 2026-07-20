#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  assertAllowedStagingBaseUrl,
  extractAccessToken,
  fetchJson,
  login,
} from '../smoke-auth-common.mjs';

const API = assertAllowedStagingBaseUrl('https://airtrust-api-staging.airtrust.workers.dev');
const FRONTEND = 'https://staging.airtrust.pages.dev';
const prefix = `AIRTRUST-QA-FINAL-${process.env.GITHUB_RUN_ID || 'local'}`;
const summaryPath = process.env.QA_SUMMARY_PATH || 'staging-runtime-fichas-lms-summary.json';
const state = {
  ids: { fichas: [], users: [], employees: [], sectors: [], courses: [], company: null },
  matrices: { fichas: 'NOT_RUN', lms: 'NOT_RUN' },
  cleanup: 'NOT_RUN',
};
const runtime = { managerToken: null, otherTenantToken: null };

function fail(message) {
  throw new Error(message);
}
function ok(condition, message) {
  if (!condition) fail(message);
}
function json(value) {
  return JSON.stringify(value);
}
function auth(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
function safeError(error) {
  return String(error?.message || error).replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]');
}
function writeSummary(error) {
  const body = {
    ids: state.ids,
    empresa_id: state.empresa_id || null,
    other_empresa_id: state.other_empresa_id || null,
    matrices: state.matrices,
    cleanup: state.cleanup,
    flight_report_id: 'FLIGHT_REPORT_ID_COMPONENT_INTEGRATION_PASS',
    error: error ? safeError(error) : null,
  };
  fs.writeFileSync(summaryPath, `${json(body)}\n`, { mode: 0o600 });
}
function cpf(seed) {
  const digits = `${seed}`.replace(/\D/g, '').padStart(9, '0').slice(-9).split('').map(Number);
  const check = (base, weight) => {
    const n = base.reduce((sum, d, i) => sum + d * (weight - i), 0);
    const r = (n * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return `${digits.join('')}${check(digits, 10)}${check([...digits, check(digits, 10)], 11)}`;
}
async function request(path, token, options = {}) {
  const response = await fetchJson(`${API}${path}`, {
    method: options.method || 'GET',
    headers: auth(token),
    body: options.body ? json(options.body) : undefined,
  });
  return response;
}
function data(response, label, status = 200) {
  if (response.status !== status) {
    const detail = String(
      response.json?.error || response.json?.message || response.json?.code || '',
    )
      .replace(/\b\d{11}\b/g, '[cpf]')
      .replace(/\b[\w.+-]+@[\w.-]+\b/g, '[email]')
      .slice(0, 160);
    fail(`${label}: expected ${status}, got ${response.status}${detail ? ` (${detail})` : ''}`);
  }
  ok(response.json?.success === true, `${label}: success=true required`);
  return response.json.data;
}
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function tokenFor(email, password) {
  // Staging login rate limit is 5 req/min. Fixture setup logs in several users.
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return extractAccessToken(await login(API, email, password));
    } catch (error) {
      lastError = error;
      const message = safeError(error);
      if (!/login retornou 429/.test(message) || attempt === 4) {
        fail(`login failed for ${String(email).replace(/^(.).+(@.*)$/, '$1***$2')}: ${message}`);
      }
      await sleep(16000);
    }
  }
  fail(
    `login failed for ${String(email).replace(/^(.).+(@.*)$/, '$1***$2')}: ${safeError(lastError)}`,
  );
}
async function versionGuard() {
  const version = await fetchJson(`${API}/api/version`);
  ok(version.status === 200, 'staging version unavailable');
  const actual = version.json?.data?.sourceSha || version.json?.sourceSha;
  ok(
    actual === process.env.EXPECTED_SHA,
    `staging source SHA mismatch: ${String(actual || 'missing')}`,
  );
  const page = await fetch(FRONTEND, {
    redirect: 'error',
    headers: { 'Cache-Control': 'no-cache' },
  });
  ok(page.ok, `staging frontend returned ${page.status}`);
}
async function currentEmpresaId(token, label) {
  const company = data(await request('/api/empresas/minha', token), `${label} tenant`);
  const id = Number(company.id);
  ok(Number.isInteger(id) && id > 0, `${label} tenant ID missing`);
  return id;
}
async function createSector(admin, code, name) {
  const result = await request('/api/setores', admin, {
    method: 'POST',
    body: { codigo: code, nome: name },
  });
  const row = data(result, `create sector ${code}`, 201);
  state.ids.sectors.push(Number(row.id));
  return Number(row.id);
}
async function createEmployee(admin, name, sectorId, index, instructor = false) {
  const email = `${prefix.toLowerCase()}-${index}@example.invalid`;
  // CPF must be unique per run: earlier failed QA left orphans with fixed
  // index-only seeds (100000001..) that correctly return HTTP 400 on reuse.
  const runSeed = Number(
    String(process.env.GITHUB_RUN_ID || Date.now())
      .replace(/\D/g, '')
      .slice(-8) || '1',
  );
  const result = await request('/api/funcionarios', admin, {
    method: 'POST',
    body: {
      nome: name,
      email,
      cpf: cpf(runSeed * 10 + index),
      matricula: `${prefix}-${index}`,
      setor_id: sectorId,
      funcao: instructor ? 'INSTRUTOR' : 'ALUNO',
      is_instrutor: instructor,
      status: 'ATIVO',
    },
  });
  const row = data(result, `create employee ${index}`, 201);
  state.ids.employees.push(Number(row.id));
  return { id: Number(row.id), email };
}
async function createUser(admin, employee, profile, sectorIds = []) {
  const email = employee.email;
  const created = data(
    await request('/api/admin/usuarios', admin, {
      method: 'POST',
      body: {
        email,
        nome: email.split('@')[0],
        perfil: profile,
        funcionario_id: employee.id,
        setor_ids: sectorIds,
      },
    }),
    `create ${profile} user`,
    201,
  );
  const password = crypto.randomBytes(24).toString('base64url');
  data(
    await request(`/api/admin/usuarios/${created.id}/reset-senha`, admin, {
      method: 'PATCH',
      body: { nova_senha: password },
    }),
    `set ${profile} password`,
  );
  // Admin create leaves active=0 (invite-pending). Password reset alone does not
  // activate; login requires active=1. Use the existing admin update contract.
  data(
    await request(`/api/admin/usuarios/${created.id}`, admin, {
      method: 'PUT',
      body: { active: true, ...(sectorIds.length ? { setor_ids: sectorIds } : {}) },
    }),
    `activate ${profile} user`,
  );
  state.ids.users.push(Number(created.id));
  return { email, password };
}
async function createUserWithoutEmployee(admin) {
  const email = `${prefix.toLowerCase()}-no-employee@example.invalid`;
  const created = data(
    await request('/api/admin/usuarios', admin, {
      method: 'POST',
      body: { email, nome: `${prefix} Sem Funcionário`, perfil: 'ALUNO', funcionario_id: null },
    }),
    'create no-employee user',
    201,
  );
  const password = crypto.randomBytes(24).toString('base64url');
  data(
    await request(`/api/admin/usuarios/${created.id}/reset-senha`, admin, {
      method: 'PATCH',
      body: { nova_senha: password },
    }),
    'set no-employee password',
  );
  data(
    await request(`/api/admin/usuarios/${created.id}`, admin, {
      method: 'PUT',
      body: { active: true },
    }),
    'activate no-employee user',
  );
  state.ids.users.push(Number(created.id));
  return { email, password };
}
async function resolveOtherTenantUser() {
  const email = String(process.env.STAGING_SMOKE_EMAIL || '').trim();
  const password = String(process.env.STAGING_SMOKE_PASSWORD || '');
  ok(email && password, 'STAGING_SMOKE_EMAIL/PASSWORD required for cross-tenant checks');
  // Never create a second empresa here: POST /api/empresas is system-admin only.
  // Reuse the pre-seeded staging smoke tenant (same pattern as examiner H_cross_tenant).
  return { email, password };
}
async function createFicha(admin, aluno, instrutor, label) {
  const row = data(
    await request('/api/simuladores/fichas', admin, {
      method: 'POST',
      body: {
        colaborador_id_aluno: aluno.id,
        instrutor_id: instrutor.id,
        tipo_sessao: `${prefix}-${label}`,
        tipo_aeronave: 'QA',
        status: 'AVALIACAO_PENDENTE',
      },
    }),
    `create ficha ${label}`,
    201,
  );
  state.ids.fichas.push(Number(row.id));
  return Number(row.id);
}
async function list(token, suffix) {
  return data(await request(`/api/simuladores/fichas/${suffix}`, token), `list ${suffix}`);
}
function ids(rows) {
  return new Set(rows.map((row) => Number(row.id)));
}
async function runFichas(admin) {
  state.empresa_id = await currentEmpresaId(admin, 'primary');
  const ops = await createSector(admin, `${prefix}-OPS`, `${prefix} Operações`);
  const maintenance = await createSector(admin, `${prefix}-MNT`, `${prefix} Manutenção`);
  const common = await createEmployee(admin, `${prefix} Aluno`, ops, 1);
  const instructorStudent = await createEmployee(admin, `${prefix} Instrutor Aluno`, ops, 2, true);
  const instructorOne = await createEmployee(admin, `${prefix} Instrutor Um`, ops, 3, true);
  const instructorTwo = await createEmployee(
    admin,
    `${prefix} Instrutor Dois`,
    maintenance,
    4,
    true,
  );
  const thirdStudent = await createEmployee(admin, `${prefix} Aluno Três`, maintenance, 5);
  const commonUser = await createUser(admin, common, 'ALUNO');
  const instructorStudentUser = await createUser(admin, instructorStudent, 'INSTRUTOR');
  const instructorTwoUser = await createUser(admin, instructorTwo, 'INSTRUTOR');
  const managerEmployee = await createEmployee(admin, `${prefix} Gestor`, ops, 6);
  const managerUser = await createUser(admin, managerEmployee, 'GESTOR', [ops]);
  const noEmployeeUser = await createUserWithoutEmployee(admin);
  const otherTenantUser = await resolveOtherTenantUser();
  const fichaA = await createFicha(admin, instructorStudent, instructorOne, 'A');
  const fichaB = await createFicha(admin, common, instructorStudent, 'B');
  const fichaC = await createFicha(admin, thirdStudent, instructorTwo, 'C');
  const commonToken = await tokenFor(commonUser.email, commonUser.password);
  const dualToken = await tokenFor(instructorStudentUser.email, instructorStudentUser.password);
  const secondToken = await tokenFor(instructorTwoUser.email, instructorTwoUser.password);
  const managerToken = await tokenFor(managerUser.email, managerUser.password);
  const noEmployeeToken = await tokenFor(noEmployeeUser.email, noEmployeeUser.password);
  const otherTenantToken = await tokenFor(otherTenantUser.email, otherTenantUser.password);
  state.other_empresa_id = await currentEmpresaId(otherTenantToken, 'other');
  ok(
    state.other_empresa_id !== state.empresa_id,
    'foreign smoke tenant must differ from QA primary tenant',
  );
  runtime.managerToken = managerToken;
  runtime.otherTenantToken = otherTenantToken;
  const commonOwn = ids(await list(commonToken, 'minhas'));
  ok(
    commonOwn.has(fichaB) && !commonOwn.has(fichaA) && !commonOwn.has(fichaC),
    'student own list mixed',
  );
  ok(
    (await request('/api/simuladores/fichas/para-avaliar', commonToken)).status === 403,
    'student evaluation route unexpectedly allowed',
  );
  const dualOwn = ids(await list(dualToken, 'minhas'));
  const dualEval = ids(await list(dualToken, 'para-avaliar'));
  ok(
    dualOwn.has(fichaA) && !dualOwn.has(fichaB) && !dualOwn.has(fichaC),
    'dual-role own list mixed',
  );
  ok(
    dualEval.has(fichaB) && !dualEval.has(fichaA) && !dualEval.has(fichaC),
    'dual-role evaluation list mixed',
  );
  const secondEval = ids(await list(secondToken, 'para-avaliar'));
  ok(
    secondEval.has(fichaC) && !secondEval.has(fichaA) && !secondEval.has(fichaB),
    'second instructor list mixed',
  );
  const managerOwn = await list(managerToken, 'minhas');
  ok(managerOwn.length === 0, 'manager without ficha received a global list');
  ok(
    (await list(noEmployeeToken, 'minhas')).length === 0,
    'user without employee received a global list',
  );
  ok((await list(otherTenantToken, 'minhas')).length === 0, 'other tenant received fichas');
  ok(
    (await request('/api/simuladores/fichas/para-avaliar', otherTenantToken)).status === 403,
    'other tenant evaluation route unexpectedly allowed',
  );
  const legacy = await request('/api/simuladores/fichas', commonToken);
  if (legacy.status === 200) {
    const legacyIds = ids(data(legacy, 'legacy ficha route'));
    ok(
      [...legacyIds].every((id) => id === fichaB),
      'legacy route returned a mixed list',
    );
  } else {
    ok(legacy.status === 403 || legacy.status === 404, 'legacy route unexpected response');
  }
  state.fixture = {
    ops,
    maintenance,
    common,
    instructorStudent,
    instructorOne,
    instructorTwo,
    thirdStudent,
    managerEmployee,
    fichaA,
    fichaB,
    fichaC,
  };
  state.matrices.fichas = 'PASS';
}
async function runLms(admin) {
  const f = state.fixture;
  const createCourse = async (sector, label) => {
    const row = data(
      await request('/api/lms/cursos', admin, {
        method: 'POST',
        body: {
          titulo: `${prefix} ${label}`,
          carga_horaria_minutos: 1,
          tipo_conteudo: 'pdf',
          publicado: 1,
          setor_ids: [sector],
        },
      }),
      `create ${label} course`,
      201,
    );
    state.ids.courses.push(Number(row.id));
    return Number(row.id);
  };
  const opsCourse = await createCourse(f.ops, 'Ops');
  const maintenanceCourse = await createCourse(f.maintenance, 'Maintenance');
  const enroll = async (course, employee) =>
    data(
      await request('/api/lms/matriculas/lote', admin, {
        method: 'POST',
        body: { curso_id: course, funcionario_ids: [employee.id] },
      }),
      'enroll',
    );
  const opsEnrollment = (await enroll(opsCourse, f.common)).matriculas?.[0]?.id;
  const maintenanceEnrollment = (await enroll(maintenanceCourse, f.thirdStudent)).matriculas?.[0]
    ?.id;
  ok(
    Number.isInteger(opsEnrollment) && Number.isInteger(maintenanceEnrollment),
    'enrollment IDs missing',
  );
  const manager = runtime.managerToken;
  data(
    await request(`/api/lms/matriculas/${opsEnrollment}`, manager),
    'manager reads operations enrollment',
  );
  data(
    await request(`/api/lms/matriculas/${opsEnrollment}/status`, admin, {
      method: 'PATCH',
      body: { status: 'EM_ANDAMENTO' },
    }),
    'admin updates operations enrollment',
  );
  const before = data(
    await request(`/api/lms/matriculas/${maintenanceEnrollment}`, admin),
    'admin reads maintenance enrollment',
  );
  for (const [method, body] of [['GET'], ['PATCH', { status: 'EM_ANDAMENTO' }], ['DELETE']]) {
    const response = await request(
      `/api/lms/matriculas/${maintenanceEnrollment}${method === 'PATCH' ? '/status' : ''}`,
      manager,
      { method, body },
    );
    ok(response.status === 403, `manager ${method} outside sector returned ${response.status}`);
  }
  const after = data(
    await request(`/api/lms/matriculas/${maintenanceEnrollment}`, admin),
    'admin re-reads maintenance enrollment',
  );
  ok(
    after.status === before.status && after.deleted_at === before.deleted_at,
    'forbidden LMS mutation changed enrollment',
  );
  const crossTenantRead = await request(
    `/api/lms/matriculas/${maintenanceEnrollment}`,
    runtime.otherTenantToken,
  );
  ok(
    crossTenantRead.status === 403 || crossTenantRead.status === 404,
    `other tenant LMS access returned ${crossTenantRead.status}`,
  );
  state.matrices.lms = 'PASS';
}
async function cleanup(admin) {
  if (
    process.env.RETAIN_FIXTURES_ON_FAILURE === 'true' &&
    (state.matrices.fichas !== 'PASS' || state.matrices.lms !== 'PASS')
  ) {
    state.cleanup = 'RETAINED_ON_FAILURE';
    return;
  }
  ok(Number.isInteger(state.empresa_id), 'cleanup tenant ID missing');
  for (const id of state.ids.fichas)
    await request(`/api/simuladores/fichas/${id}`, admin, { method: 'DELETE' });
  for (const id of state.ids.courses)
    await request(`/api/lms/cursos/${id}`, admin, { method: 'DELETE' });
  for (const id of state.ids.users)
    await request(`/api/admin/usuarios/${id}`, admin, { method: 'DELETE' });
  for (const id of state.ids.employees)
    await request(`/api/funcionarios/${id}`, admin, { method: 'DELETE' });
  for (const id of state.ids.sectors)
    await request(`/api/setores/${id}`, admin, { method: 'DELETE' });
  if (state.ids.company)
    await request(`/api/empresas/${state.ids.company}`, admin, { method: 'DELETE' });
  state.cleanup = 'PASS';
}
async function main() {
  let admin;
  let fatalError = null;
  try {
    ok(process.env.QA_ADMIN_EMAIL && process.env.QA_ADMIN_PASSWORD, 'QA secrets unavailable');
    ok(
      process.env.STAGING_SMOKE_EMAIL && process.env.STAGING_SMOKE_PASSWORD,
      'STAGING_SMOKE secrets unavailable',
    );
    await versionGuard();
    admin = await tokenFor(process.env.QA_ADMIN_EMAIL, process.env.QA_ADMIN_PASSWORD);
    await runFichas(admin);
    await runLms(admin);
  } catch (error) {
    fatalError = error;
    throw error;
  } finally {
    if (admin) {
      try {
        await cleanup(admin);
      } catch (error) {
        state.cleanup = `FAILED: ${safeError(error)}`;
      }
    }
    writeSummary(fatalError);
  }
  ok(state.cleanup === 'PASS', `cleanup failed: ${state.cleanup}`);
}
main().catch((error) => {
  process.stderr.write(`AIRTRUST_STAGING_RUNTIME_QA_NO_GO: ${safeError(error)}\n`);
  process.exitCode = 1;
});
