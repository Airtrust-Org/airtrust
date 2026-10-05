export const TRAINING_COMPLIANCE_ENROLLMENT_RENEWAL_WINDOW_DAYS = 60;

export function trainingComplianceNeedsEnrollment(
  status: string,
  daysToExpire: number | null,
): boolean {
  if (['NAO_REALIZADO', 'VENCIDO', 'VENCENDO'].includes(status)) return true;
  return status === 'CONFORME' && daysToExpire !== null && daysToExpire <= TRAINING_COMPLIANCE_ENROLLMENT_RENEWAL_WINDOW_DAYS;
}

export function trainingComplianceEvidenceIsRealizedBy(
  realizedAt: string | null | undefined,
  today: string,
): boolean {
  return Boolean(realizedAt) && String(realizedAt).slice(0, 10) <= today;
}
