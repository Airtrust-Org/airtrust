/**
 * Certification profile for FORMATIVE SCORM courses WITHOUT a final exam.
 *
 * Two independent authenticated browser journeys (Chromium and WebKit), each
 * with a distinct backend certificate PDF, are required even without an exam.
 * An authenticated, audited administrative approval binds the exact ZIP to
 * tenant/course; the ZIP cannot self-certify.
 *
 * Nothing here is derived from the ZIP's self-declared release fields. The
 * static contract only proves that the manifest cannot be mistaken for a scored
 * or externally examined course. Scored, externally examined or legally
 * assessed courses never use this profile.
 */
import {
  evaluateScormFunctionalCertification, SCORM_FUNCTIONAL_HARNESS,
  type ScormFunctionalBrowserRun,
} from './lms-scorm-functional-certification';

export const FORMATIVE_PROFILE = 'FORMATIVE_NO_EXAM_V1' as const;
export const FORMATIVE_ATTESTATION_KIND = 'AIRTRUST_SCORM_FORMATIVE_ATTESTATION_V1' as const;
const COMPLETION_CONTRACT = 'AIRTRUST_COMPLETION_CONTRACT_V1';

/** The three assessment cases do not apply: there is no scored quiz. */
export const FORMATIVE_REQUIRED_CASES = [
  'FIRST_ACCESS', 'REQUIRED_CONTENT_COVERAGE', 'REQUIRED_INTERACTIONS',
  'PERSISTENCE_VERIFIED', 'SUSPEND_RESUME', 'EXPLICIT_FINALIZATION',
  'REOPEN_COMPLETED', 'NO_STATUS_DOWNGRADE', 'TENANT_CYCLE_ISOLATION',
] as const;

export type FormativeContract = {
  eligible: boolean;
  errors: string[];
  requiredSlides: number;
  requiredActivities: number;
};

function rec(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>) : null;
}

function uniqueIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.some(item => typeof item !== 'string' || !item.trim())) return null;
  const ids = value as string[];
  return new Set(ids.map(id => id.toLocaleLowerCase('en-US'))).size === ids.length ? ids : null;
}

/**
 * Static, server-side contract. `eligible=false` is NOT a rejection of the ZIP;
 * it only means the candidate cannot use the formative profile.
 */
export function evaluateFormativeNoExamContract(manifest: Record<string, unknown> | null): FormativeContract {
  const errors: string[] = [];
  const empty = { eligible: false, requiredSlides: 0, requiredActivities: 0 };
  if (!manifest) return { ...empty, errors: ['manifesto de conclusão ausente ou inválido'] };

  const assessment = rec(manifest.assessment);
  const completion = rec(manifest.completion);
  const content = rec(manifest.content);
  const formative = rec(manifest.formative);

  if (assessment?.mode !== 'NONE') errors.push('assessment.mode deve ser NONE');
  if (assessment?.scoringBySCORM !== false) errors.push('assessment.scoringBySCORM deve ser false');
  if (!Array.isArray(assessment?.requiredInteractions) || assessment.requiredInteractions.length !== 0) {
    errors.push('assessment.requiredInteractions deve ser []');
  }
  if (assessment && assessment.masteryScore !== undefined) errors.push('assessment.masteryScore não é admitido');
  if (assessment && assessment.failureStatus !== undefined) errors.push('assessment.failureStatus não é admitido');
  if (assessment?.successStatus !== undefined && assessment.successStatus !== 'completed') {
    errors.push('assessment.successStatus deve ser completed');
  }
  if (completion?.strategy !== COMPLETION_CONTRACT) errors.push(`completion.strategy deve ser ${COMPLETION_CONTRACT}`);
  if (completion?.passStatusFromSCORM !== false) errors.push('completion.passStatusFromSCORM deve ser false');
  if (completion?.workerApprovalRequired !== true) errors.push('completion.workerApprovalRequired deve ser true');
  if (formative?.scored !== false) errors.push('formative.scored deve ser false');

  const slides = uniqueIds(content?.requiredSlides);
  if (!slides) errors.push('content.requiredSlides deve listar IDs únicos');
  const activities = uniqueIds(formative?.requiredActivities);
  if (!activities) errors.push('formative.requiredActivities deve listar IDs únicos');
  if (slides && activities) {
    const known = new Set(slides);
    const unknown = activities.filter(id => !known.has(id));
    if (unknown.length) errors.push(`formative.requiredActivities fora do deck: ${unknown.slice(0, 3).join(', ')}`);
  }
  return {
    eligible: errors.length === 0, errors,
    requiredSlides: slides?.length ?? 0, requiredActivities: activities?.length ?? 0,
  };
}

