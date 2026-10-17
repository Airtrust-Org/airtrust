import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { REQUIRED_SCORM_FUNCTIONAL_CASES, SCORM_FUNCTIONAL_HARNESS } from '../../lib/lms/lms-scorm-functional-certification';
import {
  serializeScormAttestation, verifyTrustedScormAttestation,
  TRUSTED_SCORM_ATTESTATION_KIND,
  type TrustedScormAttestationPayload, type TrustedScormContext,
} from '../../lib/lms/lms-scorm-trusted-attestation';

const secret = 'scorm-qa-secret-for-test-only-with-more-than-32-chars';
const packageId = '123e4567-e89b-42d3-a456-426614174000';
const sha = 'a'.repeat(64);
const runtimeSha = 'b'.repeat(40);
const harnessSha = 'c'.repeat(40);
const context: TrustedScormContext = {
  empresaId: 17, cursoId: 23, packageId, packageSha256: sha,
  runtimeSha, requiresAssessment: true,
};
const run = (browser: 'CHROMIUM' | 'WEBKIT') => ({
  harness: SCORM_FUNCTIONAL_HARNESS, browser, packageSha256: sha,
  cases: REQUIRED_SCORM_FUNCTIONAL_CASES.map(name => ({ name, status: 'PASS' as const })),
});
const payload = (): TrustedScormAttestationPayload => ({
  kind: TRUSTED_SCORM_ATTESTATION_KIND,
  ...context, harnessSha, issuedAt: '2026-10-17T19:00:00.000Z',
  scope: 'GOVERNED_STAGING_SYNTHETIC',
  browserEvidenceSha256: { CHROMIUM: '1'.repeat(64), WEBKIT: '2'.repeat(64) },
  certificateDocuments: {
    CHROMIUM: { enrollmentId: 1001, cycleId: 2001, qualificationHistoryId: 3001, documentId: 'qa-doc-chromium', sha256: '3'.repeat(64) },
    WEBKIT: { enrollmentId: 1002, cycleId: 2002, qualificationHistoryId: 3002, documentId: 'qa-doc-webkit', sha256: '4'.repeat(64) },
  },
  runs: [run('CHROMIUM'), run('WEBKIT')],
});
const seal = (p: TrustedScormAttestationPayload) => ({
  payload: p,
  signature: createHmac('sha256', secret).update(serializeScormAttestation(p)).digest('hex'),
});
const now = Date.parse('2026-10-17T19:05:00.000Z');

describe('governed independent SCORM browser attestation', () => {
  it('verifies a complete signed staging-only certificate', async () => {
    expect(await verifyTrustedScormAttestation(seal(payload()), context, secret, now)).toBe(true);
  });
  it('rejects absent signing authority and tampered signatures', async () => {
    const cert = seal(payload());
    expect(await verifyTrustedScormAttestation(cert, context, undefined, now)).toBe(false);
    expect(await verifyTrustedScormAttestation({ ...cert, signature: '0'.repeat(64) }, context, secret, now)).toBe(false);
    expect(await verifyTrustedScormAttestation({ ...cert, payload: { ...cert.payload, cursoId: 99 } }, context, secret, now)).toBe(false);
  });
  it('rejects edition, ZIP and runtime substitution even when signature is valid', async () => {
    const cert = seal(payload());
    expect(await verifyTrustedScormAttestation(cert, { ...context, packageId: crypto.randomUUID() }, secret, now)).toBe(false);
    expect(await verifyTrustedScormAttestation(cert, { ...context, packageSha256: '0'.repeat(64) }, secret, now)).toBe(false);
    expect(await verifyTrustedScormAttestation(cert, { ...context, runtimeSha: 'd'.repeat(40) }, secret, now)).toBe(false);
    expect(await verifyTrustedScormAttestation(cert, { ...context, empresaId: 18 }, secret, now)).toBe(false);
  });
  it('rejects missing browser, incomplete exam, duplicates and spoofed outcome', async () => {
    const one = payload(); one.runs.pop();
    expect(await verifyTrustedScormAttestation(seal(one), context, secret, now)).toBe(false);
    const duplicate = payload(); duplicate.runs[1] = run('CHROMIUM');
    expect(await verifyTrustedScormAttestation(seal(duplicate), context, secret, now)).toBe(false);
    const missing = payload(); missing.runs[0].cases.pop();
    expect(await verifyTrustedScormAttestation(seal(missing), context, secret, now)).toBe(false);
    const fail = payload(); fail.runs[1].cases[3].status = 'INCONCLUSIVE' as 'PASS';
    expect(await verifyTrustedScormAttestation(seal(fail), context, secret, now)).toBe(false);
  });
  it('rejects local fixture, absent PDF provenance and expired claims', async () => {
    const local = payload(); (local as {scope:string}).scope = 'LOCAL_DISPOSABLE';
    expect(await verifyTrustedScormAttestation(seal(local as TrustedScormAttestationPayload), context, secret, now)).toBe(false);
    const pdf = payload(); pdf.certificateDocuments.WEBKIT.sha256 = '';
    expect(await verifyTrustedScormAttestation(seal(pdf), context, secret, now)).toBe(false);
    const stale = payload(); stale.issuedAt = '2026-08-01T19:00:00.000Z';
    expect(await verifyTrustedScormAttestation(seal(stale), context, secret, now)).toBe(false);
    const future = payload(); future.issuedAt = '2026-10-18T19:00:00.000Z';
    expect(await verifyTrustedScormAttestation(seal(future), context, secret, now)).toBe(false);
  });
  it('rejects reuse of enrollment, lifecycle, history or certificate documents across browsers', async () => {
    const original = payload();
    for (const field of ['enrollmentId','cycleId','qualificationHistoryId','documentId'] as const) {
      const altered = structuredClone(original);
      // The payload is re-signed to prove it is the verifier, not only HMAC,
      // that rejects an invalidly shared student/document identity.
      (altered.certificateDocuments.WEBKIT as unknown as Record<string, unknown>)[field] =
        altered.certificateDocuments.CHROMIUM[field];
      expect(await verifyTrustedScormAttestation(seal(altered), context, secret, now)).toBe(false);
    }
  });
  it('rejects unexpected object fields, malicious extra certificate state and malformed evidence', async () => {
    const extended = { ...payload(), publishable: true };
    expect(await verifyTrustedScormAttestation({ payload: extended, signature: 'a'.repeat(64) }, context, secret, now)).toBe(false);
    const bad = payload(); (bad.runs[0].cases[0] as {status:string}).status = 'passed';
    expect(await verifyTrustedScormAttestation(seal(bad), context, secret, now)).toBe(false);
  });
});
