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
const QA_EMAIL = 'qa-edb-pilot@staging.airtrust.invalid';
const PILOT_TENANT_ID = 6;
const IMPOSSIBLE_AIRCRAFT_ID = 2147483647;
const IMPOSSIBLE_FLIGHT_ID = 2147483647;

async function main() {
  const baseUrl = assertAllowedStagingBaseUrl(process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL);
  const expectedSha = String(process.env.EXPECTED_EDB_RELEASE_SHA || '').trim().toLowerCase();
  const email = String(process.env.QA_EDB_PILOT_EMAIL || QA_EMAIL).trim().toLowerCase();
  const password = String(process.env.QA_EDB_PILOT_PASSWORD || '');

  assert(/^[0-9a-f]{40}$/.test(expectedSha), 'EXPECTED_EDB_RELEASE_SHA deve ser SHA-1 hexadecimal de 40 caracteres');
  assert(email === QA_EMAIL, 'QA_EDB_PILOT_EMAIL deve ser a identidade sintética canônica');
  assert(password.length > 0, 'QA_EDB_PILOT_PASSWORD ausente');

  console.log(`[EDB-PILOT] staging=${baseUrl}`);
  console.log(`[EDB-PILOT] qa=${maskEmail(email)} tenant=${PILOT_TENANT_ID}`);

  const version = await fetchJson(`${baseUrl}/api/version`);
  assert(version.status === 200, `/api/version retornou ${version.status}`);
  assert(version.json?.success === true, '/api/version sem success=true');
  assert(version.json?.data?.environment === 'staging', '/api/version nao reportou staging');
  assert(
    String(version.json?.data?.sourceSha || '').toLowerCase() === expectedSha,
    '/api/version sourceSha divergente do release eDB esperado',
  );

  const loginPayload = await login(baseUrl, email, password);
  const token = extractAccessToken(loginPayload);
  const claims = decodeJwtPayload(token);
  assert(Number(claims?.empresa_id) === PILOT_TENANT_ID, 'tenant JWT da identidade eDB piloto divergente');
  const headers = { Authorization: `Bearer ${token}` };

  const capability = await fetchJson(`${baseUrl}/api/edb/capability`, { headers });
  assert(capability.status === 200, `capability tenant 6 deveria retornar 200; recebeu ${capability.status}`);
  assert(capability.json?.success === true, 'capability tenant 6 sem success=true');
  assert(capability.json?.data?.enabled === true, 'capability tenant 6 deveria estar enabled=true');
  assert(
    capability.json?.data?.classification === 'NON_OFFICIAL_SHADOW_PILOT_CAPABILITY',
    'classificação eDB piloto inesperada',
  );
  assert(capability.json?.data?.officialLogbook === false, 'shadow não pode declarar diário oficial');
  assert(capability.json?.data?.replacesPaper === false, 'shadow não pode declarar substituição do papel');

  // Read-only operational path. The deliberately impossible aircraft id proves
  // that the tenant-6 pilot gate and manager RBAC were crossed without reading,
  // creating or mutating a real flight, aircraft diary, revision or signature.
  const activeDiary = await fetchJson(
    `${baseUrl}/api/edb/aircraft/${IMPOSSIBLE_AIRCRAFT_ID}/active-diary`,
    { headers },
  );
  assert(activeDiary.status === 200, `active-diary sintético deveria retornar 200; recebeu ${activeDiary.status}`);
  assert(activeDiary.json?.success === true, 'active-diary sintético sem success=true');
  assert(activeDiary.json?.data === null, 'aircraft id impossível não deveria possuir diário ativo');
  assert(
    String(activeDiary.headers?.['x-airtrust-edb-mode'] || '').toLowerCase() === 'staging-shadow-not-regulatory',
    'header de modo eDB shadow ausente ou divergente',
  );

  // Regression evidence for the local eDB error adapter. The source repository
  // throws ApiError(404, CONTROLE_VOOS_NOT_FOUND) for this impossible flight.
  // The shadow route must preserve that safe status/code instead of collapsing
  // it into EDB_SHADOW_INTERNAL_ERROR/500, while still hiding the raw message.
  const missingFlightReadiness = await fetchJson(
    `${baseUrl}/api/edb/voos/${IMPOSSIBLE_FLIGHT_ID}/readiness`,
    { headers },
  );
  assert(
    missingFlightReadiness.status === 404,
    `readiness de voo inexistente deveria retornar 404; recebeu ${missingFlightReadiness.status}`,
  );
  assert(missingFlightReadiness.json?.success === false, 'readiness inexistente deveria retornar success=false');
  assert(
    missingFlightReadiness.json?.code === 'CONTROLE_VOOS_NOT_FOUND',
    `readiness inexistente deveria preservar CONTROLE_VOOS_NOT_FOUND; recebeu ${String(missingFlightReadiness.json?.code || '')}`,
  );
  assert(
    missingFlightReadiness.json?.error === 'Operação eDB shadow rejeitada',
    'readiness inexistente deveria manter mensagem pública genérica',
  );
  assert(
    !JSON.stringify(missingFlightReadiness.json || {}).includes('Voo nao encontrado'),
    'readiness inexistente não pode vazar mensagem interna do repositório',
  );
  assert(
    String(missingFlightReadiness.headers?.['x-airtrust-edb-mode'] || '').toLowerCase() === 'staging-shadow-not-regulatory',
    'header de modo eDB shadow ausente no erro 404 governado',
  );

  console.log(`EDB_STAGING_PILOT_POSITIVE_PASS release=${expectedSha} tenant=${PILOT_TENANT_ID}`);
  console.log('EDB_STAGING_PILOT_READONLY_PASS capability=true activeDiarySynthetic=null');
  console.log('EDB_STAGING_PILOT_APIERROR_404_PASS code=CONTROLE_VOOS_NOT_FOUND rawMessageLeak=false');
  console.log('EDB_STAGING_PILOT_OPERATIONAL_MUTATIONS=none');
  console.log('EDB_STAGING_PILOT_PRODUCTION_ACTION=none ANAC_TRANSMISSION=none');
}

main().catch((error) => {
  console.error(`EDB_STAGING_PILOT_POSITIVE_FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
