#!/usr/bin/env node

import {
  assert,
  assertAllowedStagingBaseUrl,
  decodeJwtPayload,
  extractAccessToken,
  fetchJson,
  login,
  maskEmail,
} from '../smoke-auth-common.mjs';

const DEFAULT_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev';
const CANONICAL_QA_EMAIL = 'qa-agent@staging.airtrust.invalid';
const CANONICAL_QA_TENANT = 999002;
const EDB_PILOT_TENANT = 6;

function responseCode(payload) {
  return payload?.code ?? payload?.error?.code ?? payload?.data?.code ?? null;
}

async function main() {
  const baseUrl = assertAllowedStagingBaseUrl(
    process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL,
  );
  const expectedSha = String(process.env.EXPECTED_EDB_RELEASE_SHA || '').trim().toLowerCase();
  const email = String(process.env.STAGING_SMOKE_EMAIL || '').trim().toLowerCase();
  const password = process.env.STAGING_SMOKE_PASSWORD;

  assert(/^[0-9a-f]{40}$/.test(expectedSha), 'EXPECTED_EDB_RELEASE_SHA deve ser SHA-1 hexadecimal de 40 caracteres');
  assert(email === CANONICAL_QA_EMAIL, 'STAGING_SMOKE_EMAIL nao e a identidade QA canonica');
  assert(typeof password === 'string' && password.length > 0, 'STAGING_SMOKE_PASSWORD ausente');
  assert(CANONICAL_QA_TENANT !== EDB_PILOT_TENANT, 'QA sintetico nao pode pertencer ao tenant piloto eDB');

  console.log(`[EDB-SMOKE] staging=${baseUrl}`);
  console.log(`[EDB-SMOKE] qa=${maskEmail(email)} tenant=${CANONICAL_QA_TENANT}; piloto=${EDB_PILOT_TENANT}`);

  // Public provenance is read-only and proves that the exact reviewed eDB
  // application release is what staging is serving before any authenticated
  // assertion is attempted.
  const version = await fetchJson(`${baseUrl}/api/version`);
  assert(version.status === 200, `/api/version retornou ${version.status}`);
  assert(version.json?.success === true, '/api/version sem success=true');
  assert(version.json?.data?.environment === 'staging', '/api/version nao reportou staging');
  assert(
    String(version.json?.data?.sourceSha || '').toLowerCase() === expectedSha,
    `/api/version sourceSha divergente do release esperado`,
  );

  // eDB is authenticated. This GET must fail before tenant resolution and must
  // never create domain data.
  const anonymousCapability = await fetchJson(`${baseUrl}/api/edb/capability`);
  assert(
    anonymousCapability.status === 401,
    `eDB capability anonima deveria retornar 401; recebeu ${anonymousCapability.status}`,
  );
  const anonymousCode = responseCode(anonymousCapability.json);
  if (anonymousCode !== null) {
    assert(anonymousCode === 'MISSING_TOKEN', `codigo anonimo inesperado: ${anonymousCode}`);
  }

  // Authentication may create/refresh authentication-session metadata, but
  // from this point forward this smoke issues GET requests only. It never
  // creates or mutates flights, regulatory inputs, diaries, revisions,
  // signatures, maintenance actions or any other eDB operational record.
  const loginPayload = await login(baseUrl, email, password);
  const token = extractAccessToken(loginPayload);
  const claims = decodeJwtPayload(token);
  assert(Number(claims?.empresa_id) === CANONICAL_QA_TENANT, 'tenant JWT da identidade QA divergente');
  assert(Number(claims?.empresa_id) !== EDB_PILOT_TENANT, 'identidade QA nao deve simular tenant piloto');

  const headers = { Authorization: `Bearer ${token}` };

  // The canonical QA tenant is deliberately outside EDB_SHADOW_PILOT_TENANTS.
  // A live 404/EDB_SHADOW_DISABLED proves the deployed Worker is fail-closed
  // for a valid authenticated tenant that is not allowlisted.
  const capability = await fetchJson(`${baseUrl}/api/edb/capability`, { headers });
  assert(capability.status === 404, `tenant QA fora da allowlist deveria retornar 404; recebeu ${capability.status}`);
  assert(
    responseCode(capability.json) === 'EDB_SHADOW_DISABLED',
    `tenant QA fora da allowlist nao retornou EDB_SHADOW_DISABLED`,
  );

  // Use another GET route to prove the gate is router-wide and executes before
  // flight lookup; voo 1 must therefore not be read or mutated for this tenant.
  const readiness = await fetchJson(`${baseUrl}/api/edb/voos/1/readiness`, { headers });
  assert(readiness.status === 404, `readiness fora da allowlist deveria retornar 404; recebeu ${readiness.status}`);
  assert(
    responseCode(readiness.json) === 'EDB_SHADOW_DISABLED',
    'readiness fora da allowlist nao retornou EDB_SHADOW_DISABLED',
  );

  console.log(`EDB_STAGING_READONLY_SMOKE_PASS release=${expectedSha}`);
  console.log('EDB_STAGING_FAIL_CLOSED_PASS anonymous=401 nonPilotTenant=404');
  console.log('EDB_STAGING_POSITIVE_TENANT_6_NOT_EXERCISED no synthetic tenant-6 credential is configured');
}

main().catch((error) => {
  console.error(`EDB_STAGING_READONLY_SMOKE_FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
