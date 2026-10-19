#!/usr/bin/env node
/**
 * Player 3 staging-only technical QA activation preflight.
 *
 * No network, D1, R2, filesystem writes, feature activation or credentials.
 * This verifies configured env gates only. A PASS does NOT mean that courses,
 * enrollment fixtures, browser credentials, schema, history or PDF exist.
 *
 * source_reference: worker-airtrust/src/{routes/lms-native-enrollment.ts,
 *   routes/lms-player3-stage-attempts.ts,routes/lms-player3-terminal-completion.ts,
 *   services/lms-player3-module-attempt-writer.ts}.
 * operational_decision: deny staging QA unless every independent tenant gate
 *   and the isolated content origin match this exact tenant and pinned SHA.
 * dry_run_required: evaluate only supplied environment values and emit safe
 *   boolean/gate names, never token, credentials, fixture data or flag values.
 * rollback_plan_required: there are no mutations to roll back in this preflight.
 */
import {pathToFileURL} from 'node:url';

export const REQUIRED_TENANT_GATES = Object.freeze([
  'NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS',
  'NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS',
  'NATIVE_LEARNER_WRITE_ENABLED_TENANTS',
  'NATIVE_LEARNER_ENROLLMENT_CREATE_ENABLED_TENANTS',
  'PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS',
  'PLAYER3_AUTHORED_LAUNCH_ENABLED_TENANTS',
  'PLAYER3_TERMINAL_WRITE_ENABLED_TENANTS',
  'PLAYER3_QA_READ_ENABLED_TENANTS',
]);

const shaPattern = /^[a-f0-9]{40}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
// Immutable original training source must never be used for disposable QA.
const rc81OriginalSourceSha256 =
  'a0a9e955368a8e7f4dd3072b7bd98eb8e5d7cab47d31cbd9335f4282dbba18a2';
const intPattern = /^[1-9][0-9]{0,15}$/;

export function exactTenantAllowed(value, tenant) {
  if (typeof value !== 'string' || value.length > 256 ||
      value.includes('*') || !intPattern.test(String(tenant))) return false;
  const ids = value.split(',').map(s => s.trim());
  // Technical QA must not enable any other tenant, even when the QA tenant
  // appears in a comma-separated production-style allowlist.
  return ids.length === 1 && ids[0] === String(tenant) &&
    intPattern.test(ids[0]) && Number.isSafeInteger(Number(ids[0]));
}

function stagingOrigin(raw) {
  if (typeof raw !== 'string' || raw.length > 512) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.origin !== raw || url.username ||
        url.password || !/(?:staging|stage|qa)/i.test(url.hostname) ||
        url.hostname === 'airtrust.online' ||
        url.hostname.endsWith('.airtrust.online')) return null;
    return url.origin;
  } catch { return null; }
}

/** Safe structural result only. Does not read or print secrets. */
export function evaluatePlayer3QaActivation({env, tenant, expectedSha}) {
  const missing = [];
  if (!intPattern.test(String(tenant)) || !Number.isSafeInteger(Number(tenant))) {
    missing.push('EXACT_SYNTHETIC_TENANT_REQUIRED');
  }
  if (env?.ENVIRONMENT !== 'staging') missing.push('STAGING_ONLY');
  if (!shaPattern.test(expectedSha ?? '')) missing.push('EXACT_RELEASE_SHA_REQUIRED');
  if (env?.PLAYER3_QA_SYNTHETIC_TENANT_ID !== String(tenant)) {
    missing.push('SYNTHETIC_TENANT_PIN_MISSING');
  }
  if (env?.PLAYER3_QA_EXPECTED_SHA !== expectedSha) {
    missing.push('RELEASE_SHA_PIN_MISSING');
  }
  const syntheticSourceSha = env?.PLAYER3_QA_SYNTHETIC_SOURCE_SHA256;
  if (!sha256Pattern.test(syntheticSourceSha ?? '') ||
      syntheticSourceSha === rc81OriginalSourceSha256) {
    missing.push('INDEPENDENT_SYNTHETIC_SOURCE_SHA256_REQUIRED');
  }
  for (const gate of REQUIRED_TENANT_GATES) {
    if (!exactTenantAllowed(env?.[gate], tenant)) missing.push(gate);
  }
  const page = stagingOrigin(env?.PLAYER3_QA_STAGING_ORIGIN);
  const api = stagingOrigin(env?.PLAYER3_QA_API_ORIGIN);
  const content = stagingOrigin(env?.PLAYER3_AUTHORED_CONTENT_ORIGIN);
  if (!page) missing.push('STAGING_PAGE_ORIGIN_INVALID');
  if (!api) missing.push('STAGING_API_ORIGIN_INVALID');
  if (!content) missing.push('AUTHORED_CONTENT_ORIGIN_INVALID');
  if (page && api && content && new Set([page,api,content]).size !== 3) {
    missing.push('THREE_DISTINCT_STAGING_ORIGINS_REQUIRED');
  }
  if (!content || env?.PLAYER3_QA_CONTENT_ORIGIN !== content) {
    missing.push('QA_CONTENT_ORIGIN_PIN_MISMATCH');
  }
  return {
    tenantGateReady: missing.length === 0,
    checkedTenantGateCount: REQUIRED_TENANT_GATES.length,
    blockers: missing,
    physicalSchemaVerified: false,
    syntheticEnrollmentsVerified: false,
    browserJourneysVerified: false,
    pdfVerified: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tenant = process.env.PLAYER3_QA_SYNTHETIC_TENANT_ID ?? '';
  const expectedSha = process.env.PLAYER3_QA_EXPECTED_SHA ?? '';
  const result = evaluatePlayer3QaActivation({env:process.env,tenant,expectedSha});
  process.stdout.write(JSON.stringify(result)+'\n');
  if (!result.tenantGateReady) process.exitCode = 1;
}
