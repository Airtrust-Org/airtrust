export const TRAINING_COMPLIANCE_ENROLLMENT_RENEWAL_WINDOW_DAYS = 60;

export function trainingComplianceNeedsEnrollment(
  status: string,
  daysToExpire: number | null,
): boolean {
  if (['NAO_REALIZADO', 'VENCIDO', 'VENCENDO'].includes(status)) return true;
  return status === 'CONFORME' && daysToExpire !== null && daysToExpire <= TRAINING_COMPLIANCE_ENROLLMENT_RENEWAL_WINDOW_DAYS;
}

/**
 * Saving an obligatory rule enrolls only employees with no completed
 * training evidence or with expired training. An approaching expiry is not
 * enough to reset or duplicate an LMS cycle.
 */
export function trainingComplianceNeedsImmediateEnrollmentOnRuleSave(status: string): boolean {
  return status === 'NAO_REALIZADO' || status === 'VENCIDO';
}

export function trainingComplianceEvidenceIsRealizedBy(
  realizedAt: string | null | undefined,
  today: string,
): boolean {
  return Boolean(realizedAt) && String(realizedAt).slice(0, 10) <= today;
}
