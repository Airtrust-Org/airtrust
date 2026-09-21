const BASE_URL = 'https://api.airtrust.online';
const EXPECTED_TENANT_ID = 6;
const CONFIRMATION = 'AIRTRUST_PRODUCTION_COORDENACAO_IDENTITY';

export const PERMISSION_OVERRIDES = Object.freeze([
  ['dashboard.view', 'GRANT'],
  ['controle_voos.view', 'GRANT'],
  ['controle_voos.edit', 'GRANT'],
  ['controle_voos.sigvoos_preview', 'GRANT'],
  ['voos.rdv.visualizar_todos', 'GRANT'],
  ['voos.rdv.revisar', 'GRANT'],
  ['voos.rdv.corrigir', 'GRANT'],
  ['voos.rdv.devolver', 'GRANT'],
  ['voos.rdv.aprovar_coordenacao', 'GRANT'],
  ['voos.rdv.reabrir', 'GRANT'],
  ['voos.rdv.exportar_petrobras', 'GRANT'],
  ['voos.rdv.cancelar', 'GRANT'],
  ['escalas.view', 'GRANT'],
  ['escalas.edit', 'GRANT'],
  ['escalas.create', 'GRANT'],
  ['escalas.delete', 'GRANT'],
  ['escalas.publish', 'GRANT'],
  ['frms.view', 'GRANT'],
  ['frms.team.view', 'GRANT'],
  ['frms.edit', 'DENY'],
  ['frms.checkin', 'DENY'],
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

async function login(email, senha) {
  const result = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, senha }),
  });
  const body = expectStatus(result, 200, 'LOGIN_FAILED');
  const token = String(body?.data?.accessToken || body?.data?.access_token || '');
  if (!token) throw new Error('LOGIN_TOKEN_MISSING');
  return { token, body, claims: decodeJwtPayload(token) };
}

