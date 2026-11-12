/**
 * Keeps the mutating enrollment phase separate from its optional read-only
 * diagnostic phase. A diagnostic failure after a committed LMS enrollment
 * cannot be represented as an enrollment failure (and trigger an unsafe retry).
 */
export async function runDesignationEnrollmentWithDiagnostics<T>(
  enroll: () => Promise<T>,
  inspect: () => Promise<'NO_EAD_POLICY' | 'UNMAPPED_MANDATORY_QUALIFICATION' | null>,
  reportFailure: (phase: 'enrollment' | 'diagnostic', error: unknown) => void,
): Promise<{
  autoEnrollment: T | null;
  autoEnrollmentWarning:
    | 'AUTO_ENROLLMENT_DEFERRED'
    | 'ENROLLMENT_DIAGNOSTIC_UNAVAILABLE'
    | 'NO_EAD_POLICY'
    | 'UNMAPPED_MANDATORY_QUALIFICATION'
    | null;
}> {
  let autoEnrollment: T;
  try {
    autoEnrollment = await enroll();
  } catch (error) {
    reportFailure('enrollment', error);
    return { autoEnrollment: null, autoEnrollmentWarning: 'AUTO_ENROLLMENT_DEFERRED' };
  }

  try {
    const gap = await inspect();
    return { autoEnrollment, autoEnrollmentWarning: gap };
  } catch (error) {
    reportFailure('diagnostic', error);
    return { autoEnrollment, autoEnrollmentWarning: 'ENROLLMENT_DIAGNOSTIC_UNAVAILABLE' };
  }
}
