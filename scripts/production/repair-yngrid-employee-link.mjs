#!/usr/bin/env node
/**
 * Governed reconciliation of exactly one pre-reviewed user/employee identity.
 * Never changes tenant membership, roles, phone, LMS enrollment or certificates.
 * Uses the existing tenant-admin API (no raw D1 SQL).
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  assertAllowedProductionBaseUrl, decodeJwtPayload, extractAccessToken,
  fetchJson, login, selectEmpresa,
} from '../smoke-auth-common.mjs';

const TENANT = 6;
const upper = v => String(v || '').trim().toUpperCase();
const norm = v => String(v || '').trim().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase();
const matches = (name, query) => norm(name) === norm(query) ||
  norm(name).startsWith(norm(query) + ' ');

function requireCondition(ok, code) { if (!ok) throw Error(code); }
export function selectStrictLinkCandidate({ users, staff, access, target='Yngrid' }) {
  requireCondition(Array.isArray(users) && Array.isArray(staff), 'DATA_INVALID');
  requireCondition(norm(target) === 'yngrid', 'TARGET_NOT_ALLOWLISTED');

  const selected = users.filter(u => Number(u.empresa_id) === TENANT &&
    Number(u.active) === 1 && matches(u.nome, target));
  requireCondition(selected.length === 1, 'USER_NOT_UNIQUE_ACTIVE_TENANT');
  const user = selected[0], userId = Number(user.id);
  requireCondition(Number.isSafeInteger(userId) && userId > 0, 'USER_ID_INVALID');
  const allMemberships = users.filter(u => Number(u.id) === userId);
  requireCondition(allMemberships.length === 1 &&
    Number(allMemberships[0].empresa_id) === TENANT, 'GLOBAL_IDENTITY_MULTITENANT');
  requireCondition(['ADMIN','ADMINISTRADOR'].includes(upper(user.perfil)), 'USER_ROLE_CHANGED');
  requireCondition(user.funcionario_id === null || user.funcionario_id === undefined,
    'EXISTING_USER_LINK_REQUIRES_MANUAL_REVIEW');

  requireCondition(access && ['ADMIN','ADMINISTRADOR'].includes(upper(access.role)),
    'TENANT_ROLE_NOT_ADMIN');
  const profiles = access.perfis || [];
  requireCondition(Array.isArray(profiles) &&
    profiles.length === 1 && ['ADMIN','ADMINISTRADOR'].includes(upper(profiles[0])),
    'TENANT_PROFILES_CHANGED');

  const email = norm(user.email);
  requireCondition(email.length > 3 && email.includes('@'), 'EMAIL_INVALID');
  const employeeCandidates = staff.filter(f => Number(f.empresa_id) === TENANT &&
    norm(f.email) === email && matches(f.nome, target) &&
    Number(f.ativo) === 1 && upper(f.status) === 'ATIVO');
  requireCondition(employeeCandidates.length === 1, 'EMPLOYEE_NOT_UNIQUE_ACTIVE_EMAIL');
  const employee = employeeCandidates[0], employeeId = Number(employee.id);
  requireCondition(Number.isSafeInteger(employeeId) && employeeId > 0, 'EMPLOYEE_ID_INVALID');

  // Global admin listing includes all tenant memberships; block any reuse
  // of this employee identity by another user (including deactivated users).
  requireCondition(!users.some(u => Number(u.id) !== userId &&
    Number(u.funcionario_id) === employeeId), 'EMPLOYEE_LINK_CONFLICT');
  return { tenantId: TENANT, userId, employeeId, normalizedEmail: email };
}

/** Server-side anti-join over active identities, including users without tenant memberships. */
export function assertListedUnlinkedEmployee(rows, employeeId) {
  requireCondition(Array.isArray(rows), 'UNLINKED_STAFF_LIST_INVALID');
  requireCondition(rows.some(row => Number(row.id) === employeeId),
    rows.length >= 200 ? 'UNLINKED_STAFF_LIST_TRUNCATED' : 'EMPLOYEE_ALREADY_LINKED_OR_UNAVAILABLE');
}

