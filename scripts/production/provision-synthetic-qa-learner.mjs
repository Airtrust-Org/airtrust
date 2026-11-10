#!/usr/bin/env node
/**
 * AIRTRUST — Provisionamento da Identidade Sintética de QA para LMS
 *
 * Cria e configura o aluno de teste autorizado:
 *   Nome: AIRTRUST_QA_LMS_E2E_202611
 *   Matrícula: QA-LMS-202611
 *   Email: qa.lms.202611@airtrust.online
 *   Role: ALUNO
 *   Empresa: Costa do Sol Táxi Aéreo (empresa_id = 6)
 *   Cargo: Aluno de Teste QA
 *
 * Regras:
 * - Somente APIs e contratos oficiais do AirTrust (POST /api/funcionarios, POST /api/admin/usuarios).
 * - Sem mutações diretas ad-hoc de SQL/D1.
 * - Idempotente: se já existir, verifica e reutiliza ou atualiza credenciais conforme modo.
 * - Zero PII: dados 100% sintéticos.
 */

import {
  assert,
  assertAllowedProductionBaseUrl,
  decodeJwtPayload,
  extractAccessToken,
  fetchJson,
  login,
  selectEmpresa,
} from '../smoke-auth-common.mjs';

const API = assertAllowedProductionBaseUrl(
  process.env.PROD_API_BASE_URL || 'https://api.airtrust.online',
);
const EXPECTED_SHA = String(process.env.EXPECTED_PRODUCTION_SHA || '').trim().toLowerCase();
const TARGET_COMPANY_ID = Number(process.env.TARGET_COMPANY_ID || 6);

export const SYNTHETIC_LEARNER = Object.freeze({
  nome: 'AIRTRUST_QA_LMS_E2E_202611',
  matricula: 'QA-LMS-202611',
  email: 'qa.lms.202611@airtrust.online',
  cargo: 'Aluno de Teste QA',
  setor: 'Treinamento e Capacitação',
  perfil: 'ALUNO',
  // CPF sintético matematicamente válido (prefixo 999000001 + d1:8, d2:8)
  cpf: '99900000188',
});

export function generateValidTestCpf(prefix = '999000001') {
  const digits = prefix.slice(0, 9).split('').map(Number);
  let sum1 = 0;
  for (let i = 0; i < 9; i++) sum1 += digits[i] * (10 - i);
  let d1 = 11 - (sum1 % 11);
  if (d1 >= 10) d1 = 0;
  digits.push(d1);
  let sum2 = 0;
  for (let i = 0; i < 10; i++) sum2 += digits[i] * (11 - i);
  let d2 = 11 - (sum2 % 11);
  if (d2 >= 10) d2 = 0;
  digits.push(d2);
  return digits.join('');
}

export function assertLearnerClaims(token, expectedFuncionarioId) {
  const claims = decodeJwtPayload(token);
  assert(Number(claims?.empresa_id) === TARGET_COMPANY_ID, 'LEARNER_TOKEN_WRONG_TENANT');
  assert(Number(claims?.funcionario_id) === expectedFuncionarioId, 'LEARNER_TOKEN_WRONG_EMPLOYEE');
  assert(
    ['ALUNO', 'student'].includes(String(claims?.role || '').trim()),
    'LEARNER_TOKEN_ROLE_NOT_ALUNO',
  );
  return claims;
}

