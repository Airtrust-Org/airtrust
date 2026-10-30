#!/usr/bin/env node
/**
 * Offline CI signer for the FORMATIVE_NO_EXAM_V1 SCORM certification profile.
 *
 * Input: TWO independent authenticated Chromium/WebKit journeys, backend
 * witnesses and distinct PDF downloads for the exact ZIP. It never creates
 * PASSes. The signed
 * payload is deliberately environment-independent (bound to ZIP SHA-256 and the
 * Worker commit, NOT to staging tenant/course/package ids): the production
 * binding to tenant + course + package is made by the authenticated
 * administrative approval inside the Worker, never by this signer.
 *
 * Must run only in a protected main-branch GitHub Actions environment.
 * Field order MUST match serializeFormativeAttestation() in
 * worker-airtrust/src/lib/lms/lms-scorm-formative-profile.ts.
 */
import { createHash, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGovernedScormZipDriver } from './validate-scorm-governed-driver.mjs';
import { validateScormBackendWitness } from './sign-scorm-functional-attestation.mjs';
import { validatePedagogicalReview } from './scorm-pedagogical-review-gate.mjs';

const KIND = 'AIRTRUST_SCORM_FORMATIVE_ATTESTATION_V1';
const PROFILE = 'FORMATIVE_NO_EXAM_V1';
const HARNESS = 'AIRTRUST_SCORM_FUNCTIONAL_HARNESS_V2';
export const FORMATIVE_CASES = ['FIRST_ACCESS', 'REQUIRED_CONTENT_COVERAGE', 'REQUIRED_INTERACTIONS',
  'PERSISTENCE_VERIFIED', 'SUSPEND_RESUME', 'EXPLICIT_FINALIZATION', 'REOPEN_COMPLETED',
  'NO_STATUS_DOWNGRADE', 'TENANT_CYCLE_ISOLATION'];
const sha = /^[a-f0-9]{64}$/, commit = /^[a-f0-9]{40}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, reason) => { if (!condition) throw Error('SCORM_FORMATIVE_ATTESTATION_' + reason); };
const read = path => JSON.parse(readFileSync(path, 'utf8'));

