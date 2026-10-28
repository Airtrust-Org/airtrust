import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

function setup(mutate: (row: Record<string, any>) => void = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'formative-signer-'));
  dirs.push(dir);
  const zip = Buffer.from(zipSync({
    'imsmanifest.xml': strToU8('<manifest><resources><resource href="index.html"/></resources></manifest>'),
    'index.html': strToU8('<html></html>'),
  }));
  const packageSha256 = sha(zip);
  const click = { op: 'click', selector: '#next' };
  const driver = Buffer.from(JSON.stringify({
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
  const row: Record<string, any> = {
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
  mutate(row);
  writeFileSync(candidate.zipPath, zip);
  writeFileSync(join(dir, 'driver.json'), driver);
  writeFileSync(join(dir, 'chromium.json'), JSON.stringify(row));
  writeFileSync(join(dir, 'cert.pdf'), pdf);
  const sign = () => signFormativeScormEvidence({
    candidate, chromiumFile: join(dir, 'chromium.json'), certificatePdfFile: join(dir, 'cert.pdf'),
    driverFile: join(dir, 'driver.json'), secret, runtimeSha, harnessSha,
  });
  return { sign, packageSha256 };
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

  it('the payload is environment-independent (no staging tenant/course/package ids)', () => {
    const text = JSON.stringify(setup().sign().payload);
    expect(text).not.toMatch(/empresaId|cursoId|packageId/);
  });

  it.each([
    ['a failed case', (r: Record<string, any>) => { r.cases[3].status = 'FAIL'; }, 'CASES_INCOMPLETE'],
    ['a missing backend readback', (r: Record<string, any>) => { delete r.backendWitness; }, 'BACKEND_READBACK_MISSING'],
    ['no cross-tenant denial', (r: Record<string, any>) => { r.verifiedCrossTenantDenial = false; }, 'E2E_INCOMPLETE'],
    ['a different driver', (r: Record<string, any>) => { r.driverSha256 = '9'.repeat(64); }, 'UNTRUSTED_BROWSER_CHROMIUM'],
    ['runtime drift', (r: Record<string, any>) => { r.runtimeSha = 'a'.repeat(40); }, 'UNTRUSTED_BROWSER_CHROMIUM'],
    ['a certificate that is not downloadable', (r: Record<string, any>) => { r.certificateDownloadHttpStatus = 404; }, 'CERTIFICATE_BACKEND_WITNESS_MISSING'],
  ])('refuses to sign %s', (_name, mutate, reason) => {
    expect(() => setup(mutate).sign()).toThrow(reason as string);
  });
});
