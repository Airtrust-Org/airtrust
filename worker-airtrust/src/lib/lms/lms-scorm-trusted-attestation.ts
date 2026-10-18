/**
 * Independently produced, cryptographically bound SCORM functional evidence.
 * Never accept a certificate from the ZIP, player or learner. The QA signer key
 * must exist only in the governed staging QA runner and in the Worker secret.
 */
import {
  evaluateScormFunctionalCertification, SCORM_FUNCTIONAL_HARNESS,
  type ScormFunctionalBrowserRun,
} from './lms-scorm-functional-certification';

export const TRUSTED_SCORM_ATTESTATION_KIND = 'AIRTRUST_SCORM_STAGING_ATTESTATION_V1' as const;
export type TrustedScormAttestationPayload = {
  kind: typeof TRUSTED_SCORM_ATTESTATION_KIND;
  empresaId: number;
  cursoId: number;
  packageId: string;
  packageSha256: string;
  runtimeSha: string;
  harnessSha: string;
  issuedAt: string;
  scope: 'GOVERNED_STAGING_SYNTHETIC';
  requiresAssessment: boolean;
  /** Digest and governance identity of the outside-ZIP, independently approved review. */
  pedagogicalReview: { artifactSha256: string; driverSha256: string;
    reviewerReference: string; approvalReference: string; approvedAt: string; itemCount: number };
  /** Hashes of sanitized independent browser traces. */
  browserEvidenceSha256: { CHROMIUM: string; WEBKIT: string };
  /** One independently downloaded certificate per isolated browser enrollment. */
  certificateDocuments: {
    CHROMIUM: { enrollmentId: number; cycleId: number; qualificationHistoryId: number; documentId: string; sha256: string };
    WEBKIT: { enrollmentId: number; cycleId: number; qualificationHistoryId: number; documentId: string; sha256: string };
  };
  runs: ScormFunctionalBrowserRun[];
};
export type TrustedScormAttestation = {
  payload: TrustedScormAttestationPayload;
  signature: string;
};
export type TrustedScormContext = {
  empresaId: number; cursoId: number; packageId: string;
  packageSha256: string; runtimeSha: string; requiresAssessment: boolean;
};

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const HEX_SIGNATURE = /^[a-f0-9]{64}$/;

