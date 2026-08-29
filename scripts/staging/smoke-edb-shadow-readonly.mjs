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

  // eDB capability is authenticated. This GET must fail before tenant
  // discovery for an anonymous request and must never create domain data.
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

  // Capability is deliberately a lightweight authenticated discovery endpoint.
  // For a valid tenant outside EDB_SHADOW_PILOT_TENANTS it remains HTTP 200,
  // but must advertise enabled=false and non-official/non-replacing semantics.
  const capability = await fetchJson(`${baseUrl}/api/edb/capability`, { headers });
  assert(capability.status === 200, `capability do tenant QA deveria retornar 200; recebeu ${capability.status}`);
  assert(capability.json?.success === true, 'capability do tenant QA sem success=true');
  assert(capability.json?.data?.enabled === false, 'capability do tenant QA deveria anunciar enabled=false');
  assert(
    capability.json?.data?.classification === 'NON_OFFICIAL_SHADOW_PILOT_CAPABILITY',
    'classification inesperada na capability eDB',
  );
  assert(capability.json?.data?.officialLogbook === false, 'capability nao pode anunciar diario oficial');
  assert(capability.json?.data?.replacesPaper === false, 'capability nao pode anunciar substituicao do papel');

  // Every non-capability eDB route is protected by the system-level pilot gate.
  // This request therefore has to fail closed before the inner eDB router can
  // read flight 1 (or touch any eDB domain table) for tenant 999002.
  const readiness = await fetchJson(`${baseUrl}/api/edb/voos/1/readiness`, { headers });
  assert(readiness.status === 404, `readiness fora da allowlist deveria retornar 404; recebeu ${readiness.status}`);
  assert(
    responseCode(readiness.json) === 'EDB_SHADOW_PILOT_NOT_ENABLED',
    `readiness fora da allowlist nao retornou EDB_SHADOW_PILOT_NOT_ENABLED`,
  );

  console.log(`EDB_STAGING_READONLY_SMOKE_PASS release=${expectedSha}`);
  console.log('EDB_STAGING_FAIL_CLOSED_PASS anonymous=401 capabilityEnabled=false nonPilotTenant=404');
  console.log('EDB_STAGING_POSITIVE_TENANT_6_NOT_EXERCISED no synthetic tenant-6 credential is configured');
}

main().catch((error) => {
  console.error(`EDB_STAGING_READONLY_SMOKE_FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});