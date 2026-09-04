#!/usr/bin/env node
/**
 * Merge the trusted provenance-guard output and the Playwright QA summary into
 * one sanitized JSON blob for the workflow artifact + step summary.
 *
 * Sanitization contract: only an allowlist of primitive fields is ever emitted.
 * No secrets, tokens, headers, cookies, emails or free-form strings pass through.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const PASS_FAIL = new Set(['PASS', 'FAIL', 'BLOCKED', 'FIXTURE_NOT_AVAILABLE']);

function coercePassFail(value, fallback = 'FAIL') {
  return PASS_FAIL.has(value) ? value : fallback;
}

export function buildFinalSummary({ provenance, qa, prNumber, releaseSha }) {
  const p = provenance && typeof provenance === 'object' ? provenance : {};
  const q = qa && typeof qa === 'object' ? qa : {};

  const mutations = Number.isFinite(q.mutations_detected) ? q.mutations_detected : 0;

  const desktop = coercePassFail(q.desktop);
  const mobile390 = coercePassFail(q.mobile_390);
  const mobile375 = coercePassFail(q.mobile_375);
  const light = coercePassFail(q.light);
  const dark = coercePassFail(q.dark);
  const documents = coercePassFail(q.documents, 'FIXTURE_NOT_AVAILABLE');

  const everyMatrixGreen = [desktop, mobile390, mobile375, light, dark].every((v) => v === 'PASS');
  let status = 'PASS';
  if (!p.status || p.status !== 'PROVENANCE_OK') status = 'BLOCKED';
  else if (mutations > 0 || !everyMatrixGreen) status = 'FAIL';
  else if (q.status && q.status !== 'PASS') status = coercePassFail(q.status, 'FAIL');

  return {
    status,
    pr_number: Number(prNumber ?? p.prNumber ?? q.pr_number ?? 0),
    release_sha: String(releaseSha ?? p.releaseSha ?? q.release_sha ?? ''),
    frontend_build_version: String(p.frontendBuildVersion ?? q.frontend_build_version ?? ''),
    worker_sha_match_required: false,
    authentication: 'REAL_STAGING',
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
  });

  fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
