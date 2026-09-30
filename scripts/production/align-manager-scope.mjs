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

const DEFAULT_BASE_URL = 'https://api.airtrust.online';
const baseUrl = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || DEFAULT_BASE_URL);
const email = String(process.env.PROD_EMAIL || '')
  .trim()
  .toLowerCase();
const password = String(process.env.PROD_PASSWORD || '');
const referenceQuery = String(process.env.REFERENCE_NAME || 'Ingrid').trim();
const targetQueries = String(process.env.TARGET_NAMES || 'Giancarlo,Emily,Laila')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const apply = String(process.env.APPLY || '').toLowerCase() === 'true';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesName(row, query) {
  const name = normalize(row.nome || row.funcionario_nome);
  const needle = normalize(query);
  return name === needle || name.startsWith(`${needle} `) || name.split(' ').includes(needle);
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
    const users = await request('/api/admin/usuarios', selected.token);
    assert(Array.isArray(users), `Lista de usuários inválida no tenant ${tenantId}`);
    const scopedUsers = users.filter((row) => Number(row.empresa_id) === tenantId);

    const reference = resolveOptionalUnique(scopedUsers, referenceQuery, 'referência');
    const targets = targetQueries.map((query) => resolveOptionalUnique(scopedUsers, query, 'alvo'));
    if (!reference || targets.some((target) => target === null)) continue;

    candidates.push({
      tenantId,
      token: selected.token,
      claims: selected.claims,
      users: scopedUsers,
    });
  }

  assert(
    candidates.length === 1,
    `Deve existir exatamente 1 tenant contendo referência e todos os alvos; encontrados=${candidates.length}`,
  );
  return candidates[0];
}

async function main() {
  assert(email && password, 'Credenciais de produção ausentes');
  assert(targetQueries.length === 3, 'TARGET_NAMES deve conter exatamente 3 usuários');

  const loginPayload = await login(baseUrl, email, password);
  const loginToken = extractAccessToken(loginPayload);
  const loginClaims = decodeJwtPayload(loginToken);
  assert(
    ['ADMIN', 'ADMINISTRADOR'].includes(String(loginClaims?.role || '').toUpperCase()),
    'Credencial não possui perfil administrativo',
  );

  const tenant = await resolveCommonTenant(loginToken, loginClaims);
  const { tenantId, token, claims, users: scopedUsers } = tenant;
  assert(
    ['ADMIN', 'ADMINISTRADOR'].includes(String(claims?.role || '').toUpperCase()),
    'Sessão selecionada no tenant não possui perfil administrativo',
  );

  const reference = resolveUnique(scopedUsers, referenceQuery, 'referência');
  const targets = targetQueries.map((query) => resolveUnique(scopedUsers, query, 'alvo'));

  assert(
    String(reference.perfil || '').toUpperCase() === 'GESTOR',
    'Ingrid não está com perfil GESTOR',
  );
  targets.forEach((target) =>
    assert(
      String(target.perfil || '').toUpperCase() === 'GESTOR',
      `${target.nome} não está com perfil GESTOR`,
    ),
  );

  const links = await request('/api/setores-gestores', token);
  assert(Array.isArray(links), 'Lista de vínculos setor-gestor inválida');
  const byUser = (userId, source = links) =>
    source.filter((link) => Number(link.usuario_id) === Number(userId) && link.ativo !== false);
  const referenceLinks = byUser(reference.id);
  assert(referenceLinks.length > 0, 'Ingrid não possui setores ativos para espelhar');
  const desired = new Set(referenceLinks.map((link) => Number(link.setor_id)));

  console.log(`MODE=${apply ? 'APPLY' : 'DRY_RUN'}`);
  console.log(`TENANT_ID=${tenantId}`);
  console.log(
    `REFERENCE=${reference.nome} setores=${[...desired].sort((a, b) => a - b).join(',')}`,
  );

  for (const target of targets) {
    const currentLinks = byUser(target.id);
    const current = new Set(currentLinks.map((link) => Number(link.setor_id)));
    const missing = [...desired].filter((id) => !current.has(id));
    const extra = [...current].filter((id) => !desired.has(id));
    console.log(
      `TARGET=${target.nome} missing=${missing.join(',') || '-'} extra=${extra.join(',') || '-'}`,
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
      assert(
        finalSet.size === desired.size && [...desired].every((id) => finalSet.has(id)),
        `${target.nome} não ficou com o mesmo escopo setorial da Ingrid`,
      );
      console.log(
        `VERIFIED=${target.nome} setores=${[...finalSet].sort((a, b) => a - b).join(',')}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(
    `ALIGN_MANAGER_SCOPE_FAILED=${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
