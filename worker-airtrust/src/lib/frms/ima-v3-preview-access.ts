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
