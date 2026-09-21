const BASE_URL = 'https://api.airtrust.online';
const EXPECTED_TENANT_ID = 6;
const CONFIRMATION = 'AIRTRUST_PRODUCTION_COORDENACAO_CONTROL_ACCESS';

export const REQUIRED_OVERRIDES = Object.freeze([
  ['controle_voos.view', 'GRANT'],
  ['controle_voos.edit', 'GRANT'],
  ['controle_voos.sigvoos_preview', 'GRANT'],
  ['voos.rdv.visualizar_proprio', 'GRANT'],
  ['voos.rdv.criar_proprio', 'GRANT'],
  ['voos.rdv.editar_rascunho_proprio', 'GRANT'],
  ['voos.rdv.enviar', 'GRANT'],
  ['voos.rdv.visualizar_todos', 'GRANT'],
  ['voos.rdv.revisar', 'GRANT'],
  ['voos.rdv.corrigir', 'GRANT'],
  ['voos.rdv.devolver', 'GRANT'],
  ['voos.rdv.aprovar_coordenacao', 'GRANT'],
  ['voos.rdv.aprovar_comercial', 'GRANT'],
  ['voos.rdv.reabrir', 'GRANT'],
  ['voos.rdv.exportar_petrobras', 'GRANT'],
  ['voos.rdv.cancelar', 'GRANT'],
  ['treinamentos.view', 'DENY'],
].map(([permissao, tipo]) => ({ permissao, tipo })));

const LOW_PRIVILEGE_PROFILES = new Set(['USUARIO', 'ALUNO', 'VIEWER']);
const ADMIN_PROFILES = new Set(['ADMINISTRADOR', 'ADMIN', 'GESTOR', 'MANAGER']);

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

function decodeJwtPayload(token) {
  const part = String(token || '').split('.')[1];
  if (!part) throw new Error('ACCESS_TOKEN_INVALID');
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  return { status: response.status, json };
}

function expectStatus(result, expected, code) {
  if (result.status !== expected) {
    const apiCode = String(result.json?.code || result.json?.error || 'unknown');
    throw new Error(`${code}:HTTP_${result.status}:${apiCode}`);
  }
  return result.json;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function login(email, senha) {
  const result = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, senha }),
  });
  const body = expectStatus(result, 200, 'ADMIN_LOGIN_FAILED');
  const token = String(body?.data?.accessToken || body?.data?.access_token || '');
  if (!token) throw new Error('ADMIN_LOGIN_TOKEN_MISSING');
  return { token, claims: decodeJwtPayload(token) };
}

async function assertLiveProductionSha(expectedSha) {
  const body = expectStatus(await requestJson('/api/version'), 200, 'VERSION_FAILED');
  const actual = String(body?.data?.sourceSha || body?.data?.source_sha || '').toLowerCase();
  if (actual !== expectedSha.toLowerCase()) throw new Error(`PRODUCTION_SHA_MISMATCH:${actual || 'missing'}`);
}

async function resolveTarget(adminToken, targetEmail) {
  const body = expectStatus(
    await requestJson('/api/admin/usuarios', { headers: bearer(adminToken) }),
    200,
    'ADMIN_USERS_LIST_FAILED',
  );
  const rows = Array.isArray(body?.data) ? body.data : [];
  const matches = rows.filter((row) => String(row?.email || '').trim().toLowerCase() === targetEmail);
  if (matches.length === 0) throw new Error('TARGET_IDENTITY_NOT_FOUND');
  if (matches.some((row) => Number(row?.empresa_id) !== EXPECTED_TENANT_ID)) {
    throw new Error('TARGET_EMAIL_BOUND_TO_OTHER_TENANT');
  }
  if (matches.length !== 1) throw new Error('TARGET_IDENTITY_MULTI_MEMBERSHIP_REJECTED');
  const target = matches[0];
  const profile = String(target?.perfil || '').toUpperCase();
  if (!LOW_PRIVILEGE_PROFILES.has(profile)) throw new Error(`TARGET_PROFILE_REJECTED:${profile || 'missing'}`);
  return { id: Number(target.id), profile };
}