async function assertLiveProductionSha(expectedSha) {
  const result = await requestJson('/api/version');
  const body = expectStatus(result, 200, 'VERSION_FAILED');
  const liveSha = String(body?.data?.sourceSha || body?.data?.source_sha || '').toLowerCase();
  if (liveSha !== expectedSha.toLowerCase()) {
    throw new Error(`PRODUCTION_SHA_MISMATCH:${liveSha || 'missing'}`);
  }
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

function sanitizeUserRows(rows, targetEmail) {
  return rows.filter((row) => String(row?.email || '').trim().toLowerCase() === targetEmail);
}

async function getTargetUser(adminToken, targetEmail) {
  const result = await requestJson('/api/admin/usuarios', { headers: bearer(adminToken) });
  const body = expectStatus(result, 200, 'ADMIN_USERS_LIST_FAILED');
  const rows = Array.isArray(body?.data) ? body.data : [];
  const matches = sanitizeUserRows(rows, targetEmail);
  if (matches.some((row) => Number(row?.empresa_id) !== EXPECTED_TENANT_ID)) {
    throw new Error('TARGET_EMAIL_BOUND_TO_OTHER_TENANT');
  }
  if (matches.length > 1) throw new Error('TARGET_IDENTITY_MULTI_MEMBERSHIP_REJECTED');
  return matches[0] || null;
}

async function ensureInvite(adminToken, targetEmail) {
  let target = await getTargetUser(adminToken, targetEmail);
  if (target) {
    const profile = String(target.perfil || '').toUpperCase();
    if (!LOW_PRIVILEGE_PROFILES.has(profile)) {
      throw new Error(`EXISTING_PROFILE_REJECTED:${profile || 'missing'}`);
    }
    const update = await requestJson(`/api/admin/usuarios/${Number(target.id)}`, {
      method: 'PUT',
      headers: bearer(adminToken),
      body: JSON.stringify({ nome: 'Coordenação', perfil: 'USUARIO', active: true }),
    });
    expectStatus(update, 200, 'TARGET_UPDATE_FAILED');
    const invite = await requestJson(`/api/admin/usuarios/${Number(target.id)}/invite`, {
      method: 'POST',
      headers: bearer(adminToken),
    });
    const inviteBody = expectStatus(invite, 200, 'TARGET_INVITE_FAILED');
    const inviteToken = String(inviteBody?.data?.inviteToken || '');
    if (!inviteToken) throw new Error('TARGET_INVITE_TOKEN_MISSING');
    return { id: Number(target.id), inviteToken, created: false };
  }

  const created = await requestJson('/api/admin/usuarios', {
    method: 'POST',
    headers: bearer(adminToken),
    body: JSON.stringify({
      email: targetEmail,
      nome: 'Coordenação',
      perfil: 'USUARIO',
      empresa_id: EXPECTED_TENANT_ID,
    }),
  });
  const body = expectStatus(created, 201, 'TARGET_CREATE_FAILED');
  const id = Number(body?.data?.id || 0);
  const inviteToken = String(body?.data?.inviteToken || '');
  if (!Number.isInteger(id) || id <= 0 || !inviteToken) throw new Error('TARGET_CREATE_RESPONSE_INVALID');
  return { id, inviteToken, created: true };
}

async function acceptInvite(inviteToken, password) {
  const result = await requestJson('/api/auth/invite/accept', {
    method: 'POST',
    body: JSON.stringify({ token: inviteToken, senha: password }),
  });
  expectStatus(result, 200, 'TARGET_INVITE_ACCEPT_FAILED');
}

async function replacePermissions(adminToken, userId) {
  const result = await requestJson(`/api/admin/usuarios/${userId}/permissoes`, {
    method: 'PUT',
    headers: bearer(adminToken),
    body: JSON.stringify({ permissoes: PERMISSION_OVERRIDES }),
  });
  expectStatus(result, 200, 'TARGET_PERMISSIONS_FAILED');
}

async function validateTarget(targetEmail, password) {
  const session = await login(targetEmail, password);
  const tenantId = Number(session.claims?.empresa_id || 0);
  if (tenantId !== EXPECTED_TENANT_ID) throw new Error(`TARGET_TENANT_MISMATCH:${tenantId}`);

  const claimsPermissions = new Set(
    Array.isArray(session.claims?.permissions) ? session.claims.permissions.map(String) : [],
  );
  for (const permission of PERMISSION_OVERRIDES) {
    const expected = `${permission.tipo}:${permission.permissao}`;
    if (!claimsPermissions.has(expected)) throw new Error(`TARGET_PERMISSION_MISSING:${permission.permissao}`);
  }
  if (claimsPermissions.has('GRANT:voos.rdv.aprovar_comercial')) {
    throw new Error('COMMERCIAL_RDV_APPROVAL_MUST_NOT_BE_GRANTED');
  }

  const headers = bearer(session.token);
  expectStatus(
    await requestJson('/api/controle-voos/rdv/fila?limit=1', { headers }),
    200,
    'TARGET_RDV_QUEUE_READ_FAILED',
  );
  expectStatus(
    await requestJson('/api/escalas', { headers }),
    200,
    'TARGET_ESCALAS_READ_FAILED',
  );
  const today = new Date().toISOString().slice(0, 10);
  const frmsSnapshot = expectStatus(
    await requestJson(
      `/api/frms/operational-snapshot?data_inicio=${encodeURIComponent(today)}&data_fim=${encodeURIComponent(today)}`,
      { headers },
    ),
    200,
    'TARGET_FRMS_OPERATIONAL_READ_FAILED',
  );
  if (frmsSnapshot?.meta?.scope !== 'team') {
    throw new Error(`TARGET_FRMS_TEAM_SCOPE_NOT_GRANTED:${String(frmsSnapshot?.meta?.scope || 'missing')}`);
  }

  const access = expectStatus(
    await requestJson('/api/me/operational-access', { headers }),
    200,
    'TARGET_OPERATIONAL_ACCESS_FAILED',
  );
  if (access?.data?.can_checkin !== false) throw new Error('TARGET_FRMS_CHECKIN_UI_NOT_DENIED');

  const denied = await requestJson('/api/frms/fadiga-checkin', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  if (denied.status !== 403) throw new Error(`TARGET_FRMS_CHECKIN_BACKEND_NOT_DENIED:HTTP_${denied.status}`);

  return { tenantId, permissionCount: PERMISSION_OVERRIDES.length };
}

export async function main(argv = process.argv.slice(2)) {
  const apply = argv.includes('--apply');
  const expectedSha = requireEnv('EXPECTED_PRODUCTION_SHA').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('EXPECTED_PRODUCTION_SHA_INVALID');
  const adminEmail = requireEnv('PROD_SMOKE_EMAIL').toLowerCase();
  const adminPassword = requireEnv('PROD_SMOKE_PASSWORD');
  const targetEmail = requireEnv('COORDENACAO_USER_EMAIL').toLowerCase();
  const targetPassword = requireEnv('COORDENACAO_INITIAL_PASSWORD');
  if (!targetEmail.endsWith('@voecostadosol.com.br')) throw new Error('TARGET_EMAIL_DOMAIN_REJECTED');
  if (targetPassword.length < 8) throw new Error('TARGET_PASSWORD_TOO_SHORT');
  if (apply && String(process.env.CONFIRM_PRODUCTION_COORDENACAO_IDENTITY || '') !== CONFIRMATION) {
    throw new Error('PRODUCTION_COORDENACAO_CONFIRMATION_REQUIRED');
  }

  await assertLiveProductionSha(expectedSha);
  const admin = await login(adminEmail, adminPassword);
  const adminTenantId = Number(admin.claims?.empresa_id || 0);
  const adminRole = String(admin.claims?.role || '').toUpperCase();
  if (adminTenantId !== EXPECTED_TENANT_ID) throw new Error(`ADMIN_TENANT_MISMATCH:${adminTenantId}`);
  if (!ADMIN_PROFILES.has(adminRole)) throw new Error(`ADMIN_ROLE_REJECTED:${adminRole || 'missing'}`);

  const existing = await getTargetUser(admin.token, targetEmail);
  if (!apply) {
    process.stdout.write(JSON.stringify({
      ok: true,
      mode: 'dry-run',
      tenant_id: EXPECTED_TENANT_ID,
      target_exists: Boolean(existing),
      permission_count: PERMISSION_OVERRIDES.length,
      writes: 0,
      pii_emitted: false,
    }));
    return;
  }

  const provisioned = await ensureInvite(admin.token, targetEmail);
  await acceptInvite(provisioned.inviteToken, targetPassword);
  await replacePermissions(admin.token, provisioned.id);
  const validated = await validateTarget(targetEmail, targetPassword);

  process.stdout.write(JSON.stringify({
    ok: true,
    mode: 'apply',
    tenant_id: validated.tenantId,
    identity_created: provisioned.created,
    permission_count: validated.permissionCount,
    rdv_commercial_approval: false,
    frms_checkin: false,
    validated_login: true,
    pii_emitted: false,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`PRODUCTION_COORDENACAO_PROVISION_FAILED:${String(error?.message || error)}\n`);
    process.exit(1);
  });
}
