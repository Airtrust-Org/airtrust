#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  assert,
  assertAllowedProductionBaseUrl,
  assertAllowedStagingBaseUrl,
  buildReadOnlyEndpointSpecs,
  decodeJwtPayload,
  extractAccessToken,
  fetchJson,
  login,
  maskEmail,
  NEGATIVE_SMOKE_PATHS,
} from './smoke-auth-common.mjs';

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const EXPECTED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const EXPECTED_D1_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const EXPECTED_ENVIRONMENT = 'staging';

async function main() {
  const baseUrl = assertAllowedStagingBaseUrl(process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL);

  log(`BASE_URL=${baseUrl}`);

  validateGitState();
  validateWranglerStagingConfig();
  validateProductionCanonicalGuard();

  await checkHealth(baseUrl);
  await checkVersion(baseUrl);
  await runNegativeSmoke(baseUrl);
  await runAuthenticatedSmoke(baseUrl);

  log('STAGING_DOCTOR_DONE');
}

function validateGitState() {
  const branchResult = runGit(['branch', '--show-current']);
  const currentBranch = branchResult.stdout.trim();

  if (currentBranch) {
    assert(currentBranch === 'main', `branch atual deve ser main; recebeu ${currentBranch}`);
    log(`GIT_BRANCH=${currentBranch}`);
  } else {
    log('GIT_BRANCH_SKIPPED=detached-head');
  }

  const statusResult = runGit(['status', '--short']);
  const status = statusResult.stdout.trim();
  assert(status === '', `working tree nao esta limpa:\n${status}`);
  log('GIT_STATUS=CLEAN');
}

function validateWranglerStagingConfig() {
  const wranglerPath = path.resolve(process.cwd(), 'worker-airtrust', 'wrangler.toml');
  const contents = fs.readFileSync(wranglerPath, 'utf8');
  const stagingStart = contents.indexOf('[env.staging]');
  assert(stagingStart >= 0, 'wrangler.toml nao possui bloco [env.staging]');
  const productionStart = contents.indexOf('\n[env.production]', stagingStart);
  const stagingBlock = contents.slice(stagingStart, productionStart > -1 ? productionStart : undefined);

  assert(
    /ENVIRONMENT\s*=\s*"staging"/.test(stagingBlock),
    'wrangler.toml env.staging deve definir ENVIRONMENT = "staging"',
  );
  assert(
    /name\s*=\s*"airtrust-api-staging"/.test(stagingBlock),
    'wrangler.toml env.staging deve apontar para o worker airtrust-api-staging',
  );
  assert(
    /database_name\s*=\s*"airtrust-db-staging-baseline-20260701"/.test(stagingBlock),
    `wrangler.toml env.staging deve apontar para ${EXPECTED_D1_NAME}`,
  );
  assert(
    /database_id\s*=\s*"bf9963f4-eb12-439b-a830-20bbf577ac22"/.test(stagingBlock),
    `wrangler.toml env.staging deve manter o database_id de ${EXPECTED_D1_ID}`,
  );

  log(`WRANGLER_STAGING_DB=${EXPECTED_D1_NAME}`);
}

function validateProductionCanonicalGuard() {
  let rejected = false;
  try {
    assertAllowedProductionBaseUrl('https://airtrust-api.airtrust.workers.dev');
  } catch {
    rejected = true;
  }

  assert(rejected, 'guard de producao nao rejeitou airtrust-api.airtrust.workers.dev');
  log('PRODUCTION_ALIAS_BLOCKED=PASS');
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

async function runAuthenticatedSmoke(baseUrl) {
  const email = String(process.env.STAGING_SMOKE_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.STAGING_SMOKE_PASSWORD || '');

  assert(email.length > 0, 'STAGING_SMOKE_EMAIL ausente');
  assert(password.length > 0, 'STAGING_SMOKE_PASSWORD ausente');

  const loginPayload = await login(baseUrl, email, password);
  const accessToken = extractAccessToken(loginPayload);
  const jwtClaims = decodeJwtPayload(accessToken);

  assert(jwtClaims && typeof jwtClaims === 'object', 'JWT invalido');
  assert(typeof jwtClaims.email === 'string', 'JWT sem email');
  assert(jwtClaims.email.toLowerCase() === email, 'JWT com email divergente');
  assert(Number.isInteger(Number(jwtClaims.empresa_id)) && Number(jwtClaims.empresa_id) > 0, 'JWT sem empresa_id valido');

  log(`LOGIN_OK user=${maskEmail(email)} empresa_id=${jwtClaims.empresa_id}`);

  for (const spec of buildReadOnlyEndpointSpecs(email)) {
    const response = await fetchJson(`${baseUrl}${spec.path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert(response.status === spec.expectedStatus, `${spec.name} retornou ${response.status}`);
    const result = spec.validate(response.json);
    log(
      [
        `AUTH_OK ${spec.name}`,
        `status=${response.status}`,
        `count=${result?.count ?? 0}`,
        result?.sample ? `sample=${JSON.stringify(result.sample)}` : 'sample=null',
      ].join(' '),
    );
  }

  log('AUTH_SMOKE_DONE');
}

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const stderr = String(result.stderr || result.stdout || '').trim();
    throw new Error(stderr || `git ${args.join(' ')} falhou`);
  }

  return { stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
}

function log(message) {
  process.stdout.write(`[staging-doctor] ${message}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[staging-doctor][ERROR] ${message}\n`);
  process.exitCode = 1;
});