// ── Signed evidence (produced only by the governed staging QA runner) ────────

export type FormativeCertificateDocument = {
  enrollmentId: number; cycleId: number; qualificationHistoryId: number;
  documentId: string; sha256: string;
};
export type FormativeAttestationPayload = {
  kind: typeof FORMATIVE_ATTESTATION_KIND;
  profile: typeof FORMATIVE_PROFILE;
  scope: 'GOVERNED_STAGING_SYNTHETIC';
  packageSha256: string;
  runtimeSha: string;
  harnessSha: string;
  issuedAt: string;
  requiredSlides: number;
  requiredActivities: number;
  driverSha256: string;
  pedagogicalReview: {
    artifactSha256: string; driverSha256: string;
    reviewerReference: string; approvalReference: string; approvedAt: string;
    itemCount: number; reviewerKeyId: string;
    reviewerPublicKeySha256: string; approvalSignatureSha256: string;
  };
  browserEvidenceSha256: { CHROMIUM: string; WEBKIT: string };
  backendWitnessSha256: { CHROMIUM: string; WEBKIT: string };
  certificateDocuments: {
    CHROMIUM: FormativeCertificateDocument;
    WEBKIT: FormativeCertificateDocument;
  };
  runs: [ScormFunctionalBrowserRun, ScormFunctionalBrowserRun];
};
export type FormativeAttestation = { payload: FormativeAttestationPayload; signature: string };
export type FormativeAttestationContext = {
  packageSha256: string; runtimeSha: string; requiredSlides: number; requiredActivities: number;
};
export type FormativeVerdict = { ok: true } | { ok: false; reason: string };

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_AGE_MS = 30 * 86_400_000;

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  const r = rec(value);
  return !!r && Object.keys(r).length === keys.length &&
    keys.every(key => Object.prototype.hasOwnProperty.call(r, key));
}

/** The exact projection signed by the CI signer and verified by the Worker. */
export function serializeFormativeAttestation(p: FormativeAttestationPayload): string {
  return JSON.stringify({
    kind: p.kind, profile: p.profile, scope: p.scope,
    packageSha256: p.packageSha256, runtimeSha: p.runtimeSha, harnessSha: p.harnessSha,
    issuedAt: p.issuedAt, requiredSlides: p.requiredSlides, requiredActivities: p.requiredActivities,
    driverSha256: p.driverSha256,
    pedagogicalReview: {
      artifactSha256: p.pedagogicalReview.artifactSha256,
      driverSha256: p.pedagogicalReview.driverSha256,
      reviewerReference: p.pedagogicalReview.reviewerReference,
      approvalReference: p.pedagogicalReview.approvalReference,
      approvedAt: p.pedagogicalReview.approvedAt,
      itemCount: p.pedagogicalReview.itemCount,
      reviewerKeyId: p.pedagogicalReview.reviewerKeyId,
      reviewerPublicKeySha256: p.pedagogicalReview.reviewerPublicKeySha256,
      approvalSignatureSha256: p.pedagogicalReview.approvalSignatureSha256,
    },
    browserEvidenceSha256: {
      CHROMIUM: p.browserEvidenceSha256.CHROMIUM, WEBKIT: p.browserEvidenceSha256.WEBKIT,
    },
    backendWitnessSha256: {
      CHROMIUM: p.backendWitnessSha256.CHROMIUM, WEBKIT: p.backendWitnessSha256.WEBKIT,
    },
    certificateDocuments: Object.fromEntries((['CHROMIUM', 'WEBKIT'] as const).map(browser => {
      const d = p.certificateDocuments[browser];
      return [browser, {
        enrollmentId: d.enrollmentId, cycleId: d.cycleId,
        qualificationHistoryId: d.qualificationHistoryId, documentId: d.documentId, sha256: d.sha256,
      }];
    })),
    runs: p.runs.map(run => ({
      harness: run.harness, browser: run.browser, packageSha256: run.packageSha256,
      cases: run.cases.map(item => ({ name: item.name, status: item.status })),
    })),
  });
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map(pair => parseInt(pair, 16)));
}

