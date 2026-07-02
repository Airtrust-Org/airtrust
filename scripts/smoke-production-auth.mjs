#!/usr/bin/env node

import {
  assert,
  assertAllowedProductionBaseUrl,
  buildReadOnlyEndpointSpecs,
  decodeJwtPayload,
  extractAccessToken,
  fetchJson,
  login,
  maskEmail,
  NEGATIVE_SMOKE_PATHS,
} from './smoke-auth-common.mjs';

const DEFAULT_BASE_URL = 'https://api.airtrust.online';
const REQUIRED_SECRET_VARS = ['PROD_SMOKE_EMAIL', 'PROD_SMOKE_PASSWORD'];
const EXPECTED_ENVIRONMENT = 'production';

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRunFlag = args.has('--dry-run');
  const strict = args.has('--strict') || process.env.CI === 'true';
  const baseUrl = assertAllowedProductionBaseUrl(process.env.PROD_API_BASE_URL || DEFAULT_BASE_URL);

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

  const email = String(process.env.PROD_SMOKE_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.PROD_SMOKE_PASSWORD || '');

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

  log('AUTH_SMOKE_DONE');
}

async function checkHealth(baseUrl) {
  const response = await fetchJson(`${baseUrl}/api/health`);
  assert(response.status === 200, `/api/health retornou ${response.status}`);
  const environment = response.json?.stats?.environment ?? response.json?.environment;
  if (environment) {
    assert(String(environment) === EXPECTED_ENVIRONMENT, `health nao confirmou production: ${environment}`);
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
  process.stdout.write(`[production-auth-smoke] ${message}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[production-auth-smoke][ERROR] ${message}\n`);
  process.exitCode = 1;
});
