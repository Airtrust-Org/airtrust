#!/usr/bin/env node

import { readFileSync } from 'node:fs';
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

function manifest() {
  const path = String(process.env.QA_EDB_FULL_MANIFEST_PATH || '.qa-edb-full-lifecycle.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  assert(/^QA-EDB-FULL-[A-Z0-9._-]{3,48}$/.test(String(data.fixtureId || '')), 'manifest fixtureId inválido');
  assert(Number(data.tenantId) === PILOT_TENANT_ID, 'manifest tenant divergente');
  for (const key of ['actorUserId', 'actorEmployeeId', 'aircraftId', 'flightId', 'stageId', 'crewId', 'rdvId']) {
    assert(Number.isInteger(Number(data[key])) && Number(data[key]) > 0, `manifest ${key} inválido`);
  }
  return data;
}

function body(value) {
  return JSON.stringify(value);
}

async function api(baseUrl, path, headers, method = 'GET', payload) {
  const result = await fetchJson(`${baseUrl}${path}`, {
    method,
    headers: {
      ...headers,
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: payload === undefined ? undefined : body(payload),
  });
  assert(
    String(result.headers?.['x-airtrust-edb-mode'] || '').toLowerCase() === 'staging-shadow-not-regulatory',
    `${method} ${path}: header eDB shadow ausente`,
  );
  return result;
}

function expectSuccess(result, expectedStatus, label) {
  assert(
    result.status === expectedStatus,
    `${label}: esperado HTTP ${expectedStatus}; recebeu ${result.status}; response=${JSON.stringify(result.json || result.text || '')}`,
  );
  assert(result.json?.success === true, `${label}: success=true ausente; payload=${JSON.stringify(result.json)}`);
  return result.json?.data;
}

function pickId(data, keys, label) {
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Number.isInteger(Number(value)) && Number(value) > 0) return Number(value);
  }
  throw new Error(`${label}_ID_MISSING:${JSON.stringify(data)}`);
}

