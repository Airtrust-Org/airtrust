/**
 * Read-only Player 3 SCORM 1.2 admission.
 *
 * A physical SCORM enrolment stays on the existing authenticated SCO wrapper.
 * Native admission/launch must never be used as a substitute for SCORM.
 * Unknown candidate editions fail closed; neither client CMI nor a course
 * preference is an authorization for completion or certification.
 */
import type { Env } from '../types';
import {
  readActiveScormPlayer3Profile,
  scormPlayer3AdmissionAllowed,
} from './lms-scorm-player3-profile';

export type ScormPlayer3Admission =
  | Readonly<{ kind: 'LEGACY'; reason: 'NOT_A_SCORE_CANDIDATE' }>
  | Readonly<{ kind: 'BLOCKED'; reason:
      'SCOPE_INVALID' | 'CANDIDATE_UNVERIFIED' | 'PLAYER3_NOT_ENABLED' }>
  | Readonly<{ kind: 'SCORM_STUDY'; reason: 'ACTIVE_PACKAGE_ADMITTED';
      packageSha256: string; packageVersion: string; activePrefix: string;
      completionAuthorized: false; examAuthorized: false; certificateAuthorized: false }>;

const positive = (n: number) => Number.isSafeInteger(n) && n > 0;

/**
 * Input fields MUST originate in a tenant-filtered, authenticated Worker query
 * for this course and enrolment; never from a browser-supplied package path.
 * The caller separately validates learner/manager RBAC and current cycle.
 */
export async function resolveScormPlayer3Admission(input: {
  env: Env; db: D1Database; bucket: R2Bucket;
  tenant: number; course: number; scormVersion: string | null;
  contentType: string | null; activePrefix: string | null;
  reviewedForProduction: boolean;
}): Promise<ScormPlayer3Admission> {
  const { env, db, bucket, tenant, course, activePrefix } = input;
  // No candidate edition: preserve the existing legacy contract. The
  // caller has already validated its authenticated enrollment and tenant.
  // Candidate editions require stronger identity and immutable-package checks.
  if (!activePrefix || !activePrefix.includes('/_candidates'))
    return { kind: 'LEGACY', reason: 'NOT_A_SCORE_CANDIDATE' };
  if (!positive(tenant) || !positive(course))
    return { kind: 'BLOCKED', reason: 'SCOPE_INVALID' };
  // Trust only the Worker-sourced active course path. Malformed candidate
  // metadata (content type or SCORM version) MUST NOT be reclassified legacy.
  if (input.contentType?.toLowerCase() !== 'scorm' ||
      input.scormVersion !== '1.2')
    return { kind: 'BLOCKED', reason: 'CANDIDATE_UNVERIFIED' };

  // Candidate path must bind to the trusted course row and current tenant.
  const scopedPrefix = new RegExp(
    '^lms/scorm/' + tenant + '/' + course +
    '/_candidates/[A-Za-z0-9-]+/$'
  );
  if (!scopedPrefix.test(activePrefix))
    return { kind: 'BLOCKED', reason: 'SCOPE_INVALID' };

  let profile;
  try {
    profile = await readActiveScormPlayer3Profile({
      db, bucket, tenant, course, activePrefix,
    });
  } catch {
    // Corrupt/unavailable R2, DB or active-package evidence never falls back.
    return { kind: 'BLOCKED', reason: 'CANDIDATE_UNVERIFIED' };
  }
  if (!profile)
    return { kind: 'BLOCKED', reason: 'CANDIDATE_UNVERIFIED' };
  if (!scormPlayer3AdmissionAllowed(
    env, tenant, course, profile, input.reviewedForProduction,
  )) return { kind: 'BLOCKED', reason: 'PLAYER3_NOT_ENABLED' };

  return {
    kind: 'SCORM_STUDY', reason: 'ACTIVE_PACKAGE_ADMITTED',
    packageSha256: profile.packageSha256,
    packageVersion: profile.packageVersion,
    activePrefix: profile.activePrefix,
    completionAuthorized: false,
    examAuthorized: false,
    certificateAuthorized: false,
  };
}
