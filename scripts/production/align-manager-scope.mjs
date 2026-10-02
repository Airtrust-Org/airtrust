#!/usr/bin/env node
import {
  assert,
  assertAllowedProductionBaseUrl,
  decodeJwtPayload,
  extractAccessToken,
  fetchJson,
  login,
  selectEmpresa,
} from '../smoke-auth-common.mjs';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const DEFAULT_BASE_URL = 'https://api.airtrust.online';
const baseUrl = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || DEFAULT_BASE_URL);
const email = String(process.env.PROD_EMAIL || '')
  .trim()
  .toLowerCase();
const password = String(process.env.PROD_PASSWORD || '');
const referenceQuery = String(process.env.REFERENCE_NAME || 'Yngrid').trim();
const targetQueries = String(process.env.TARGET_NAMES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const apply = String(process.env.APPLY || '').toLowerCase() === 'true';
const expectedCandidateHash = String(
  process.env.ALIGN_MANAGER_EXPECTED_CANDIDATE_HASH || '',
).trim();
const resultFile = String(process.env.ALIGN_MANAGER_RESULT_FILE || '').trim();

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesName(row, query) {
  const needle = normalize(query);
  const names = [row.nome, row.funcionario_nome].map(normalize).filter(Boolean);
  return names.some(
    (name) => name === needle || name.startsWith(`${needle} `) || name.split(' ').includes(needle),
  );
}

function activeNameMatches(rows, query) {
  return rows.filter((row) => Number(row.active) !== 0 && matchesName(row, query));
}

function resolveUnique(rows, query, label) {
  const matches = activeNameMatches(rows, query);
  assert(
    matches.length === 1,
    `${label} '${query}' deve identificar exatamente 1 usuário; encontrados=${matches.length}`,
  );
  return matches[0];
}

function resolveOptionalUnique(rows, query, label) {
  const matches = activeNameMatches(rows, query);
  assert(
    matches.length <= 1,
    `${label} '${query}' ficou ambíguo no tenant; encontrados=${matches.length}`,
  );
  return matches[0] ?? null;
}

async function request(path, token, init = {}) {
  const response = await fetchJson(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  assert(
    response.status >= 200 && response.status < 300,
    `${init.method || 'GET'} ${path} retornou ${response.status}`,
  );
  assert(response.json?.success !== false, `${path} retornou success=false`);
  return response.json?.data ?? response.json;
}

async function selectTenantIfNeeded(token, claims, tenantId) {
  if (Number(claims?.empresa_id) === tenantId) return { token, claims };
  const selected = await selectEmpresa(baseUrl, token, tenantId);
  assert(
    selected.status === 200 && selected.json?.success === true,
    `Falha ao selecionar empresa ${tenantId}`,
  );
  const nextToken = extractAccessToken(selected.json);
  const nextClaims = decodeJwtPayload(nextToken);
  assert(Number(nextClaims?.empresa_id) === tenantId, 'Token não confirmou tenant selecionado');
  return { token: nextToken, claims: nextClaims };
}

function identitiesFromLinks(links) {
  const byUserId = new Map();
  for (const link of links) {
    const id = Number(link.usuario_id);
    if (!(id > 0) || byUserId.has(id)) continue;
    byUserId.set(id, {
      id,
      nome: link.gestor_nome,
      funcionario_nome: link.funcionario_nome,
      perfil: link.gestor_perfil,
      active: 1,
    });
  }
  return [...byUserId.values()];
}

function identitiesFromTenantUsers(users) {
  return users
    .map((user) => ({
      id: Number(user.id),
      nome: user.nome,
      perfil: user.role || user.perfil,
      active: 1,
    }))
    .filter((user) => user.id > 0);
}

function mergeIdentities(...identityLists) {
  const byUserId = new Map();
  for (const identities of identityLists) {
    for (const identity of identities) {
      if (!(Number(identity?.id) > 0)) continue;
      const previous = byUserId.get(Number(identity.id)) || {};
      byUserId.set(Number(identity.id), {
        ...previous,
        ...identity,
        nome: identity.nome || previous.nome,
        funcionario_nome: identity.funcionario_nome || previous.funcionario_nome,
        perfil: identity.perfil || previous.perfil,
        active: identity.active ?? previous.active ?? 1,
      });
    }
  }
  return [...byUserId.values()];
}

async function resolveCommonTenant(loginToken, loginClaims) {
  const companiesPayload = await request('/api/auth/empresas', loginToken);
  assert(
    companiesPayload && Array.isArray(companiesPayload.empresas),
    'Lista de empresas acessíveis inválida',
  );
  const tenantIds = [
    ...new Set(companiesPayload.empresas.map((row) => Number(row.id)).filter((id) => id > 0)),
  ];
  assert(tenantIds.length > 0, 'Credencial administrativa sem empresas acessíveis');

  const candidates = [];
  for (const tenantId of tenantIds) {
    const selected = await selectTenantIfNeeded(loginToken, loginClaims, tenantId);
    const links = await request('/api/setores-gestores', selected.token);
    assert(Array.isArray(links), `Lista de vínculos setor-gestor inválida no tenant ${tenantId}`);
    const tenantUsers = await request(`/api/empresas/${tenantId}/usuarios`, selected.token);
    assert(Array.isArray(tenantUsers), `Lista de usuários inválida no tenant ${tenantId}`);
    // A pessoa a promover ainda pode não ter vínculo em setores_gestores. A lista
    // canônica de usuários é a fonte para a identidade; os vínculos continuam
    // sendo a fonte exclusiva do escopo setorial a espelhar.
    const scopedUsers = mergeIdentities(
      identitiesFromLinks(links),
      identitiesFromTenantUsers(tenantUsers),
    );

    const referenceMatches = scopedUsers.filter((row) => matchesName(row, referenceQuery));
    const targetMatches = targetQueries.map((query) =>
      scopedUsers.filter((row) => matchesName(row, query)),
    );
    console.log(
      `TENANT_SCAN=${tenantId} users=${scopedUsers.length} reference=${activeNameMatches(scopedUsers, referenceQuery).length}/${referenceMatches.length} targets=${targetQueries
        .map(
          (query, index) =>
            `${query}:${activeNameMatches(scopedUsers, query).length}/${targetMatches[index].length}`,
        )
        .join(',')}`,
    );

    const reference = resolveOptionalUnique(scopedUsers, referenceQuery, 'referência');
    const targets = targetQueries.map((query) => resolveOptionalUnique(scopedUsers, query, 'alvo'));
    if (!reference || targets.some((target) => target === null)) continue;

    candidates.push({
      tenantId,
      token: selected.token,
      claims: selected.claims,
      users: scopedUsers,
      links,
    });
  }

  assert(
    candidates.length === 1,
    `Deve existir exatamente 1 tenant contendo referência e todos os alvos; encontrados=${candidates.length}`,
  );
  return candidates[0];
}

function isManagerRole(value) {
  return ['GESTOR', 'MANAGER'].includes(
    String(value || '')
      .trim()
      .toUpperCase(),
  );
}

function isAdminRole(value) {
  return ['ADMIN', 'ADMINISTRADOR'].includes(
    String(value || '')
      .trim()
      .toUpperCase(),
  );
}

function candidateHash({ tenantId, referenceId, targetIds, sectorIds }) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        tenant_id: tenantId,
        reference_user_id: referenceId,
        target_user_ids: [...targetIds].sort((a, b) => a - b),
        sector_ids: [...sectorIds].sort((a, b) => a - b),
      }),
    )
    .digest('hex');
}

