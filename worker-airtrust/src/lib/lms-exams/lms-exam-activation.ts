/**
 * Explicit activation contract for the independent LMS exam module.
 *
 * Staging keeps its existing review flags. Production requires two independent
 * attestations: the exact schema-specific flag for the surface, and an explicit
 * tenant allowlist. An absent/invalid value always fails closed. Importantly,
 * neither flag changes the assessment policy of any existing course or cycle.
 */
export const PRODUCTION_EXAM_SCHEMA_FLAG = 'REVIEWED_SCHEMA_V2_0571_0572' as const;

export type ExamSurface = 'admin' | 'learner';
type ExamEnvironment = Readonly<Record<string, unknown>>;

export function isLmsExamSurfaceEnabled(
  rawEnvironment: unknown, surface: ExamSurface, empresaId: number,
): boolean {
  if (!rawEnvironment || typeof rawEnvironment !== 'object') return false;
  const env = rawEnvironment as ExamEnvironment;
  if (!Number.isSafeInteger(empresaId) || empresaId < 1) return false;
  if (env.ENVIRONMENT === 'staging') {
    const flag = surface === 'admin'
      ? env.LMS_EXAM_QUESTION_ADMIN_STAGING
      : env.LMS_EXAM_LEARNER_STAGING;
    return flag === 'REVIEWED_SCHEMA_ONLY';
  }
  if (env.ENVIRONMENT !== 'production') return false;
  const tenantList = env.LMS_EXAM_PRODUCTION_TENANTS;
  // Empty, wildcard, duplicates, whitespace, or malformed numbers are invalid.
  if (typeof tenantList !== 'string' ||
      !/^[1-9][0-9]*(?:,[1-9][0-9]*)*$/.test(tenantList)) return false;
  const tenants = tenantList.split(',').map(Number);
  if (tenants.some(id => !Number.isSafeInteger(id)) ||
      new Set(tenants).size !== tenants.length || !tenants.includes(empresaId)) return false;
  const flag = surface === 'admin'
    ? env.LMS_EXAM_QUESTION_ADMIN_PRODUCTION
    : env.LMS_EXAM_LEARNER_PRODUCTION;
  return flag === PRODUCTION_EXAM_SCHEMA_FLAG;
}

/** Prevent an accidental activation against an unmigrated production D1. */
export async function hasLmsExamSchema(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare(
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN (" +
      "'lms_exam_question_revisions','lms_exam_question_audit','lms_exam_plans'," +
      "'lms_exam_edition_bindings','lms_exam_attempts','lms_exam_attempt_responses')"
    ).first<{ total: number }>();
    return row?.total === 6;
  } catch {
    return false;
  }
}
