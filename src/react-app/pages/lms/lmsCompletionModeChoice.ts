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