async function request(token, path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  return fetchJson(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function assertPinnedProduction() {
  if (EXPECTED_SHA) {
    assert(/^[0-9a-f]{40}$/.test(EXPECTED_SHA), 'EXPECTED_PRODUCTION_SHA_INVALID');
    const response = await fetchJson(`${API}/api/version`);
    assert(response.status === 200, `PRODUCTION_VERSION_HTTP_${response.status}`);
    const body =
      response.json?.data && typeof response.json.data === 'object'
        ? response.json.data
        : response.json;
    const actual = String(body?.sourceSha || body?.source_sha || '').toLowerCase();
    assert(actual === EXPECTED_SHA, `PRODUCTION_SHA_MISMATCH:${actual || 'missing'}`);
  }
}

async function getAdminToken() {
  const email = String(
    process.env.PROD_SMOKE_EMAIL || process.env.QA_EXAMINER_ADMIN_EMAIL || '',
  ).trim();
  const password = String(
    process.env.PROD_SMOKE_PASSWORD || process.env.QA_EXAMINER_ADMIN_PASSWORD || '',
  );
  assert(email && password, 'ADMIN_CREDENTIALS_MISSING');

  const logged = await login(API, email, password);
  let token = extractAccessToken(logged);
  const memberships = await request(token, '/api/auth/empresas');
  assert(memberships.status === 200, `AUTH_EMPRESAS_HTTP_${memberships.status}`);
  const list = Array.isArray(memberships.json?.data?.empresas)
    ? memberships.json.data.empresas
    : [];
  assert(
    list.some((item) => Number(item?.id || 0) === TARGET_COMPANY_ID),
    'TARGET_COMPANY_NOT_AUTHORIZED',
  );

  const current = Number(memberships.json?.data?.empresaAtualId || 0);
  if (current !== TARGET_COMPANY_ID) {
    const selected = await selectEmpresa(API, token, TARGET_COMPANY_ID);
    assert(selected.status === 200 && selected.json?.success === true, 'SELECT_EMPRESA_FAILED');
    token = extractAccessToken(selected.json);
  }

  const claims = decodeJwtPayload(token);
  assert(Number(claims?.empresa_id) === TARGET_COMPANY_ID, 'ADMIN_TENANT_MISMATCH');
  assert(
    ['ADMIN', 'ADMINISTRADOR'].includes(String(claims?.role || '').trim().toUpperCase()),
    'ADMIN_ROLE_REQUIRED',
  );
  return token;
}

export async function findExistingEmployee(adminToken, matricula) {
  const res = await request(adminToken, `/api/funcionarios?limit=100&search=${encodeURIComponent(matricula)}`);
  if (res.status === 200 && Array.isArray(res.json?.data)) {
    const found = res.json.data.find(
      (f) => String(f.matricula || '').trim().toUpperCase() === matricula.toUpperCase(),
    );
    if (found) return found;
  }
  return null;
}

export async function findExistingUser(adminToken, email) {
  const res = await request(adminToken, '/api/admin/usuarios');
  if (res.status === 200 && Array.isArray(res.json?.data)) {
    const found = res.json.data.find(
      (u) => String(u.email || '').trim().toLowerCase() === email.toLowerCase(),
    );
    if (found) return found;
  }
  return null;
}

export async function provisionLearner({ mode = 'inspect', learnerPassword }) {
  await assertPinnedProduction();
  const adminToken = await getAdminToken();

  console.log(`[QA_PROVISION] Iniciando em modo: ${mode}`);

  // 1. Verificar funcionário
  let employee = await findExistingEmployee(adminToken, SYNTHETIC_LEARNER.matricula);
  let employeeCreated = false;

  if (employee) {
    console.log(`[QA_PROVISION] Funcionário existente encontrado: id=${employee.id}, matrícula=${employee.matricula}`);
  } else if (mode === 'apply') {
    console.log(`[QA_PROVISION] Criando funcionário sintético: ${SYNTHETIC_LEARNER.matricula}...`);
    const createEmpRes = await request(adminToken, '/api/funcionarios', {
      method: 'POST',
      body: {
        nome: SYNTHETIC_LEARNER.nome,
        matricula: SYNTHETIC_LEARNER.matricula,
        email: SYNTHETIC_LEARNER.email,
        cpf: SYNTHETIC_LEARNER.cpf,
        cargo: SYNTHETIC_LEARNER.cargo,
        setor: SYNTHETIC_LEARNER.setor,
      },
    });

    assert(
      createEmpRes.status === 200 || createEmpRes.status === 201,
      `CREATE_EMPLOYEE_FAILED_HTTP_${createEmpRes.status}: ${JSON.stringify(createEmpRes.json)}`,
    );
    employee = createEmpRes.json?.data;
    assert(employee && Number(employee.id) > 0, 'CREATE_EMPLOYEE_ID_MISSING');
    employeeCreated = true;
    console.log(`[QA_PROVISION] Funcionário criado com sucesso: id=${employee.id}`);
  } else {
    console.log(`[QA_PROVISION] [INSPECT] Funcionário não existe ainda na empresa ${TARGET_COMPANY_ID}.`);
  }

  // 2. Verificar usuário
  let user = await findExistingUser(adminToken, SYNTHETIC_LEARNER.email);
  let userCreated = false;
  let passwordConfigured = false;

  if (user) {
    console.log(`[QA_PROVISION] Usuário existente encontrado: id=${user.id}, email=${user.email}, perfil=${user.perfil}`);
    if (mode === 'apply' && learnerPassword) {
      console.log(`[QA_PROVISION] Redefinindo senha para garantir acesso previsível...`);
      const resetRes = await request(adminToken, `/api/admin/usuarios/${user.id}/reset-senha`, {
        method: 'PATCH',
        body: { nova_senha: learnerPassword },
      });
      assert(resetRes.status === 200, `RESET_PASSWORD_FAILED_HTTP_${resetRes.status}`);
      passwordConfigured = true;
      console.log(`[QA_PROVISION] Senha do aluno redefinida.`);
    }
  } else if (mode === 'apply') {
    assert(employee && Number(employee.id) > 0, 'EMPLOYEE_REQUIRED_BEFORE_USER');
    assert(learnerPassword && learnerPassword.length >= 8, 'VALID_LEARNER_PASSWORD_REQUIRED');

    console.log(`[QA_PROVISION] Criando usuário aluno e convite...`);
    const createUserRes = await request(adminToken, '/api/admin/usuarios', {
      method: 'POST',
      body: {
        email: SYNTHETIC_LEARNER.email,
        nome: SYNTHETIC_LEARNER.nome,
        perfil: 'ALUNO',
        funcionario_id: Number(employee.id),
        empresa_id: TARGET_COMPANY_ID,
      },
    });

    assert(
      createUserRes.status === 201 || createUserRes.status === 200,
      `CREATE_USER_FAILED_HTTP_${createUserRes.status}: ${JSON.stringify(createUserRes.json)}`,
    );
    user = createUserRes.json?.data;
    const inviteToken = user?.inviteToken;
    assert(inviteToken, 'INVITE_TOKEN_MISSING');
    console.log(`[QA_PROVISION] Usuário criado: id=${user.id}. Aceitando convite com senha segura...`);

    const acceptRes = await request(null, '/api/auth/invite/accept', {
      method: 'POST',
      body: {
        token: inviteToken,
        senha: learnerPassword,
      },
    });
    assert(
      acceptRes.status === 200,
      `ACCEPT_INVITE_FAILED_HTTP_${acceptRes.status}: ${JSON.stringify(acceptRes.json)}`,
    );
    userCreated = true;
    passwordConfigured = true;
    console.log(`[QA_PROVISION] Convite aceito e conta do aluno ativada.`);
  } else {
    console.log(`[QA_PROVISION] [INSPECT] Usuário não existe ainda na empresa ${TARGET_COMPANY_ID}.`);
  }

  // 3. Teste de login do aluno
  let learnerSession = null;
  if (passwordConfigured || (user && learnerPassword)) {
    console.log(`[QA_PROVISION] Verificando login real do aluno...`);
    const loginRes = await login(API, SYNTHETIC_LEARNER.email, learnerPassword);
    const token = extractAccessToken(loginRes);
    assert(token, 'LEARNER_LOGIN_TOKEN_MISSING');
    assertLearnerClaims(token, Number(employee.id));

    // Confirmar perfil com /api/auth/me
    const meRes = await request(token, '/api/auth/me');
    assert(meRes.status === 200, `LEARNER_ME_HTTP_${meRes.status}`);
    const me = meRes.json?.data;
    assert(String(me?.role).toUpperCase() === 'ALUNO', 'LEARNER_ME_ROLE_NOT_ALUNO');

    // Confirmar catálogo de cursos
    const catRes = await request(token, '/api/lms/cursos?limit=10');
    assert(catRes.status === 200, `LEARNER_CATALOG_HTTP_${catRes.status}`);

    learnerSession = {
      user_id: user?.id,
      funcionario_id: employee?.id,
      role: 'ALUNO',
      empresa_id: TARGET_COMPANY_ID,
      catalog_accessible: true,
      ready: true,
    };
    console.log(`[QA_PROVISION] Login do aluno validado com sucesso! Pronto para testes LMS.`);
  }

  return {
    mode,
    employee_id: employee?.id ?? null,
    employee_created: employeeCreated,
    user_id: user?.id ?? null,
    user_created: userCreated,
    password_configured: passwordConfigured,
    learner_ready: learnerSession?.ready === true,
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] === '--apply' ? 'apply' : 'inspect';
  const learnerPassword = process.env.QA_LEARNER_PASSWORD || 'AirTrust_QA_202611_Lms!';

  provisionLearner({ mode, learnerPassword })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('PROVISIONING_ERROR:', err.message || err);
      process.exit(1);
    });
}
