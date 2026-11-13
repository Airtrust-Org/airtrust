/**
 * The editor already defaults newly created SCORM courses to FORMATIVE.
 * Keep JSON and multipart clients consistent without changing the legacy
 * SCORED semantics of non-SCORM content or explicit assessed editions.
 * Manager-level callers retain the legacy SCORED fallback because FORMATIVE
 * creation is restricted to administrators. This is only a draft-course
 * default, never evidence of course completion.
 */
export function withNewCourseAssessmentDefault(input: unknown, canConfigureFormative = true): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const row = input as Record<string, unknown>;
  if (row.scorm_assessment_policy !== undefined &&
      row.scorm_assessment_policy !== null &&
      row.scorm_assessment_policy !== '') return input;
  const contentType = row.tipo_conteudo == null || row.tipo_conteudo === ''
    ? 'scorm'
    : row.tipo_conteudo;
  return {
    ...row,
    scorm_assessment_policy: contentType === 'scorm' && canConfigureFormative ? 'FORMATIVE' : 'SCORED',
  };
}