/** Signed bytes are the exact canonical projection; unknown fields are rejected. */
export function serializeScormAttestation(payload: TrustedScormAttestationPayload): string {
  const runs = payload.runs.map(run => ({
    harness: run.harness, browser: run.browser, packageSha256: run.packageSha256,
    cases: run.cases.map(item => ({ name: item.name, status: item.status })),
  }));
  return JSON.stringify({
    kind: payload.kind, empresaId: payload.empresaId, cursoId: payload.cursoId,
    packageId: payload.packageId, packageSha256: payload.packageSha256,
    runtimeSha: payload.runtimeSha, harnessSha: payload.harnessSha,
    issuedAt: payload.issuedAt, scope: payload.scope,
    requiresAssessment: payload.requiresAssessment,
    pedagogicalReview: { ...payload.pedagogicalReview },
    browserEvidenceSha256: {
      CHROMIUM: payload.browserEvidenceSha256.CHROMIUM,
      WEBKIT: payload.browserEvidenceSha256.WEBKIT,
    },
    certificateDocuments: {
      CHROMIUM: { ...payload.certificateDocuments.CHROMIUM },
      WEBKIT: { ...payload.certificateDocuments.WEBKIT },
    },
    runs,
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  return isPlainObject(value) &&
    Object.keys(value).length === keys.length &&
    keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function safeHexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map(pair => parseInt(pair, 16)));
}

/** Use the same canonical projection when signing in the governed Node runner. */
export async function verifyTrustedScormAttestation(
  candidate: unknown, context: TrustedScormContext,
  secret: string | undefined, now = Date.now(),
): Promise<boolean> {
  if (!secret || secret.length < 32 ||
      !exactKeys(candidate, ['payload', 'signature'])) return false;
  const envelope = candidate as TrustedScormAttestation;
  const p = envelope.payload;
  if (!exactKeys(p, [
    'kind','empresaId','cursoId','packageId','packageSha256','runtimeSha',
    'harnessSha','issuedAt','scope','requiresAssessment','pedagogicalReview','browserEvidenceSha256',
    'certificateDocuments','runs',
  ])) return false;
  if (p.kind !== TRUSTED_SCORM_ATTESTATION_KIND ||
      p.scope !== 'GOVERNED_STAGING_SYNTHETIC' ||
      p.empresaId !== context.empresaId || p.cursoId !== context.cursoId ||
      p.packageId !== context.packageId || p.packageSha256 !== context.packageSha256 ||
      p.runtimeSha !== context.runtimeSha || p.requiresAssessment !== context.requiresAssessment ||
      !Number.isSafeInteger(p.empresaId) || p.empresaId <= 0 ||
      !Number.isSafeInteger(p.cursoId) || p.cursoId <= 0 ||
      !/^[a-f\d-]{36}$/.test(p.packageId) ||
      !SHA256.test(p.packageSha256) || !COMMIT.test(p.runtimeSha) ||
      !COMMIT.test(p.harnessSha) ||
      !exactKeys(p.certificateDocuments, ['CHROMIUM','WEBKIT']) ||
      !exactKeys(p.browserEvidenceSha256, ['CHROMIUM','WEBKIT']) ||
      !SHA256.test(p.browserEvidenceSha256.CHROMIUM) ||
      !SHA256.test(p.browserEvidenceSha256.WEBKIT) ||
      p.browserEvidenceSha256.CHROMIUM === p.browserEvidenceSha256.WEBKIT ||
      typeof p.issuedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.issuedAt) ||
      !Number.isFinite(Date.parse(p.issuedAt)) ||
      Date.parse(p.issuedAt) > now + 60_000 ||
      now - Date.parse(p.issuedAt) > 30 * 86400_000 ||
      !HEX_SIGNATURE.test(envelope.signature)) return false;
  const review=p.pedagogicalReview;
  const expectedReviewCount=p.packageSha256===
    'cdc5a3cf30e4d37697c1f411977d87e16538bc75a6c03379252bbc2c8c06f6d2' ? 80 :
    p.packageSha256==='8c15a73984591fcea71a4957e306dc8676c40d937537058f2440e52a3748baa7' ? 45 : null;
  if (!exactKeys(review, ['artifactSha256','driverSha256','reviewerReference',
    'approvalReference','approvedAt','itemCount']) ||
    !SHA256.test(review.artifactSha256) || !SHA256.test(review.driverSha256) ||
    !/^[a-zA-Z0-9._:-]{6,128}$/.test(review.reviewerReference) ||
    typeof review.approvalReference!=='string' ||
    review.approvalReference.trim().length<10 || review.approvalReference.length>128 ||
    !Number.isSafeInteger(review.itemCount) || review.itemCount<=0 ||
    review.itemCount>2500 ||
    expectedReviewCount!==null && review.itemCount!==expectedReviewCount ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(review.approvedAt) ||
    !Number.isFinite(Date.parse(review.approvedAt)) ||
    Date.parse(review.approvedAt)>now+60000 ||
    now-Date.parse(review.approvedAt)>365*86400_000) return false;
  const docs = p.certificateDocuments;
  for (const browser of ['CHROMIUM','WEBKIT'] as const) {
    const document = docs[browser];
    if (!exactKeys(document, [
      'enrollmentId','cycleId','qualificationHistoryId','documentId','sha256',
    ]) || !Number.isSafeInteger(document.enrollmentId) || document.enrollmentId <= 0 ||
      !Number.isSafeInteger(document.cycleId) || document.cycleId <= 0 ||
      !Number.isSafeInteger(document.qualificationHistoryId) ||
      document.qualificationHistoryId <= 0 ||
      typeof document.documentId !== 'string' || !document.documentId.trim() ||
      document.documentId.length > 128 ||
      !SHA256.test(document.sha256)) return false;
  }
  if (docs.CHROMIUM.enrollmentId === docs.WEBKIT.enrollmentId ||
      docs.CHROMIUM.cycleId === docs.WEBKIT.cycleId ||
      docs.CHROMIUM.qualificationHistoryId === docs.WEBKIT.qualificationHistoryId ||
      docs.CHROMIUM.documentId === docs.WEBKIT.documentId ||
      docs.CHROMIUM.sha256 === docs.WEBKIT.sha256) return false;
  if (!Array.isArray(p.runs) || p.runs.length !== 2 ||
      p.runs.some(run => !exactKeys(run,
        ['harness','browser','packageSha256','cases']) ||
        run.harness !== SCORM_FUNCTIONAL_HARNESS ||
        !Array.isArray(run.cases) ||
        run.cases.some(item => !exactKeys(item, ['name','status'])))) return false;
  const verdict = evaluateScormFunctionalCertification(p.packageSha256, p.runs, {
    requiresAssessment: p.requiresAssessment,
  });
  if (verdict.status !== 'CERTIFIED') return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify'],
    );
    return await crypto.subtle.verify(
      'HMAC', key, safeHexToBytes(envelope.signature),
      encoder.encode(serializeScormAttestation(p)),
    );
  } catch {
    return false;
  }
}
