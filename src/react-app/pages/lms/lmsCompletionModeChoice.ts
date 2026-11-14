/**
 * Administrative choice for NEW SCORM editions.
 *
 * The persisted values are the existing server policies, not a new
 * authorization primitive. The active package manifest and server-pinned
 * cycle/edition policy remain authoritative for certification. SCORED also
 * exists in legacy internal-quiz editions and must not be silently converted.
 */
export const DEFAULT_NEW_SCORM_COMPLETION_POLICY = 'FORMATIVE' as const;

/** Formative course creation is restricted to admins; do not force manager requests to fail with 403. */
export function defaultNewScormModeForRole(isAdmin: boolean): 'SCORED' | 'FORMATIVE' {
  return isAdmin ? DEFAULT_NEW_SCORM_COMPLETION_POLICY : 'SCORED';
}

/**
 * New SCORM course creation must be possible for managers authorized by the
 * API. Only administrators can create a formative course. Existing editions
 * retain the guard against policy reclassification through metadata updates.
 */
export function canSaveScormModeForRole(
  requested: 'SCORED' | 'FORMATIVE' | null | undefined,
  persisted: 'SCORED' | 'FORMATIVE' | null | undefined,
  isAdmin: boolean,
  isEditing: boolean,
): boolean {
  if (!isEditing && !isAdmin && requested === 'SCORED') return true;
  return canUseLegacyEvaluatedPolicy(requested, persisted);
}

export const SCORM_COMPLETION_MODE_CHOICES = [
  { value: 'FORMATIVE', label: 'Formativo — sem avaliação final' },
  { value: 'SCORED', label: 'Com avaliação' },
] as const;

/** A new exam-required edition cannot be published by merely selecting SCORED:
 * that legacy value still represents internal SCORM grades on existing courses.
 * Until the independent exam policy is persisted/versioned in the Worker,
 * keep the future option visible but not selectable on new/formative courses.
 * Converting a published SCORED edition to FORMATIVE also requires a certified
 * package/edition activation; metadata editing must never downgrade its gate.
 */
export function canUseLegacyEvaluatedPolicy(
  requested: 'SCORED' | 'FORMATIVE' | null | undefined,
  persisted: 'SCORED' | 'FORMATIVE' | null | undefined,
): boolean {
  if (persisted === 'SCORED') return requested === 'SCORED';
  return requested !== 'SCORED';
}
