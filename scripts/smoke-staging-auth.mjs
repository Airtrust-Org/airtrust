#!/usr/bin/env node

import {
  assert,
  assertAllowedStagingBaseUrl,
  buildReadOnlyEndpointSpecs,
  decodeJwtPayload,
  extractAccessToken,
  extractRefreshToken,
  fetchJson,
  login,
  logout,
  maskEmail,
  NEGATIVE_SMOKE_PATHS,
  refreshTokens,
  selectEmpresa,
} from './smoke-auth-common.mjs';

// empresaId sentinela: nao existe em nenhum ambiente real (fora do range
// de sequencia autoincrement plausivel). Usado apenas para o teste
// negativo de isolamento de tenant via /api/auth/select-empresa — nunca
// deve corresponder a uma empresa real, e a rota rejeita (401) antes de
// qualquer escrita quando o vinculo nao existe.
const CROSS_TENANT_SENTINEL_EMPRESA_ID = 999999999;

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const REQUIRED_SECRET_VARS = ['STAGING_SMOKE_EMAIL', 'STAGING_SMOKE_PASSWORD'];
const EXPECTED_ENVIRONMENT = 'staging';

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRunFlag = args.has('--dry-run');
  const strict = args.has('--strict') || process.env.CI === 'true';
  const baseUrl = assertAllowedStagingBaseUrl(process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL);

  log(`BASE_URL=${baseUrl}`);

  await checkHealth(baseUrl);
  await checkVersion(baseUrl);
  await runNegativeSmoke(baseUrl);

  const missingVars = REQUIRED_SECRET_VARS.filter((name) => !String(process.env[name] || '').trim());
  if (missingVars.length > 0 || dryRunFlag) {
    log(`AUTH_SMOKE_MODE=${dryRunFlag ? 'dry-run-flag' : 'missing-secrets'}`);
    if (missingVars.length > 0) {
      log(`MISSING_SECRETS=${missingVars.join(',')}`);
    }
    if (strict && missingVars.length > 0) {
      throw new Error(`Segredos obrigatorios ausentes: ${missingVars.join(', ')}`);
    }
    log('AUTH_SMOKE_SKIPPED');
    return;
  }

  const email = String(process.env.STAGING_SMOKE_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.STAGING_SMOKE_PASSWORD || '');

  const loginPayload = await login(baseUrl, email, password);
  const accessToken = extractAccessToken(loginPayload);
  const jwtClaims = decodeJwtPayload(accessToken);

  assert(jwtClaims && typeof jwtClaims === 'object', 'JWT invalido');
  assert(typeof jwtClaims.email === 'string', 'JWT sem email');
  assert(jwtClaims.email.toLowerCase() === email, 'JWT com email divergente');
  assert(Number.isInteger(Number(jwtClaims.empresa_id)) && Number(jwtClaims.empresa_id) > 0, 'JWT sem empresa_id valido');
  assert(typeof jwtClaims.role === 'string' && jwtClaims.role.length > 0, 'JWT sem role');

  log(`LOGIN_OK user=${maskEmail(email)} empresa_id=${jwtClaims.empresa_id} role=${jwtClaims.role}`);

  for (const spec of buildReadOnlyEndpointSpecs(email)) {
    const response = await fetchJson(`${baseUrl}${spec.path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert(response.status === spec.expectedStatus, `${spec.name} retornou ${response.status}`);
    const result = spec.validate(response.json);
    const count = result?.count ?? 0;
    log(
      [
        `AUTH_OK ${spec.name}`,
        `status=${response.status}`,
        `json=true`,
        `count=${count}`,
        result?.sample ? `sample=${JSON.stringify(result.sample)}` : 'sample=null',
      ].join(' '),
    );
  }

  const mePayload = await fetchJson(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meData = mePayload.json?.data ?? {};

  assert(String(meData.email || '').toLowerCase() === email, 'auth/me email divergente do login');
  assert(String(meData.role || '').length > 0, 'auth/me role vazio');
  assert(
    Number(jwtClaims.empresa_id) > 0 && !Array.isArray(meData.empresas) && !('tenant_ids' in meData),
    'indicio de payload cross-tenant em auth/me',
  );

  const refreshToken1 = extractRefreshToken(loginPayload);

  // ── isolamento de tenant: empresaId sentinela nao vinculado ao usuario
  const crossTenantResponse = await selectEmpresa(baseUrl, accessToken, CROSS_TENANT_SENTINEL_EMPRESA_ID);
  assert(
    crossTenantResponse.status === 401 || crossTenantResponse.status === 403,
    `select-empresa com empresaId sentinela deveria retornar 401/403, retornou ${crossTenantResponse.status}`,
  );
  assert(
    crossTenantResponse.json?.success !== true,
    'select-empresa com empresaId sentinela retornou success=true (indicio de cross-tenant)',
  );
  log(`CROSS_TENANT_REJECTED status=${crossTenantResponse.status}`);

  // ── refresh: rotaciona access+refresh token
  const refreshResponse = await refreshTokens(baseUrl, refreshToken1);
  assert(refreshResponse.status === 200, `refresh retornou ${refreshResponse.status}`);
  assert(refreshResponse.json?.success === true, 'refresh sem success=true');
  const accessToken2 = extractAccessToken(refreshResponse.json);
  const refreshToken2 = extractRefreshToken(refreshResponse.json);
  assert(accessToken2 !== accessToken, 'refresh nao emitiu um novo access token');
  assert(refreshToken2 !== refreshToken1, 'refresh nao rotacionou o refresh token');
  log('REFRESH_OK rotated=true');

  // ── novo access token deve funcionar
  const meAfterRefresh = await fetchJson(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken2}` },
  });
  assert(meAfterRefresh.status === 200, `auth/me com novo access token retornou ${meAfterRefresh.status}`);
  log('NEW_ACCESS_TOKEN_OK status=200');

  // ── refresh token antigo (ja rotacionado) deve ser rejeitado
  const oldRefreshRetry = await refreshTokens(baseUrl, refreshToken1);
  assert(
    oldRefreshRetry.status === 401,
    `refresh com refreshToken ja rotacionado deveria retornar 401, retornou ${oldRefreshRetry.status}`,
  );
  log('OLD_REFRESH_TOKEN_REJECTED status=401');

  // ── logout: revoga access token atual (jti) e o refresh token atual
  const logoutResponse = await logout(baseUrl, { accessToken: accessToken2, refreshToken: refreshToken2 });
  assert(logoutResponse.status === 200, `logout retornou ${logoutResponse.status}`);
  assert(logoutResponse.json?.success === true, 'logout sem success=true');
  log('LOGOUT_OK status=200');

  // ── access token pos-logout deve ser rejeitado (blocklist de jti)
  const meAfterLogout = await fetchJson(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken2}` },
  });
  assert(
    meAfterLogout.status === 401,
    `auth/me com access token pos-logout deveria retornar 401, retornou ${meAfterLogout.status}`,
  );
  log('ACCESS_TOKEN_REVOKED_AFTER_LOGOUT status=401');

  // ── refresh token pos-logout deve ser rejeitado (revoked_at setado)
  const refreshAfterLogout = await refreshTokens(baseUrl, refreshToken2);
  assert(
    refreshAfterLogout.status === 401,
    `refresh com refreshToken pos-logout deveria retornar 401, retornou ${refreshAfterLogout.status}`,
  );
  log('REFRESH_TOKEN_REVOKED_AFTER_LOGOUT status=401');

  log('AUTH_SMOKE_DONE');
}

async function checkHealth(baseUrl) {
  const response = await fetchJson(`${baseUrl}/api/health`);
  assert(response.status === 200, `/api/health retornou ${response.status}`);
  const environment = response.json?.stats?.environment ?? response.json?.environment;
  if (environment) {
    assert(String(environment) === EXPECTED_ENVIRONMENT, `health nao confirmou staging: ${environment}`);
  }
  log(`HEALTH_OK status=200 environment=${String(environment || EXPECTED_ENVIRONMENT)}`);
}

async function checkVersion(baseUrl) {
  const response = await fetchJson(`${baseUrl}/api/version`);
  assert(response.status === 200, `/api/version retornou ${response.status}`);
  log(`VERSION_OK status=200 version=${String(response.json?.version || response.json?.data?.version || 'unknown')}`);
}

async function runNegativeSmoke(baseUrl) {
  for (const path of NEGATIVE_SMOKE_PATHS) {
    const response = await fetchJson(`${baseUrl}${path}`);
    assert(response.status === 401, `${path} sem token deveria retornar 401, retornou ${response.status}`);
    log(`NEGATIVE_OK path=${path} status=401`);
  }
}

function log(message) {
  process.stdout.write(`[staging-auth-smoke] ${message}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[staging-auth-smoke][ERROR] ${message}\n`);
  process.exitCode = 1;
});