function signatureProof({ fixtureId, actorEmployeeId, type, signingPayload, suffix }) {
  return {
    signatureId: `qasig_${fixtureId}_${suffix}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120),
    type,
    targetType: signingPayload.targetType,
    targetId: signingPayload.targetId,
    signer: {
      employeeId: actorEmployeeId,
      fullName: 'QA eDB Pilot',
      anacCode: null,
    },
    signedAt: new Date().toISOString(),
    canonicalPayloadHashSha256: signingPayload.payloadHashSha256,
    method: 'ELECTRONIC_SIGNATURE_WITH_CERTIFICATE',
    proofReference: `${fixtureId}:${type}:${suffix}`,
  };
}

async function signRevision(baseUrl, headers, m, revisionId, suffix) {
  expectSuccess(
    await api(baseUrl, `/api/edb/revisions/${encodeURIComponent(revisionId)}/ready`, headers, 'POST', {}),
    200,
    `${suffix} ready`,
  );

  const picPayload = expectSuccess(
    await api(baseUrl, `/api/edb/revisions/${encodeURIComponent(revisionId)}/signing-payload/PIC_FLIGHT_RECORD`, headers),
    200,
    `${suffix} PIC signing payload`,
  );
  expectSuccess(
    await api(baseUrl, `/api/edb/revisions/${encodeURIComponent(revisionId)}/signatures`, headers, 'POST', {
      signature: signatureProof({
        fixtureId: m.fixtureId,
        actorEmployeeId: m.actorEmployeeId,
        type: 'PIC_FLIGHT_RECORD',
        signingPayload: picPayload,
        suffix: `${suffix}_pic`,
      }),
      authenticationEvidence: { qaFixtureId: m.fixtureId, synthetic: true, externalContact: false },
    }),
    200,
    `${suffix} PIC signature`,
  );

  const operatorPayload = expectSuccess(
    await api(baseUrl, `/api/edb/revisions/${encodeURIComponent(revisionId)}/signing-payload/OPERATOR_RECORD`, headers),
    200,
    `${suffix} operator signing payload`,
  );
  expectSuccess(
    await api(baseUrl, `/api/edb/revisions/${encodeURIComponent(revisionId)}/signatures`, headers, 'POST', {
      signature: signatureProof({
        fixtureId: m.fixtureId,
        actorEmployeeId: m.actorEmployeeId,
        type: 'OPERATOR_RECORD',
        signingPayload: operatorPayload,
        suffix: `${suffix}_operator`,
      }),
      authenticationEvidence: { qaFixtureId: m.fixtureId, synthetic: true, externalContact: false },
    }),
    200,
    `${suffix} operator signature`,
  );

  const view = expectSuccess(
    await api(baseUrl, `/api/edb/revisions/${encodeURIComponent(revisionId)}`, headers),
    200,
    `${suffix} revision view`,
  );
  const lifecycle = String(view?.record?.status || view?.status || '').toUpperCase();
  assert(lifecycle === 'OPERATOR_SIGNED', `${suffix}: revisão deveria terminar OPERATOR_SIGNED; recebeu ${lifecycle}`);
}

async function main() {
  const baseUrl = assertAllowedStagingBaseUrl(process.env.STAGING_API_BASE_URL || DEFAULT_BASE_URL);
  const expectedSha = String(process.env.EXPECTED_EDB_RELEASE_SHA || '').trim().toLowerCase();
  const email = String(process.env.QA_EDB_PILOT_EMAIL || QA_EMAIL).trim().toLowerCase();
  const password = String(process.env.QA_EDB_PILOT_PASSWORD || '');
  const m = manifest();

  assert(/^[0-9a-f]{40}$/.test(expectedSha), 'EXPECTED_EDB_RELEASE_SHA deve ser SHA-1 hexadecimal de 40 caracteres');
  assert(email === QA_EMAIL, 'QA_EDB_PILOT_EMAIL deve ser a identidade sintética canônica');
  assert(password.length > 0, 'QA_EDB_PILOT_PASSWORD ausente');

  console.log(`[EDB-FULL] staging=${baseUrl}`);
  console.log(`[EDB-FULL] fixture=${m.fixtureId} qa=${maskEmail(email)} tenant=${PILOT_TENANT_ID}`);

  const version = await fetchJson(`${baseUrl}/api/version`);
  assert(version.status === 200 && version.json?.success === true, '/api/version inválido');
  assert(version.json?.data?.environment === 'staging', '/api/version não reportou staging');
  assert(String(version.json?.data?.sourceSha || '').toLowerCase() === expectedSha, 'release staging divergente');

  const loginPayload = await login(baseUrl, email, password);
  const token = extractAccessToken(loginPayload);
  const claims = decodeJwtPayload(token);
  assert(Number(claims?.empresa_id) === PILOT_TENANT_ID, 'tenant JWT divergente');
  const headers = { Authorization: `Bearer ${token}` };

  const capability = expectSuccess(await api(baseUrl, '/api/edb/capability', headers), 200, 'capability');
  assert(capability?.enabled === true, 'eDB tenant 6 deveria estar enabled=true');
  assert(capability?.officialLogbook === false && capability?.replacesPaper === false, 'shadow não pode declarar diário oficial');

  const diary = expectSuccess(
    await api(baseUrl, '/api/edb/diaries', headers, 'POST', {
      aircraftId: m.aircraftId,
      operatorRegulation: 'RBAC135',
    }),
    201,
    'create diary',
  );
  const diaryId = Number(pickId(diary, ['diaryId', 'id'], 'DIARY'));

  const volumeId = `edbvol_${m.fixtureId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  expectSuccess(
    await api(baseUrl, `/api/edb/diaries/${diaryId}/volumes`, headers, 'POST', {
      volumeId,
      aircraftRegistrationMarks: m.aircraftRegistrationMarks,
      sequence: 1,
      openedAt: new Date().toISOString(),
      observations: `Synthetic QA ${m.fixtureId}`,
    }),
    201,
    'create volume',
  );

  expectSuccess(
    await api(baseUrl, `/api/edb/voos/${m.flightId}/etapas/${m.stageId}/regulatory`, headers, 'PUT', {
      dayMinutes: 50,
      nightMinutes: 0,
      totalMinutes: 50,
      ifrActualMinutes: 10,
      ifrSimulatedMinutes: 0,
      ifrUnclassifiedMinutes: 0,
      landingsTotal: 1,
      cycles: 1,
      fuelBeforeEngineStart: 600,
      personsOnBoard: 2,
      cargoKg: 25,
      occurrences: [`Synthetic QA ${m.fixtureId}`],
    }),
    200,
    'regulatory stage',
  );

  expectSuccess(
    await api(baseUrl, `/api/edb/voos/${m.flightId}/tripulantes/${m.crewId}/function`, headers, 'PUT', {
      functionCode: 'P1',
    }),
    200,
    'crew function P1',
  );

  const snapshotId = `edbtech_${m.fixtureId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  expectSuccess(
    await api(baseUrl, `/api/edb/voos/${m.flightId}/preflight/snapshot`, headers, 'POST', {
      snapshotId,
      aircraft: {
        aircraftId: m.aircraftId,
        manufacturer: 'QA SYNTHETIC',
        model: 'QA-EDB-FULL',
        serialNumber: m.fixtureId,
        registrationMarks: m.aircraftRegistrationMarks,
        owners: ['AirTrust QA synthetic'],
        operators: ['AirTrust QA synthetic'],
      },
      maintenance: {
        lastIntervention: {
          type: 'QA synthetic inspection',
          date: m.date,
          returnToServiceApprovedBy: 'QA synthetic maintenance',
        },
        nextIntervention: {
          type: 'QA synthetic next inspection',
          dueAtAirframeHours: 99999,
        },
      },
      capturedAt: new Date().toISOString(),
    }),
    201,
    'preflight snapshot',
  );

  const preflightPayload = expectSuccess(
    await api(baseUrl, `/api/edb/voos/${m.flightId}/preflight/signing-payload`, headers),
    200,
    'preflight signing payload',
  );
  expectSuccess(
    await api(baseUrl, `/api/edb/voos/${m.flightId}/preflight/ack`, headers, 'POST', {
      signature: signatureProof({
        fixtureId: m.fixtureId,
        actorEmployeeId: m.actorEmployeeId,
        type: 'PIC_TECHNICAL_ACK',
        signingPayload: preflightPayload,
        suffix: 'preflight',
      }),
      authenticationEvidence: { qaFixtureId: m.fixtureId, synthetic: true, externalContact: false },
    }),
    201,
    'PIC technical acknowledgement',
  );

  const readiness = expectSuccess(
    await api(baseUrl, `/api/edb/voos/${m.flightId}/readiness`, headers),
    200,
    'post-regulatory readiness',
  );
  assert(
    !readiness?.stages?.some((s) => s.missingFields?.includes('tempo_ifr_nao_classificado_minutos')),
    'IFR não classificado permaneceu bloqueante',
  );
  assert(
    readiness?.stages?.every((s) => (s.regulatory?.tempo_ifr_nao_classificado_minutos ?? 0) === 0),
    'IFR não classificado permaneceu positivo',
  );

  const revisionId = `edbrev_${m.fixtureId}_r1`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  expectSuccess(
    await api(baseUrl, `/api/edb/voos/${m.flightId}/etapas/${m.stageId}/revisions`, headers, 'POST', {
      diaryId,
      volumeId,
      nature: 'QA SYNTHETIC',
      operatorRegulation: 'RBAC135',
      logicalRecordId: `qa-flight-${m.flightId}-stage-${m.stageId}`,
      revisionId,
      capturedAt: new Date().toISOString(),
    }),
    201,
    'create revision r1',
  );
  await signRevision(baseUrl, headers, m, revisionId, 'r1');

  const correctionId = `edbrev_${m.fixtureId}_r2`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  expectSuccess(
    await api(baseUrl, `/api/edb/revisions/${encodeURIComponent(revisionId)}/corrections`, headers, 'POST', {
      newRevisionId: correctionId,
      correctionReason: `Synthetic QA correction ${m.fixtureId}`,
      capturedAt: new Date().toISOString(),
    }),
    201,
    'create correction r2',
  );
  await signRevision(baseUrl, headers, m, correctionId, 'r2');

  const discrepancyId = `edbdisc_${m.fixtureId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  expectSuccess(
    await api(baseUrl, `/api/edb/revisions/${encodeURIComponent(correctionId)}/discrepancies`, headers, 'POST', {
      discrepancyId,
      description: `Synthetic QA discrepancy ${m.fixtureId}`,
      detectedAt: new Date().toISOString(),
    }),
    201,
    'create discrepancy',
  );

  const deferredId = `edbmaint_${m.fixtureId}_deferred`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  expectSuccess(
    await api(baseUrl, `/api/edb/discrepancies/${encodeURIComponent(discrepancyId)}/deferred-actions`, headers, 'POST', {
      actionId: deferredId,
      reason: 'Synthetic QA MEL-style deferral evidence only',
      limitationOrControl: 'Synthetic QA restriction',
      authorizedAt: new Date().toISOString(),
      reference: `${m.fixtureId}-DEF`,
    }),
    201,
    'deferred action',
  );

  const correctiveId = `edbmaint_${m.fixtureId}_corrective`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  expectSuccess(
    await api(baseUrl, `/api/edb/discrepancies/${encodeURIComponent(discrepancyId)}/corrective-actions`, headers, 'POST', {
      actionId: correctiveId,
      description: 'Synthetic QA corrective action completed',
      performedAt: new Date().toISOString(),
      reference: `${m.fixtureId}-CORR`,
    }),
    201,
    'corrective action',
  );

  expectSuccess(
    await api(baseUrl, `/api/edb/discrepancies/${encodeURIComponent(discrepancyId)}/rts`, headers, 'POST', {
      approvalId: `edbrts_${m.fixtureId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120),
      correctiveActionId: correctiveId,
      description: 'Synthetic QA return to service approval',
      approvedAt: new Date().toISOString(),
      reference: `${m.fixtureId}-RTS`,
    }),
    201,
    'return to service',
  );

  const discrepancy = expectSuccess(
    await api(baseUrl, `/api/edb/discrepancies/${encodeURIComponent(discrepancyId)}`, headers),
    200,
    'discrepancy readback',
  );
  assert(JSON.stringify(discrepancy || {}).includes(correctiveId), 'corrective action ausente no readback');

  const incidentId = `edbinc_${m.fixtureId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  expectSuccess(
    await api(baseUrl, `/api/edb/diaries/${diaryId}/incidents`, headers, 'POST', {
      incidentId,
      volumeId,
      kind: 'CORRUPTION',
      detectedAt: new Date().toISOString(),
      description: `Synthetic QA integrity incident ${m.fixtureId}`,
    }),
    201,
    'integrity incident',
  );
  expectSuccess(
    await api(baseUrl, `/api/edb/incidents/${encodeURIComponent(incidentId)}/police`, headers, 'POST', {
      reference: `${m.fixtureId}-BO-SYNTHETIC`,
      reportedAt: new Date().toISOString(),
    }),
    200,
    'synthetic police evidence',
  );
  expectSuccess(
    await api(baseUrl, `/api/edb/incidents/${encodeURIComponent(incidentId)}/regulator-notification-evidence`, headers, 'POST', {
      reference: `${m.fixtureId}-ANAC-EVIDENCE-SYNTHETIC`,
      notifiedAt: new Date().toISOString(),
    }),
    200,
    'synthetic regulator evidence',
  );
  expectSuccess(
    await api(baseUrl, `/api/edb/incidents/${encodeURIComponent(incidentId)}/reconstituted`, headers, 'POST', {
      completedAt: new Date().toISOString(),
    }),
    200,
    'reconstitution',
  );
  const incident = expectSuccess(
    await api(baseUrl, `/api/edb/incidents/${encodeURIComponent(incidentId)}`, headers),
    200,
    'incident readback',
  );
  assert(
    String(incident?.reconstitutionOutcome || incident?.status || '').toUpperCase() === 'RECONSTITUTED',
    `incidente deveria estar RECONSTITUTED; payload=${JSON.stringify(incident)}`,
  );

  const audit = expectSuccess(
    await api(baseUrl, `/api/edb/diaries/${diaryId}/audit`, headers),
    200,
    'audit chain',
  );
  assert(audit?.verification?.valid !== false && audit?.valid !== false, 'cadeia de auditoria explicitamente inválida');

  expectSuccess(
    await api(baseUrl, `/api/edb/volumes/${encodeURIComponent(volumeId)}/close`, headers, 'POST', {
      closedAt: new Date().toISOString(),
      observations: `Synthetic QA close ${m.fixtureId}`,
      retentionMinimumUntil: '2099-12-31',
    }),
    200,
    'close volume',
  );
  expectSuccess(await api(baseUrl, `/api/edb/diaries/${diaryId}/close`, headers, 'POST', {}), 200, 'close diary');

  console.log(`EDB_STAGING_FULL_LIFECYCLE_PASS fixture=${m.fixtureId} release=${expectedSha}`);
  console.log(`EDB_STAGING_FULL_LIFECYCLE_IDS flight=${m.flightId} stage=${m.stageId} rdv=${m.rdvId} diary=${diaryId}`);
  console.log('EDB_STAGING_FULL_LIFECYCLE_FINAL_STATE=OPERATOR_SIGNED');
  console.log('EDB_STAGING_FULL_LIFECYCLE_ANAC_TRANSMISSION=none');
  console.log('EDB_STAGING_FULL_LIFECYCLE_PRODUCTION_ACTION=none');
}

main().catch((error) => {
  console.error(`EDB_STAGING_FULL_LIFECYCLE_FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
