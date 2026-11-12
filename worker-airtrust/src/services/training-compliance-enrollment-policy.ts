export const TRAINING_COMPLIANCE_ENROLLMENT_RENEWAL_WINDOW_DAYS = 30;

export function trainingComplianceNeedsEnrollment(
  status: string,
  daysToExpire: number | null,
): boolean {
  if (['NAO_REALIZADO', 'VENCIDO'].includes(status)) return true;
  return ['VENCENDO','CONFORME'].includes(status) &&
    daysToExpire !== null && daysToExpire <= TRAINING_COMPLIANCE_ENROLLMENT_RENEWAL_WINDOW_DAYS;
}

/**
 * Saving an obligatory rule enrolls only employees with no completed
 * training evidence or with expired training. An approaching expiry is not
 * enough to reset or duplicate an LMS cycle.
 */
export function trainingComplianceNeedsImmediateEnrollmentOnRuleSave(status: string): boolean {
  return status === 'NAO_REALIZADO' || status === 'VENCIDO';
}

/**
 * Read the calendar day without accepting malformed legacy evidence.
 * D1 uses YYYY-MM-DD, SQLite timestamps and ISO timestamps. Never allow
 * a lexical comparison to turn '31/05/2026' or '2026-02-30' into completion.
 */
export function trainingComplianceIsoDay(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2}):?(\d{2}))?)?$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${match[1]}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) return null;
  if (match[2] !== undefined && (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59)) return null;
  if (match[5] !== undefined && (Number(match[5]) > 23 || Number(match[6]) > 59)) return null;
  return match[1];
}

export function trainingComplianceEvidenceIsRealizedBy(
  realizedAt: string | null | undefined,
  today: string,
): boolean {
  const realizedDay = trainingComplianceIsoDay(realizedAt);
  const cutoffDay = trainingComplianceIsoDay(today);
  return realizedDay !== null && cutoffDay !== null && realizedDay <= cutoffDay;
}

/**
 * Tenant 6: an explicit LMS EAD opt-in may coexist with an unspecified
 * *evidence* modality. Do not force modalidade_requerida='EAD': that would
 * invalidate valid historical training records with legacy null formats.
 * Every caller must still prove exactly one published linked EAD course.
 * Other tenants retain the strict explicit EAD modality requirement.
 */
export function complianceAllowsEadEnrollment(
  autoOptIn: number | null | undefined,
  requiredModality: string | null | undefined,
  empresaId: number,
): boolean {
  if (Number(autoOptIn) !== 1) return false;
  return requiredModality === 'EAD' || (empresaId === 6 && requiredModality == null);
}
