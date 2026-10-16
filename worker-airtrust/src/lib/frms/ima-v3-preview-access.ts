/**
 * Research-only, staging-only FRMS V3 preview control.
 * The absence of this flag MUST be fail-closed. Never permit "all" here.
 * This is supplemental to auth + tenant + FRMS team RBAC, not a substitute.
 */
export function isImaV3StagingPreviewEnabled(
  env: { ENVIRONMENT?: string; FRMS_V3_SHADOW_PREVIEW_TENANTS?: string },
  empresaId: number,
): boolean {
  if (env.ENVIRONMENT !== 'staging' || !Number.isSafeInteger(empresaId) || empresaId <= 0) {
    return false;
  }
  const raw = String(env.FRMS_V3_SHADOW_PREVIEW_TENANTS ?? '').trim();
  if (!raw || !/^\d+(?:\s*,\s*\d+)*$/.test(raw)) return false;
  return raw.split(',').some((token) => Number(token.trim()) === empresaId);
}

/** Cohort authorization is deliberately independent of the individual preview.
 * Enabling a 90-day aggregate research study must NOT enable crew-specific reads.
 */
export function isImaV3StagingCohortStudyEnabled(
  env: { ENVIRONMENT?: string; FRMS_V3_COHORT_STUDY_TENANTS?: string },
  empresaId: number,
): boolean {
  return isImaV3StagingPreviewEnabled({
    ENVIRONMENT: env.ENVIRONMENT,
    FRMS_V3_SHADOW_PREVIEW_TENANTS: env.FRMS_V3_COHORT_STUDY_TENANTS,
  }, empresaId);
}

/**
 * Prevent overlapping 30/60/90-day cohort queries and monthly refreshes from
 * being enabled by a single tenant allowlist. A staging research approval
 * covers exactly one window length and one closed-month end date.
 *
 * This is a secondary gate: authorization, privacy review and FRMS team RBAC
 * are STILL required before any actual source read. Changing these bindings
 * requires a separate, reviewed staging configuration change.
 */
export function isImaV3ApprovedCohortWindow(
  env: {
    ENVIRONMENT?: string;
    FRMS_V3_COHORT_STUDY_TENANTS?: string;
    FRMS_V3_COHORT_APPROVED_WINDOW_DAYS?: string;
    FRMS_V3_COHORT_APPROVED_END_DATE?: string;
  },
  empresaId: number,
  windowDays: 30 | 60 | 90,
  periodEndDate: string,
): boolean {
  if (!isImaV3StagingCohortStudyEnabled(env, empresaId)) return false;
  const approvedDays = env.FRMS_V3_COHORT_APPROVED_WINDOW_DAYS;
  const approvedEnd = env.FRMS_V3_COHORT_APPROVED_END_DATE;
  if (approvedDays !== String(windowDays)) return false;
  if (typeof approvedEnd !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(approvedEnd) ||
      approvedEnd !== periodEndDate) return false;
  return true;
}
