#!/usr/bin/env node
// Read-only physical Pilot acceptance evaluator. No synthetic PASS is accepted
// as a replacement for the six real device rows on an exact staging release.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const requiredRows = Object.freeze([
  ['ipad','safari','portrait'],
  ['ipad','safari','landscape'],
  ['ipad','pwa','n/a'],
  ['android','chrome','portrait'],
  ['android','chrome','landscape'],
  ['android','pwa','n/a'],
]);
export const requiredScenarios = Object.freeze([
  '1_vault_unlock',
  '2_download_authorized_package',
  '3_local_package_readiness',
  '4_rdv_saved_on_tablet',
  '5_airplane_offline',
  '6_refresh_reopen_offline',
  '7_restore_exact_saved_value',
  '8_continue_offline_revision',
  '9_reconnect_transmit',
  '10_idempotent_receipt_no_duplicate',
  '11_explicit_conflict_handling',
  '12_finalize_separate_from_sync',
  '13_coordination_handoff_receipt',
  '14_service_worker_scope_isolated',
  '15_touch_scroll_no_critical_overflow',
]);
const clean = value => typeof value === 'string' && value.trim().length > 2 &&
  !/(REPLACE|PENDING|TODO|PLACEHOLDER|UNKNOWN)/i.test(value);

export function verifyPilotRealDeviceEvidence(evidence, releaseSha) {
  const errors = [];
  if (!/^[0-9a-f]{40}$/.test(String(releaseSha ?? '')))
    errors.push('EXPECTED_RELEASE_SHA_INVALID');
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence))
    return { ok: false, errors: [...errors, 'EVIDENCE_INVALID'] };
  if (evidence.status !== 'PASS') errors.push('GLOBAL_STATUS_NOT_PASS');
  if (typeof evidence.staging_pages_url !== 'string' ||
      !/^https:\/\/[a-z0-9-]+\.airtrust\.pages\.dev\/?$/.test(evidence.staging_pages_url))
    errors.push('STAGING_PAGES_URL_INVALID');
  for (const field of ['staging_release_sha','worker_source_sha','pages_source_sha']) {
    if (evidence[field] !== releaseSha) errors.push(field.toUpperCase() + '_MISMATCH');
  }
  if (!clean(evidence.validated_at) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(evidence.validated_at) ||
      !Number.isFinite(Date.parse(evidence.validated_at)))
    errors.push('VALIDATED_AT_INVALID');
  if (!Array.isArray(evidence.rows) || evidence.rows.length !== requiredRows.length)
    errors.push('DEVICE_ROWS_COUNT_INVALID');
  const matched = new Set();
  for (const row of Array.isArray(evidence.rows) ? evidence.rows : []) {
    if (!row || typeof row !== 'object') {
      errors.push('DEVICE_ROW_INVALID');continue;
    }
    const key = [row.platform,row.mode,row.orientation].map(v=>String(v??'').toLowerCase()).join('/');
    const isRequired = requiredRows.some(parts=>parts.join('/')===key);
    if (!isRequired) errors.push('UNEXPECTED_ROW:' + key);
    if (matched.has(key)) errors.push('DUPLICATE_ROW:' + key);
    matched.add(key);
    if (row.result !== 'PASS') errors.push('ROW_NOT_PASS:' + key);
    for (const field of ['device_model','os_version','browser_version','evidence_ref']) {
      if (!clean(row[field])) errors.push('ROW_' + field.toUpperCase() + '_MISSING:' + key);
    }
    if (!row.scenario_results || typeof row.scenario_results !== 'object' || Array.isArray(row.scenario_results)) {
      errors.push('SCENARIOS_MISSING:' + key);
    } else for (const scenario of requiredScenarios) {
      if (row.scenario_results[scenario] !== 'PASS')
        errors.push('SCENARIO_NOT_PASS:' + key + ':' + scenario);
    }
  }
  for (const [platform,mode,orientation] of requiredRows) {
    const key=[platform,mode,orientation].join('/');
    if (!matched.has(key)) errors.push('REQUIRED_ROW_MISSING:' + key);
  }
  return { ok: errors.length === 0, errors };
}

export function verifyPilotProductionReleaseLineage({ evidence, releaseSha, changedPaths, stagedShaIsAncestor }) {
  const errors = [];
  const stagedSha = evidence?.staging_release_sha;
  if (!/^[0-9a-f]{40}$/.test(String(releaseSha ?? '')))
    errors.push('PRODUCTION_RELEASE_SHA_INVALID');
  if (!/^[0-9a-f]{40}$/.test(String(stagedSha ?? '')))
    errors.push('STAGING_RELEASE_SHA_INVALID');
  if (stagedShaIsAncestor !== true) errors.push('STAGING_RELEASE_NOT_ANCESTOR');
  if (!Array.isArray(changedPaths) || changedPaths.length !== 1 ||
      changedPaths[0] !== 'docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json')
    errors.push('RUNTIME_DELTA_AFTER_PHYSICAL_ACCEPTANCE');
  if (/^[0-9a-f]{40}$/.test(String(stagedSha ?? ''))) {
    const evidenceResult = verifyPilotRealDeviceEvidence(evidence, stagedSha);
    if (!evidenceResult.ok) errors.push(...evidenceResult.errors.map(error => 'PHYSICAL_' + error));
  }
  return { ok: errors.length === 0, errors, stagedSha };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--release-sha');
  const releaseSha = index >= 0 ? args[index + 1] : process.env.PILOT_ACCEPTANCE_RELEASE_SHA;
  const evidenceFile = resolve('docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json');
  let evidence;
  try { evidence=JSON.parse(readFileSync(evidenceFile,'utf8')); }
  catch (error) { console.error('PILOT_PHYSICAL_EVIDENCE_MISSING_OR_INVALID'); process.exitCode=1; }
  if (evidence) {
    const result=verifyPilotRealDeviceEvidence(evidence,releaseSha);
    if (!result.ok) { console.error('PILOT_PHYSICAL_ACCEPTANCE_DENIED: ' + result.errors.join(','));process.exitCode=1; }
    else console.log('PILOT_PHYSICAL_ACCEPTANCE_PASS release=' + releaseSha + ' rows=6 scenarios_each=15');
  }
}
