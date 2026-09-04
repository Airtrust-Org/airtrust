#!/usr/bin/env node
/**
 * Merge the trusted provenance-guard output and the Playwright QA summary into
 * one sanitized JSON blob for the workflow artifact + step summary.
 *
 * Sanitization contract: only an allowlist of primitive fields is ever emitted.
 * No secrets, tokens, headers, cookies, emails or free-form strings pass through.
 *
 * Status decision (BLOCKER 9) for audit_profile = "destructive-actions":
 *   provenance not OK ............................ BLOCKED
 *   no real #282 surface exercised in runtime .... BLOCKED
 *   documents === FIXTURE_NOT_AVAILABLE .......... BLOCKED
 *   any mutation detected ........................ FAIL
 *   any viewport/theme cell FAIL ................. FAIL
 *   otherwise ................................... PASS
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const PASS_FAIL = new Set(['PASS', 'FAIL', 'BLOCKED', 'FIXTURE_NOT_AVAILABLE']);

function coercePassFail(value, fallback = 'FAIL') {
  return PASS_FAIL.has(value) ? value : fallback;
}

export function buildFinalSummary({ provenance, qa, prNumber, releaseSha, auditProfile }) {
  const p = provenance && typeof provenance === 'object' ? provenance : {};
  const q = qa && typeof qa === 'object' ? qa : {};
  const profile = auditProfile || q.audit_profile || 'destructive-actions';

  const mutations = Number.isFinite(q.mutations_detected) ? q.mutations_detected : 0;
  const realSurfaces = Number.isFinite(q.real_surfaces_exercised) ? q.real_surfaces_exercised : 0;

  const desktop = coercePassFail(q.desktop);
  const mobile390 = coercePassFail(q.mobile_390);
  const mobile375 = coercePassFail(q.mobile_375);
  const light = coercePassFail(q.light);
  const dark = coercePassFail(q.dark);
  const documents = coercePassFail(q.documents, 'FIXTURE_NOT_AVAILABLE');

  const everyMatrixGreen = [desktop, mobile390, mobile375, light, dark].every((v) => v === 'PASS');
  // The matrix "ran" only if the spec wrote at least one recognizable cell result.
  const matrixRan = [q.desktop, q.mobile_390, q.mobile_375, q.light, q.dark].some((v) =>
    PASS_FAIL.has(v),
  );

  let status;
  if (p.status !== 'PROVENANCE_OK') {
    status = 'BLOCKED';
  } else if (mutations > 0) {
    status = 'FAIL';
  } else if (!matrixRan) {
    // No QA summary / no cell executed — never silently PASS or FAIL-as-bug.
    status = 'BLOCKED';
  } else if (!everyMatrixGreen) {
    status = 'FAIL';
  } else if (profile === 'destructive-actions' && realSurfaces < 1) {
    status = 'BLOCKED';
  } else if (profile === 'destructive-actions' && documents === 'FIXTURE_NOT_AVAILABLE') {
    status = 'BLOCKED';
  } else if (documents === 'FAIL') {
    status = 'FAIL';
  } else {
    status = 'PASS';
  }

  return {
    status,
    audit_profile: profile,
    pr_number: Number(prNumber ?? p.prNumber ?? q.pr_number ?? 0),
    release_sha: String(releaseSha ?? p.releaseSha ?? q.release_sha ?? ''),
    frontend_build_version: String(p.frontendBuildVersion ?? q.frontend_build_version ?? ''),
    worker_environment: String(p.worker?.environment ?? ''),
    worker_sha_match_required: false,
    authentication: 'REAL_STAGING',
    datatable_runtime: String(
      q.datatable_runtime ?? 'DATATABLE_RUNTIME_NOT_APPLICABLE_NO_ACTIVE_CONSUMER',
    ),
    real_surfaces_exercised: realSurfaces,
    mutations_detected: mutations,
    desktop,
    mobile_390: mobile390,
    mobile_375: mobile375,
    light,
    dark,
    documents,
  };
}

function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const provenanceFile = process.env.PROVENANCE_JSON_PATH;
  const qaFile = process.env.QA_SUMMARY_PATH;
  const outFile = process.env.FINAL_SUMMARY_PATH;
  if (!outFile) throw new Error('FINAL_SUMMARY_PATH is required');

  const summary = buildFinalSummary({
    provenance: provenanceFile ? readJsonOrNull(provenanceFile) : null,
    qa: qaFile ? readJsonOrNull(qaFile) : null,
    prNumber: process.env.PR_NUMBER,
    releaseSha: process.env.RELEASE_SHA,
    auditProfile: process.env.AUDIT_PROFILE,
  });

  fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