export function signFormativeScormEvidence({
  candidate, chromiumFile, webkitFile, certificatePdfFiles, driverFile, secret, runtimeSha, harnessSha,
  reviewFile, approvalFile, trustedReviewerKeys,
}) {
  assert(typeof secret === 'string' && secret.length >= 32, 'SECRET_MISSING');
  assert(commit.test(runtimeSha) && commit.test(harnessSha), 'COMMIT_INVALID');
  assert(candidate?.scope === 'GOVERNED_STAGING_SYNTHETIC' &&
    Number.isSafeInteger(candidate.empresaId) && candidate.empresaId > 0 &&
    Number.isSafeInteger(candidate.cursoId) && candidate.cursoId > 0 &&
    /^[a-f0-9-]{36}$/.test(candidate.packageId) && sha.test(candidate.packageSha256) &&
    candidate.requiresAssessment === false &&
    Number.isSafeInteger(candidate.requiredSlides) && candidate.requiredSlides > 0 &&
    Number.isSafeInteger(candidate.requiredActivities) && candidate.requiredActivities > 0,
  'CANDIDATE_INVALID');
  const zipBytes = readFileSync(candidate.zipPath);
  assert(digest(zipBytes) === candidate.packageSha256, 'ZIP_SHA_DRIFT');
  assert(candidate.stagingRuntimeSha === runtimeSha, 'RUNTIME_SHA_DRIFT');
  const driverBytes = readFileSync(driverFile);
  validateGovernedScormZipDriver(zipBytes, JSON.parse(driverBytes.toString('utf8')), candidate);
  // Only a real, independently signed review can authorize the formative attestation.
  // Item count is derived from the server's formative contract, not a caller override.
  const pedagogicalReview = validatePedagogicalReview({
    reviewFile, driverFile, candidate: { ...candidate, reviewItemCount: candidate.requiredActivities },
    approvalFile, trustedReviewerKeys,
  });
  assert(pedagogicalReview.driverSha256 === digest(driverBytes) &&
    pedagogicalReview.itemCount === candidate.requiredActivities,
  'PEDAGOGICAL_REVIEW_SCOPE_INVALID');

  assert(chromiumFile && webkitFile && certificatePdfFiles?.CHROMIUM &&
    certificatePdfFiles?.WEBKIT, 'TWO_BROWSER_INPUTS_REQUIRED');
  const browserEvidenceSha256 = {}, backendWitnessSha256 = {}, certificateDocuments = {};
  const runs = [];
  for (const [browser, file] of [['CHROMIUM', chromiumFile], ['WEBKIT', webkitFile]]) {
    const bytes = readFileSync(file);
    const row = JSON.parse(bytes.toString('utf8'));
    assert(row.source === 'GOVERNED_STAGING_AUTHENTICATED_QA_V1' &&
      row.scope === 'GOVERNED_STAGING_SYNTHETIC' && row.browser === browser &&
      row.packageId === candidate.packageId && row.packageSha256 === candidate.packageSha256 &&
      row.empresaId === candidate.empresaId && row.cursoId === candidate.cursoId &&
      row.runtimeSha === runtimeSha && row.harnessSha === harnessSha &&
      row.driverSha256 === digest(driverBytes), 'UNTRUSTED_BROWSER_' + browser);
    assert(row.syntheticEnrollment === true && row.persistedBackendEvidence === true &&
      row.verifiedCrossTenantDenial === true && row.verifiedIndependentCycle === true &&
      row.qualificationHistoryVerified === true && row.certificateDocumentVerified === true,
    'E2E_INCOMPLETE_' + browser);
    assert(Array.isArray(row.cases) && row.cases.length === FORMATIVE_CASES.length &&
      new Set(row.cases.map(item => item.name)).size === FORMATIVE_CASES.length &&
      row.cases.every(item => FORMATIVE_CASES.includes(item.name) && item.status === 'PASS'),
    'CASES_INCOMPLETE_' + browser);
    const doc = row.certificateDocument;
    assert(doc && Number.isSafeInteger(doc.enrollmentId) && doc.enrollmentId > 0 &&
      Number.isSafeInteger(doc.cycleId) && doc.cycleId > 0 &&
      Number.isSafeInteger(doc.qualificationHistoryId) && doc.qualificationHistoryId > 0 &&
      typeof doc.documentId === 'string' && doc.documentId.length > 0 && doc.documentId.length <= 128 &&
      sha.test(doc.sha256) && row.certificateDownloadHttpStatus === 200,
    'CERTIFICATE_BACKEND_WITNESS_MISSING_' + browser);
    validateScormBackendWitness(row, doc, candidate);
    const pdf = readFileSync(certificatePdfFiles[browser]);
    assert(pdf.length > 150 && pdf.subarray(0, 5).toString() === '%PDF-' &&
      pdf.includes(Buffer.from('%%EOF')) && digest(pdf) === doc.sha256,
    'CERTIFICATE_DOCUMENT_UNVERIFIED_' + browser);
    browserEvidenceSha256[browser] = digest(bytes);
    backendWitnessSha256[browser] = digest(JSON.stringify(row.backendWitness));
    certificateDocuments[browser] = {
      enrollmentId: doc.enrollmentId, cycleId: doc.cycleId,
      qualificationHistoryId: doc.qualificationHistoryId, documentId: doc.documentId, sha256: doc.sha256,
    };
    runs.push({
      harness: HARNESS, browser, packageSha256: candidate.packageSha256,
      cases: row.cases.map(item => ({ name: item.name, status: item.status })),
    });
  }
  const first = certificateDocuments.CHROMIUM, second = certificateDocuments.WEBKIT;
  assert(first.enrollmentId !== second.enrollmentId && first.cycleId !== second.cycleId &&
    first.qualificationHistoryId !== second.qualificationHistoryId &&
    first.documentId !== second.documentId && first.sha256 !== second.sha256,
  'BROWSER_CERTIFICATES_NOT_INDEPENDENT');
  assert(browserEvidenceSha256.CHROMIUM !== browserEvidenceSha256.WEBKIT &&
    backendWitnessSha256.CHROMIUM !== backendWitnessSha256.WEBKIT,
  'BROWSER_EVIDENCE_NOT_INDEPENDENT');

  const payload = {
    kind: KIND, profile: PROFILE, scope: 'GOVERNED_STAGING_SYNTHETIC',
    packageSha256: candidate.packageSha256, runtimeSha, harnessSha,
    issuedAt: new Date().toISOString(),
    requiredSlides: candidate.requiredSlides, requiredActivities: candidate.requiredActivities,
    driverSha256: digest(driverBytes), pedagogicalReview,
    browserEvidenceSha256, backendWitnessSha256,
    certificateDocuments, runs,
  };
  // Same canonical projection and order as the Worker WebCrypto verifier.
  return { payload, signature: createHmac('sha256', secret).update(JSON.stringify(payload), 'utf8').digest('hex') };
}

function main() {
  assert(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF === 'refs/heads/main' &&
    /^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? ''), 'GOVERNED_MAIN_RUN_REQUIRED');
  const [input, output] = process.argv.slice(2);
  assert(input && output, 'ARGUMENTS_REQUIRED');
  const args = read(input);
  const result = signFormativeScormEvidence({
    candidate: args.candidate, chromiumFile: args.chromiumFile, webkitFile: args.webkitFile,
    certificatePdfFiles: args.certificatePdfFiles, driverFile: args.driverFile,
    reviewFile: args.reviewFile, approvalFile: args.approvalFile,
    trustedReviewerKeys: JSON.parse(process.env.SCORM_QA_REVIEWER_PUBLIC_KEYS_JSON || '{}'),
    secret: process.env.SCORM_QA_ATTESTATION_SECRET, runtimeSha: process.env.SCORM_QA_RUNTIME_SHA,
    harnessSha: process.env.GITHUB_SHA,
  });
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log('SCORM_FORMATIVE_ATTESTATION_CREATED=' + result.payload.packageSha256);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