export function linkCandidateHash(candidate, productionSha) {
  const canonical = {
    tenant: candidate.tenantId, user: candidate.userId,
    employee: candidate.employeeId, email: candidate.normalizedEmail,
    productionSha,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

async function main() {
  const mode = String(process.env.LINK_MODE || '').trim().toLowerCase();
  requireCondition(['dry-run', 'apply'].includes(mode), 'MODE_INVALID');
  const base = assertAllowedProductionBaseUrl(
    process.env.PROD_API_BASE_URL || 'https://api.airtrust.online');
  const expectedSha = String(process.env.EXPECTED_PRODUCTION_SHA || '').toLowerCase();
  requireCondition(/^[0-9a-f]{40}$/.test(expectedSha), 'EXPECTED_SHA_INVALID');
  const version = await fetchJson(base + '/api/version');
  requireCondition(version.status === 200 && version.json?.data?.environment === 'production' &&
    String(version.json?.data?.sourceSha).toLowerCase() === expectedSha, 'PRODUCTION_SHA_DRIFT');

  const email = String(process.env.PROD_EMAIL || '');
  const password = String(process.env.PROD_PASSWORD || '');
  requireCondition(email && password, 'PROD_CREDENTIALS_MISSING');
  let token = extractAccessToken(await login(base, email, password));
  let claims = decodeJwtPayload(token);
  if (Number(claims?.empresa_id) !== TENANT) {
    const chosen = await selectEmpresa(base, token, TENANT);
    requireCondition(chosen.status === 200 && chosen.json?.success === true,
      'TENANT_SELECT_FAILED');
    token = extractAccessToken(chosen.json);
    claims = decodeJwtPayload(token);
  }
  requireCondition(Number(claims?.empresa_id) === TENANT &&
    ['ADMIN','ADMINISTRADOR'].includes(upper(claims?.role)), 'ADMIN_TENANT_REQUIRED');

  async function request(path, init) {
    requireCondition(/^\/api\/(?:admin\/usuarios(?:\/funcionarios-sem-usuario|\/[0-9]+)?|funcionarios(?:\?.*)?|empresas\/usuarios\/[0-9]+\/acessos)$/.test(path),
      'API_PATH_NOT_ALLOWED');
    const response = await fetchJson(base + path, {
      ...init, headers: { Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    requireCondition(response.status >= 200 && response.status < 300 &&
      response.json?.success === true, 'API_STATUS_' + response.status);
    return response.json.data;
  }

  async function collect() {
    const users = await request('/api/admin/usuarios');
    requireCondition(Array.isArray(users), 'USER_LIST_INVALID');
    const selected = users.filter(u => Number(u.empresa_id) === TENANT &&
      Number(u.active) === 1 && matches(u.nome, 'Yngrid'));
    requireCondition(selected.length === 1, 'TARGET_USER_AMBIGUOUS');
    const staff = new Map();
    for (const query of ['Yngrid', selected[0].email]) {
      const rows = await request('/api/funcionarios?search=' +
        encodeURIComponent(query) + '&limit=100');
      requireCondition(Array.isArray(rows), 'STAFF_SEARCH_INVALID');
      for (const row of rows) staff.set(Number(row.id), {...row,empresa_id:TENANT});
    }
    const access = await request('/api/empresas/usuarios/' +
      Number(selected[0].id) + '/acessos');
    const current = (access?.acessos || []).filter(a => Number(a.empresa_id) === TENANT);
    requireCondition(current.length === 1, 'TENANT_PROFILE_AMBIGUOUS');
    const candidate = selectStrictLinkCandidate({
      users, staff: [...staff.values()], access: current[0], target: 'Yngrid',
    });
    const unlinked = await request('/api/admin/usuarios/funcionarios-sem-usuario');
    assertListedUnlinkedEmployee(unlinked, candidate.employeeId);
    return candidate;
  }

  const candidate = await collect();
  const hash = linkCandidateHash(candidate, expectedSha);
  let changed = false, verified = false;
  if (mode === 'apply') {
    requireCondition(String(process.env.REVIEWED_CANDIDATE_HASH || '') === hash,
      'CANDIDATE_HASH_DRIFT');
    // Re-read before mutation. The server endpoint is still the authority,
    // and can reject the update; the runner never bypasses it.
    const again = await collect();
    requireCondition(linkCandidateHash(again, expectedSha) === hash,
      'IDENTITY_DRIFT_BEFORE_WRITE');
    const result = await request('/api/admin/usuarios/' + candidate.userId, {
      method: 'PUT', body: JSON.stringify({funcionario_id:candidate.employeeId}),
    });
    requireCondition(Number(result?.funcionario_id) === candidate.employeeId,
      'UPDATE_RESPONSE_LINK_MISMATCH');
    const readback = await request('/api/admin/usuarios/' + candidate.userId);
    requireCondition(Number(readback?.funcionario_id) === candidate.employeeId &&
      ['ADMIN','ADMINISTRADOR'].includes(upper(readback.perfil)),
      'READBACK_LINK_OR_ROLE_MISMATCH');
    changed = true;
    verified = true;
  }
  const output = {
    mode, source_sha: process.env.GITHUB_SHA || null,
    production_sha: expectedSha, empresa_id: TENANT,
    candidate_count: 1, candidate_hash: hash,
    profile_preserved: true, employee_active: true,
    employee_email_identity_unique: true, employee_other_user_conflict: false,
    mutation_executed: changed, postconditions_verified: verified, pii_emitted: false,
    touched: changed ? ['usuarios.funcionario_id'] : [],
  };
  const file = String(process.env.REPAIR_RESULT_FILE || '');
  requireCondition(file.length > 0, 'RESULT_FILE_MISSING');
  writeFileSync(file, JSON.stringify(output, null, 2) + '\n', {mode:0o600});
  process.stdout.write('YNGRID_IDENTITY_' + mode.toUpperCase().replace('-', '_') + '_PASS\n');
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => {
    const code = String(error?.message || 'UNKNOWN').replace(/[^A-Z0-9_]/g,'_').slice(0,72);
    process.stderr.write('YNGRID_LINK_GOVERNED_FAILED=' + code + '\n');
    process.exitCode = 1;
  });
}
