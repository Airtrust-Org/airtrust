/**
 * Administrative choice for NEW SCORM editions.
 *
 * The persisted values are the existing server policies, not a new
 * authorization primitive. The active package manifest and server-pinned
 * cycle/edition policy remain authoritative for certification. SCORED also
 * exists in legacy internal-quiz editions and must not be silently converted.
 */
export const DEFAULT_NEW_SCORM_COMPLETION_POLICY = 'FORMATIVE' as const;
export const SCORM_COMPLETION_MODE_CHOICES = [
  { value: 'FORMATIVE', label: 'Formativo — sem avaliação final' },
  { value: 'SCORED', label: 'Com avaliação' },
] as const;

/** A new exam-required edition cannot be published by merely selecting SCORED:
 * that legacy value still represents internal SCORM grades on existing courses.
 * Until the independent exam policy is persisted/versioned in the Worker,
 * keep the future option visible but not selectable on new/formative courses.
 */
export function canUseLegacyEvaluatedPolicy(
  requested: 'SCORED' | 'FORMATIVE' | null | undefined,
  persisted: 'SCORED' | 'FORMATIVE' | null | undefined,
): boolean {
  return requested !== 'SCORED' || persisted === 'SCORED';
}
