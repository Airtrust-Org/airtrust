import { createHash, generateKeyPairSync, sign as ed25519Sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
// The CI signer is plain ESM; the Worker verifier must accept exactly what it signs.
import { signFormativeScormEvidence, FORMATIVE_CASES } from '../../../../scripts/ci/sign-scorm-formative-attestation.mjs';
import {
  FORMATIVE_REQUIRED_CASES, verifyFormativeAttestation,
} from '../../lib/lms/lms-scorm-formative-profile';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const sha = (b: Uint8Array | Buffer) => createHash('sha256').update(b).digest('hex');
const secret = 'test-only-secret-with-length-above-thirty-two-characters';
const runtimeSha = 'b'.repeat(40), harnessSha = 'c'.repeat(40);
type EvidenceRow = {
  [key: string]: unknown;
  cases: Array<{ name: string; status: string }>;
  certificateDocument: { enrollmentId: number; [key: string]: unknown };
  backendWitness: {
    completionStatus: string;
    replay: { qualificationHistoryId: number; [key: string]: unknown };
    [key: string]: unknown;
  };
};

function setup(mutate: (row: EvidenceRow) => void = () => {},
  mutateWebkit: (row: EvidenceRow) => void = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'formative-signer-'));
  dirs.push(dir);
  const zip = Buffer.from(zipSync({
    'imsmanifest.xml': strToU8('<manifest><resources><resource href="index.html"/></resources></manifest>'),
    'index.html': strToU8('<html></html>'),
  }));
  const packageSha256 = sha(zip);
  const click = { op: 'click', selector: '#next' };
  const approvedAt = new Date().toISOString();
  const review = Buffer.from(JSON.stringify({
    kind: 'AIRTRUST_SCORM_INDEPENDENT_PEDAGOGICAL_REVIEW_V1',
    packageSha256, approved: true, independentOfPackageAuthor: true,
    reviewerReference: 'reviewer-test-01',
    approvalReference: 'approved-test-case-2026',
    approvedAt,
    items: [1, 2].map(n => ({
      itemId: 'item-' + n, status: 'APPROVED', selectedIndex: 0,
      rationale: 'Independent synthetic reviewer checked this formative item.',
      reviewerReference: 'reviewer-test-01',
    })),
  }));
  const driver = Buffer.from(JSON.stringify({
    authorReviewed: true, reviewArtifactSha256: sha(review),
    schemaVersion: 1, packageSha256, requiresAssessment: false, launchFile: 'index.html',
    requiredContent: [{ selector: '#slide' }],
    resume: { assertion: { selector: '#slide', state: 'visible' }, actions: [click] },
    pass: { actions: [click] },
    completion: { actions: [{ op: 'click', surface: 'sco', selector: '#finish' }] },
    replayCompletion: { actions: [{ op: 'click', surface: 'sco', selector: '#finish' }] },
  }));
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 0x20), Buffer.from('\n%%EOF')]);
  const candidate = {
    scope: 'GOVERNED_STAGING_SYNTHETIC', empresaId: 5, cursoId: 9,
    packageId: '123e4567-e89b-42d3-a456-426614174000', packageSha256, requiresAssessment: false,
    requiredSlides: 6, requiredActivities: 2, stagingRuntimeSha: runtimeSha, zipPath: join(dir, 'p.zip'),
  };
  const doc = { enrollmentId: 11, cycleId: 22, qualificationHistoryId: 33, documentId: 'doc-1', sha256: sha(pdf) };
  const row: EvidenceRow = {
    source: 'GOVERNED_STAGING_AUTHENTICATED_QA_V1', scope: 'GOVERNED_STAGING_SYNTHETIC', browser: 'CHROMIUM',
    packageId: candidate.packageId, packageSha256, empresaId: 5, cursoId: 9, runtimeSha, harnessSha,
    driverSha256: sha(driver), syntheticEnrollment: true, persistedBackendEvidence: true,
    verifiedCrossTenantDenial: true, verifiedIndependentCycle: true, qualificationHistoryVerified: true,
    certificateDocumentVerified: true, certificateDownloadHttpStatus: 200, certificateDocument: doc,
    cases: FORMATIVE_CASES.map((name: string) => ({ name, status: 'PASS' })),
    backendWitness: {
      source: 'WORKER_D1_STAGING_READBACK', empresaId: 5, cursoId: 9, packageId: candidate.packageId,
      enrollmentId: 11, cycleId: 22, qualificationHistoryId: 33, documentId: 'doc-1',
      completionStatus: 'CONCLUIDO', persistedCmiSha256: 'd'.repeat(64),
      staleAttempt: { cycleId: 21, commitHttpStatus: 409, progressBeforeSha256: 'e'.repeat(64),
        progressAfterSha256: 'e'.repeat(64), activeCycleBeforeSha256: 'f'.repeat(64), activeCycleAfterSha256: 'f'.repeat(64) },
      replay: { completionHttpStatus: 200, qualificationHistoryCountBefore: 1, qualificationHistoryCountAfter: 1,
        qualificationHistoryId: 33 },
      authorization: { anonymousHttpStatus: 401, foreignTenantHttpStatus: 403, mismatchedShaHttpStatus: 400,
        incompatibleEditionHttpStatus: 409 },
      validity: { status: 'VALID', validFrom: '2026-10-28T00:00:00.000Z', validUntil: null },
    },
  };
  const webkitPdf = Buffer.concat([Buffer.from('%PDF-1.4\\nWEBKIT\\n'), Buffer.alloc(201, 0x20), Buffer.from('\\n%%EOF')]);
  const webkitDoc = {
    enrollmentId: 12, cycleId: 23, qualificationHistoryId: 34,
    documentId: 'doc-2', sha256: sha(webkitPdf),
  };
  const webkitRow = structuredClone(row);
  webkitRow.browser = 'WEBKIT';
  webkitRow.certificateDocument = webkitDoc;
  Object.assign(webkitRow.backendWitness, {
    enrollmentId: 12, cycleId: 23, qualificationHistoryId: 34, documentId: 'doc-2',
  });
  webkitRow.backendWitness.replay.qualificationHistoryId = 34;
  mutate(row);
  mutateWebkit(webkitRow);
  writeFileSync(candidate.zipPath, zip);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const reviewerKeyId = 'review-key-01';
  const message = [
    'AIRTRUST_SCORM_PEDAGOGICAL_APPROVAL_ED25519_V1',
    reviewerKeyId, packageSha256, sha(review), sha(driver),
    'reviewer-test-01', 'approved-test-case-2026', approvedAt,
  ].join('\n');
  const approval = {
    kind: 'AIRTRUST_SCORM_PEDAGOGICAL_APPROVAL_ED25519_V1',
    reviewerKeyId, packageSha256, reviewSha256: sha(review),
    driverSha256: sha(driver), reviewerReference: 'reviewer-test-01',
    approvedAt, signature: Buffer.from(ed25519Sign(null, Buffer.from(message), privateKey)).toString('base64'),
  };
  const trustedReviewerKeys = {
    [reviewerKeyId]: {
      reviewerReference: 'reviewer-test-01', role: 'INDEPENDENT_PEDAGOGICAL_REVIEWER',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  };
  writeFileSync(join(dir, 'driver.json'), driver);
  writeFileSync(join(dir, 'review.json'), review);
  writeFileSync(join(dir, 'approval.json'), JSON.stringify(approval));
  writeFileSync(join(dir, 'chromium.json'), JSON.stringify(row));
  writeFileSync(join(dir, 'webkit.json'), JSON.stringify(webkitRow));
  writeFileSync(join(dir, 'chromium.pdf'), pdf);
  writeFileSync(join(dir, 'webkit.pdf'), webkitPdf);
  const sign = () => signFormativeScormEvidence({
    candidate, chromiumFile: join(dir, 'chromium.json'), webkitFile: join(dir, 'webkit.json'),
    certificatePdfFiles: { CHROMIUM: join(dir, 'chromium.pdf'), WEBKIT: join(dir, 'webkit.pdf') },
    driverFile: join(dir, 'driver.json'), reviewFile: join(dir, 'review.json'),
    approvalFile: join(dir, 'approval.json'), trustedReviewerKeys,
    secret, runtimeSha, harnessSha,
  });
  return { sign, packageSha256, dir, trustedReviewerKeys };
}