export async function formativeAttestationDigest(envelope: FormativeAttestation): Promise<string> {
  const bytes = new TextEncoder().encode(`${serializeFormativeAttestation(envelope.payload)}.${envelope.signature}`);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fail-closed verification. Returns a stable reason code (never user data) so the
 * admin UI can say exactly which requirement is missing.
 */
export async function verifyFormativeAttestation(
  candidate: unknown, context: FormativeAttestationContext,
  secret: string | undefined, now = Date.now(),
): Promise<FormativeVerdict> {
  const no = (reason: string): FormativeVerdict => ({ ok: false, reason });
  if (!secret || secret.length < 32) return no('ATTESTATION_SECRET_UNAVAILABLE');
  if (!exactKeys(candidate, ['payload', 'signature'])) return no('ATTESTATION_SHAPE_INVALID');
  const env = candidate as FormativeAttestation;
  const p = env.payload;
  if (!exactKeys(p, ['kind', 'profile', 'scope', 'packageSha256', 'runtimeSha', 'harnessSha', 'issuedAt',
    'requiredSlides', 'requiredActivities', 'driverSha256', 'pedagogicalReview', 'browserEvidenceSha256',
    'backendWitnessSha256', 'certificateDocuments', 'runs'])) return no('ATTESTATION_SHAPE_INVALID');
  if (p.kind !== FORMATIVE_ATTESTATION_KIND || p.profile !== FORMATIVE_PROFILE ||
      p.scope !== 'GOVERNED_STAGING_SYNTHETIC') return no('ATTESTATION_PROFILE_INVALID');
  if (!SHA256.test(env.signature)) return no('ATTESTATION_SIGNATURE_INVALID');
  if (!SHA256.test(context.packageSha256) || p.packageSha256 !== context.packageSha256) return no('PACKAGE_SHA_MISMATCH');
  if (!COMMIT.test(context.runtimeSha) || p.runtimeSha !== context.runtimeSha) return no('RUNTIME_SHA_MISMATCH');
  if (!COMMIT.test(p.harnessSha)) return no('HARNESS_SHA_INVALID');
  if (!SHA256.test(p.driverSha256) ||
      !exactKeys(p.browserEvidenceSha256, ['CHROMIUM', 'WEBKIT']) ||
      !exactKeys(p.backendWitnessSha256, ['CHROMIUM', 'WEBKIT']) ||
      !(['CHROMIUM', 'WEBKIT'] as const).every(browser =>
        SHA256.test(p.browserEvidenceSha256[browser]) &&
        SHA256.test(p.backendWitnessSha256[browser])) ||
      p.browserEvidenceSha256.CHROMIUM === p.browserEvidenceSha256.WEBKIT ||
      p.backendWitnessSha256.CHROMIUM === p.backendWitnessSha256.WEBKIT) {
    return no('EVIDENCE_DIGEST_INVALID');
  }
  const review = p.pedagogicalReview;
  if (!exactKeys(review, [
    'artifactSha256', 'driverSha256', 'reviewerReference', 'approvalReference',
    'approvedAt', 'itemCount', 'reviewerKeyId', 'reviewerPublicKeySha256',
    'approvalSignatureSha256',
  ]) || !SHA256.test(review.artifactSha256) ||
      review.driverSha256 !== p.driverSha256 ||
      !SHA256.test(review.reviewerPublicKeySha256) ||
      !SHA256.test(review.approvalSignatureSha256) ||
      typeof review.reviewerReference !== 'string' ||
      !/^[a-zA-Z0-9._:-]{6,128}$/.test(review.reviewerReference) ||
      typeof review.reviewerKeyId !== 'string' ||
      !/^[a-zA-Z0-9._:-]{6,128}$/.test(review.reviewerKeyId) ||
      typeof review.approvalReference !== 'string' ||
      review.approvalReference.trim().length < 10 || review.approvalReference.length > 128 ||
      typeof review.approvedAt !== 'string' || !ISO.test(review.approvedAt) ||
      !Number.isFinite(Date.parse(review.approvedAt)) ||
      Date.parse(review.approvedAt) > now + 60_000 ||
      now - Date.parse(review.approvedAt) > 365 * 86_400_000 ||
      !Number.isSafeInteger(review.itemCount) ||
      review.itemCount !== p.requiredActivities) return no('PEDAGOGICAL_REVIEW_INVALID');
  if (!Number.isSafeInteger(p.requiredSlides) || p.requiredSlides < 1 ||
      p.requiredSlides !== context.requiredSlides ||
      !Number.isSafeInteger(p.requiredActivities) || p.requiredActivities < 1 ||
      p.requiredActivities !== context.requiredActivities) return no('CONTENT_COVERAGE_MISMATCH');
  if (typeof p.issuedAt !== 'string' || !ISO.test(p.issuedAt) || !Number.isFinite(Date.parse(p.issuedAt)) ||
      Date.parse(p.issuedAt) > now + 60_000) return no('ATTESTATION_TIME_INVALID');
  if (now - Date.parse(p.issuedAt) > MAX_AGE_MS) return no('ATTESTATION_EXPIRED');
  if (!exactKeys(p.certificateDocuments, ['CHROMIUM', 'WEBKIT'])) {
    return no('CERTIFICATE_WITNESS_INVALID');
  }
  for (const browser of ['CHROMIUM', 'WEBKIT'] as const) {
    const doc = p.certificateDocuments[browser];
    if (!exactKeys(doc, ['enrollmentId', 'cycleId', 'qualificationHistoryId', 'documentId', 'sha256']) ||
        !Number.isSafeInteger(doc.enrollmentId) || doc.enrollmentId <= 0 ||
        !Number.isSafeInteger(doc.cycleId) || doc.cycleId <= 0 ||
        !Number.isSafeInteger(doc.qualificationHistoryId) || doc.qualificationHistoryId <= 0 ||
        typeof doc.documentId !== 'string' || !doc.documentId.trim() || doc.documentId.length > 128 ||
        !SHA256.test(doc.sha256)) return no('CERTIFICATE_WITNESS_INVALID');
  }
  const first = p.certificateDocuments.CHROMIUM;
  const second = p.certificateDocuments.WEBKIT;
  if (first.enrollmentId === second.enrollmentId || first.cycleId === second.cycleId ||
      first.qualificationHistoryId === second.qualificationHistoryId ||
      first.documentId === second.documentId || first.sha256 === second.sha256) {
    return no('CERTIFICATE_WITNESS_NOT_INDEPENDENT');
  }
  if (!Array.isArray(p.runs) || p.runs.length !== 2 ||
      p.runs[0]?.browser !== 'CHROMIUM' || p.runs[1]?.browser !== 'WEBKIT') {
    return no('JOURNEY_RUN_INVALID');
  }
  for (const run of p.runs) {
    if (!exactKeys(run, ['harness', 'browser', 'packageSha256', 'cases']) ||
        run.harness !== SCORM_FUNCTIONAL_HARNESS || run.packageSha256 !== context.packageSha256 ||
        !Array.isArray(run.cases) ||
        run.cases.some(item => !exactKeys(item, ['name', 'status']))) return no('JOURNEY_RUN_INVALID');
    const names = run.cases.map(item => item.name as string);
    if (names.length !== FORMATIVE_REQUIRED_CASES.length ||
        FORMATIVE_REQUIRED_CASES.some(name => !names.includes(name))) return no('JOURNEY_CASES_INCOMPLETE');
  }
  const verdict = evaluateScormFunctionalCertification(context.packageSha256, p.runs, {
    requiresAssessment: false,
  });
  if (verdict.status !== 'CERTIFIED') return no('JOURNEY_NOT_CERTIFIED');
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, hexToBytes(env.signature),
      encoder.encode(serializeFormativeAttestation(p)));
    return valid ? { ok: true } : no('ATTESTATION_SIGNATURE_INVALID');
  } catch {
    return no('ATTESTATION_SIGNATURE_INVALID');
  }
}