function publishResult(result) {
  if (resultFile) writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`);
}

async function getTenantAccess(token, usuarioId, tenantId) {
  const payload = await request(`/api/empresas/usuarios/${Number(usuarioId)}/acessos`, token);
  const acessos = Array.isArray(payload?.acessos) ? payload.acessos : [];
  const tenantAccesses = acessos.filter((access) => Number(access?.empresa_id) === tenantId);
  assert(
    tenantAccesses.length === 1,
    `Usuário ${usuarioId} deve ter exatamente um acesso no tenant ${tenantId}; encontrados=${tenantAccesses.length}`,
  );
  return { acessos, tenantAccess: tenantAccesses[0] };
}

async function promoteToManagerIfNeeded({ token, usuarioId, tenantId, apply }) {
  const { acessos, tenantAccess } = await getTenantAccess(token, usuarioId, tenantId);
  const explicitProfiles = Array.isArray(tenantAccess?.perfis) ? tenantAccess.perfis : [];
  const currentRole = String(tenantAccess?.role || '')
    .trim()
    .toUpperCase();
  const alreadyManager = isManagerRole(currentRole) || explicitProfiles.some(isManagerRole);

  if (alreadyManager) return false;
  assert(
    !isAdminRole(currentRole) && !explicitProfiles.some(isAdminRole),
    `Usuário ${usuarioId} possui perfil administrativo; recusa rebaixar para GESTOR`,
  );

  console.log(`PROMOTE=${usuarioId} from=${currentRole || '-'} to=GESTOR`);
  if (!apply) return true;

  await request(`/api/empresas/usuarios/${Number(usuarioId)}/acessos`, token, {
    method: 'PUT',
    body: JSON.stringify({
      acessos: acessos.map((access) => {
        if (Number(access?.empresa_id) !== tenantId) {
          return {
            empresaId: Number(access.empresa_id),
            role: access.role,
            perfis: Array.isArray(access.perfis) ? access.perfis : [],
            modulosAtivos: Array.isArray(access.modulos_ativos) ? access.modulos_ativos : [],
          };
        }
        return {
          empresaId: tenantId,
          role: 'manager',
          perfis: ['manager'],
          modulosAtivos: Array.isArray(access.modulos_ativos) ? access.modulos_ativos : [],
        };
      }),
    }),
  });

  const refreshed = await getTenantAccess(token, usuarioId, tenantId);
  assert(
    isManagerRole(refreshed.tenantAccess?.role) ||
      (Array.isArray(refreshed.tenantAccess?.perfis) &&
        refreshed.tenantAccess.perfis.some(isManagerRole)),
    `Usuário ${usuarioId} não ficou com perfil GESTOR`,
  );
  return true;
}

async function main() {
  assert(email && password, 'Credenciais de produção ausentes');
  assert(targetQueries.length > 0, 'TARGET_NAMES deve conter ao menos um usuário');

  const loginPayload = await login(baseUrl, email, password);
  const loginToken = extractAccessToken(loginPayload);
  const loginClaims = decodeJwtPayload(loginToken);
  assert(
    ['ADMIN', 'ADMINISTRADOR'].includes(String(loginClaims?.role || '').toUpperCase()),
    'Credencial não possui perfil administrativo',
  );

  const tenant = await resolveCommonTenant(loginToken, loginClaims);
  const { tenantId, token, claims, users: scopedUsers, links } = tenant;
  assert(
    ['ADMIN', 'ADMINISTRADOR'].includes(String(claims?.role || '').toUpperCase()),
    'Sessão selecionada no tenant não possui perfil administrativo',
  );

  const reference = resolveUnique(scopedUsers, referenceQuery, 'referência');
  const targets = targetQueries.map((query) => resolveUnique(scopedUsers, query, 'alvo'));

  assert(isManagerRole(reference.perfil), 'A referência não possui perfil GESTOR compatível');
  assert(Array.isArray(links), 'Lista de vínculos setor-gestor inválida');
  const byUser = (userId, source = links) =>
    source.filter((link) => Number(link.usuario_id) === Number(userId) && link.ativo !== false);
  const referenceLinks = byUser(reference.id);
  assert(referenceLinks.length > 0, 'Ingrid não possui setores ativos para espelhar');
  const desired = new Set(referenceLinks.map((link) => Number(link.setor_id)));
  const reviewedHash = candidateHash({
    tenantId,
    referenceId: reference.id,
    targetIds: targets.map((target) => target.id),
    sectorIds: desired,
  });
  assert(
    !expectedCandidateHash || expectedCandidateHash === reviewedHash,
    'O conjunto de candidatos não corresponde ao dry-run revisado',
  );

  console.log(`MODE=${apply ? 'APPLY' : 'DRY_RUN'}`);
  console.log(`TENANT_ID=${tenantId}`);
  console.log(
    `REFERENCE_USER_ID=${reference.id} sectors=${[...desired].sort((a, b) => a - b).join(',')}`,
  );
  console.log(`CANDIDATE_HASH=${reviewedHash}`);

  for (const target of targets) {
    await promoteToManagerIfNeeded({
      token,
      usuarioId: target.id,
      tenantId,
      apply,
    });

    const currentLinks = byUser(target.id);
    const current = new Set(currentLinks.map((link) => Number(link.setor_id)));
    const missing = [...desired].filter((id) => !current.has(id));
    const extra = [...current].filter((id) => !desired.has(id));
    console.log(
      `TARGET_USER_ID=${target.id} missing=${missing.join(',') || '-'} extra=${extra.join(',') || '-'}`,
    );

    if (!apply) continue;

    for (const setorId of missing) {
      await request('/api/setores-gestores', token, {
        method: 'POST',
        body: JSON.stringify({
          setor_id: setorId,
          usuario_id: Number(target.id),
          role: 'manager',
          ativo: true,
        }),
      });
    }

    const refreshedLinks = await request('/api/setores-gestores', token);
    const targetLinks = byUser(target.id, refreshedLinks);
    for (const link of targetLinks) {
      if (!desired.has(Number(link.setor_id))) {
        await request(`/api/setores-gestores/${Number(link.id)}`, token, {
          method: 'DELETE',
        });
      }
    }
  }

  const finalLinks = await request('/api/setores-gestores', token);
  for (const target of targets) {
    const finalSet = new Set(byUser(target.id, finalLinks).map((link) => Number(link.setor_id)));
    if (apply) {
      const { tenantAccess } = await getTenantAccess(token, target.id, tenantId);
      assert(
        isManagerRole(tenantAccess?.role) ||
          (Array.isArray(tenantAccess?.perfis) && tenantAccess.perfis.some(isManagerRole)),
        `${target.nome} não ficou com perfil GESTOR`,
      );
      assert(
        finalSet.size === desired.size && [...desired].every((id) => finalSet.has(id)),
        `${target.nome} não ficou com o mesmo escopo setorial da Ingrid`,
      );
      console.log(
        `VERIFIED_USER_ID=${target.id} setores=${[...finalSet].sort((a, b) => a - b).join(',')}`,
      );
    }
  }

  publishResult({
    mode: apply ? 'apply' : 'dry-run',
    source_sha: process.env.GITHUB_SHA || null,
    empresa_id: tenantId,
    candidate_count: targets.length,
    candidate_hash: reviewedHash,
    reference_profile_verified: true,
    reference_sector_count: desired.size,
    mutation_executed: apply,
    postconditions_verified: apply,
    pii_emitted: false,
  });
}

main().catch((error) => {
  console.error(
    `ALIGN_MANAGER_SCOPE_FAILED=${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