describe('formative signer ⇄ Worker verifier', () => {
  it('uses the same required case list on both sides', () => {
    expect([...FORMATIVE_CASES].sort()).toEqual([...FORMATIVE_REQUIRED_CASES].sort());
  });

  it('what the CI signer signs, the Worker accepts — and only for that ZIP and runtime', async () => {
    const { sign, packageSha256 } = setup();
    const envelope = sign();
    const ctx = { packageSha256, runtimeSha, requiredSlides: 6, requiredActivities: 2 };
    expect(await verifyFormativeAttestation(envelope, ctx, secret)).toEqual({ ok: true });
    expect(await verifyFormativeAttestation(envelope, { ...ctx, packageSha256: 'a'.repeat(64) }, secret))
      .toMatchObject({ ok: false, reason: 'PACKAGE_SHA_MISMATCH' });
    expect(await verifyFormativeAttestation(envelope, { ...ctx, runtimeSha: 'd'.repeat(40) }, secret))
      .toMatchObject({ ok: false, reason: 'RUNTIME_SHA_MISMATCH' });
    expect(await verifyFormativeAttestation(envelope, { ...ctx, requiredSlides: 7 }, secret))
      .toMatchObject({ ok: false, reason: 'CONTENT_COVERAGE_MISMATCH' });
    expect(await verifyFormativeAttestation(envelope, ctx, 'another-secret-with-length-above-thirty-two-chars'))
      .toMatchObject({ ok: false, reason: 'ATTESTATION_SIGNATURE_INVALID' });
    const tampered = { ...envelope, payload: { ...envelope.payload, harnessSha: 'e'.repeat(40) } };
    expect(await verifyFormativeAttestation(tampered, ctx, secret))
      .toMatchObject({ ok: false, reason: 'ATTESTATION_SIGNATURE_INVALID' });
  });

  it('requires an independently signed editorial review and rejects forged approvals', async () => {
    const { sign, dir } = setup();
    const approved = sign();
    expect(approved.payload.pedagogicalReview.itemCount).toBe(2);
    expect(approved.payload.pedagogicalReview.reviewerKeyId).toBe('review-key-01');
    const approvalPath = join(dir, 'approval.json');
    const bad = JSON.parse(readFileSync(approvalPath, 'utf8'));
    bad.signature = Buffer.alloc(64).toString('base64');
    writeFileSync(approvalPath, JSON.stringify(bad));
    expect(sign).toThrow('SCORM_PEDAGOGICAL_INDEPENDENT_REVIEW_SIGNATURE_INVALID');
    const context = { packageSha256: approved.payload.packageSha256, runtimeSha,
      requiredSlides: 6, requiredActivities: 2 };
    const altered = structuredClone(approved);
    altered.payload.pedagogicalReview.itemCount = 1;
    expect(await verifyFormativeAttestation(altered, context, secret))
      .toMatchObject({ ok: false, reason: 'PEDAGOGICAL_REVIEW_INVALID' });
  });

  it('the payload is environment-independent (no staging tenant/course/package ids)', () => {
    const text = JSON.stringify(setup().sign().payload);
    expect(text).not.toMatch(/empresaId|cursoId|packageId/);
  });

  it.each([
    ['a failed case', (r: EvidenceRow) => { r.cases[3].status = 'FAIL'; }, 'CASES_INCOMPLETE_CHROMIUM'],
    ['a missing backend readback', (r: EvidenceRow) => { Reflect.deleteProperty(r, 'backendWitness'); }, 'BACKEND_READBACK_MISSING'],
    ['no cross-tenant denial', (r: EvidenceRow) => { r.verifiedCrossTenantDenial = false; }, 'E2E_INCOMPLETE_CHROMIUM'],
    ['a different driver', (r: EvidenceRow) => { r.driverSha256 = '9'.repeat(64); }, 'UNTRUSTED_BROWSER_CHROMIUM'],
    ['runtime drift', (r: EvidenceRow) => { r.runtimeSha = 'a'.repeat(40); }, 'UNTRUSTED_BROWSER_CHROMIUM'],
    ['a certificate that is not downloadable', (r: EvidenceRow) => { r.certificateDownloadHttpStatus = 404; }, 'CERTIFICATE_BACKEND_WITNESS_MISSING_CHROMIUM'],
  ])('refuses to sign %s', (_name, mutate, reason) => {
    expect(() => setup(mutate).sign()).toThrow(reason as string);
  });

  it('requires a distinct WebKit browser run with its own persisted certificate', () => {
    expect(() => setup(() => {}, r => { r.cases[1].status = 'INCONCLUSIVE'; }).sign())
      .toThrow('CASES_INCOMPLETE_WEBKIT');
    expect(() => setup(() => {}, r => { r.backendWitness.completionStatus = 'EM_ANDAMENTO'; }).sign())
      .toThrow();
    expect(() => setup(() => {}, r => { r.certificateDocument.enrollmentId = 11; }).sign())
      .toThrow();
  });

  it('refuses a signed envelope missing WebKit even with a valid HMAC', async () => {
    const { sign, packageSha256 } = setup();
    const envelope = sign();
    const payload = { ...envelope.payload, runs: [envelope.payload.runs[0]] };
    const signed = { payload, signature: createHash('sha256').update('not-a-real-hmac').digest('hex') };
    expect(await verifyFormativeAttestation(signed, {
      packageSha256, runtimeSha, requiredSlides: 6, requiredActivities: 2,
    }, secret)).toMatchObject({ ok: false, reason: 'JOURNEY_RUN_INVALID' });
  });
});