function mergeRequiredOverrides(current) {
  const map = new Map();
  for (const row of current) {
    const permissao = String(row?.permissao || '').trim();
    const tipo = String(row?.tipo || '').trim().toUpperCase();
    if (permissao && (tipo === 'GRANT' || tipo === 'DENY')) map.set(permissao, tipo);
  }
  for (const row of REQUIRED_OVERRIDES) map.set(row.permissao, row.tipo);
  return [...map.entries()]
    .map(([permissao, tipo]) => ({ permissao, tipo }))
    .sort((a, b) => a.permissao.localeCompare(b.permissao));
}

function assertRequiredOverrides(rows) {
  const map = new Map(rows.map((row) => [String(row.permissao), String(row.tipo).toUpperCase()]));
  for (const required of REQUIRED_OVERRIDES) {
    if (map.get(required.permissao) !== required.tipo) {
      throw new Error(`TARGET_OVERRIDE_MISMATCH:${required.permissao}`);
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  const apply = argv.includes('--apply');
  const expectedSha = requireEnv('EXPECTED_PRODUCTION_SHA').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('EXPECTED_PRODUCTION_SHA_INVALID');
  if (apply && String(process.env.CONFIRM_PRODUCTION_COORDENACAO_CONTROL_ACCESS || '') !== CONFIRMATION) {
    throw new Error('PRODUCTION_COORDENACAO_CONFIRMATION_REQUIRED');
  }

  const adminEmail = requireEnv('PROD_SMOKE_EMAIL').toLowerCase();
  const adminPassword = requireEnv('PROD_SMOKE_PASSWORD');
  const targetEmail = requireEnv('COORDENACAO_USER_EMAIL').toLowerCase();
  if (!targetEmail.endsWith('@voecostadosol.com.br')) throw new Error('TARGET_EMAIL_DOMAIN_REJECTED');

  await assertLiveProductionSha(expectedSha);
  const admin = await login(adminEmail, adminPassword);
  const adminTenantId = Number(admin.claims?.empresa_id || 0);
  const adminRole = String(admin.claims?.role || '').toUpperCase();
  if (adminTenantId !== EXPECTED_TENANT_ID) throw new Error(`ADMIN_TENANT_MISMATCH:${adminTenantId}`);
  if (!ADMIN_PROFILES.has(adminRole)) throw new Error(`ADMIN_ROLE_REJECTED:${adminRole || 'missing'}`);

  const target = await resolveTarget(admin.token, targetEmail);
  const currentBody = expectStatus(
    await requestJson(`/api/admin/usuarios/${target.id}/permissoes`, { headers: bearer(admin.token) }),
    200,
    'TARGET_PERMISSIONS_READ_FAILED',
  );
  const current = Array.isArray(currentBody?.data) ? currentBody.data : [];
  const merged = mergeRequiredOverrides(current);

  if (!apply) {
    process.stdout.write(JSON.stringify({
      ok: true,
      mode: 'dry-run',
      tenant_id: EXPECTED_TENANT_ID,
      current_count: current.length,
      final_count: merged.length,
      required_override_count: REQUIRED_OVERRIDES.length,
      writes: 0,
      pii_emitted: false,
    }));
    return;
  }

  expectStatus(
    await requestJson(`/api/admin/usuarios/${target.id}/permissoes`, {
      method: 'PUT',
      headers: bearer(admin.token),
      body: JSON.stringify({ permissoes: merged }),
    }),
    200,
    'TARGET_PERMISSIONS_UPDATE_FAILED',
  );

  const afterBody = expectStatus(
    await requestJson(`/api/admin/usuarios/${target.id}/permissoes`, { headers: bearer(admin.token) }),
    200,
    'TARGET_PERMISSIONS_VERIFY_FAILED',
  );
  const after = Array.isArray(afterBody?.data) ? afterBody.data : [];
  assertRequiredOverrides(after);

  process.stdout.write(JSON.stringify({
    ok: true,
    mode: 'apply',
    tenant_id: EXPECTED_TENANT_ID,
    final_count: after.length,
    required_override_count: REQUIRED_OVERRIDES.length,
    control_voos_total: true,
    training_area_denied: true,
    pii_emitted: false,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`COORDENACAO_CONTROL_ACCESS_UPDATE_FAILED:${String(error?.message || error)}\n`);
    process.exit(1);
  });
}
