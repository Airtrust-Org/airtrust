/** A future or nonexistent day cannot be presented as a completed crew declaration. */
export function isValidPastOrTodayCheckinDate(
  referenceDate: string,
  operationalToday: string,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || referenceDate > operationalToday) {
    return false;
  }
  const parsed = new Date(`${referenceDate}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === referenceDate;
}

export const LATE_CREW_CHECKIN_REASONS = ['SYSTEM_UNAVAILABLE', 'OPERATIONAL_DELAY', 'OTHER'] as const;
export type LateCrewCheckinReason = (typeof LATE_CREW_CHECKIN_REASONS)[number];
export type CrewCheckinDateDecision =
  | { valid: true; retrospective: false; reason: null }
  | { valid: true; retrospective: true; reason: LateCrewCheckinReason }
  | { valid: false; error: 'invalid_reference_date' | 'historical_checkin_out_of_window' | 'late_submission_reason_required' };

/** Crew records from D-1 require a categorical justification, not an invented preflight assessment. */
export function evaluateCrewCheckinDate(
  referenceDate: string,
  operationalToday: string,
  lateReason?: LateCrewCheckinReason,
): CrewCheckinDateDecision {
  if (!isValidPastOrTodayCheckinDate(referenceDate, operationalToday) ||
      !isValidPastOrTodayCheckinDate(operationalToday, operationalToday)) {
    return { valid: false, error: 'invalid_reference_date' };
  }
  if (referenceDate === operationalToday) return { valid: true, retrospective: false, reason: null };
  const yesterday = new Date(`${operationalToday}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (referenceDate !== yesterday.toISOString().slice(0, 10)) {
    return { valid: false, error: 'historical_checkin_out_of_window' };
  }
  if (!lateReason || !LATE_CREW_CHECKIN_REASONS.includes(lateReason)) {
    return { valid: false, error: 'late_submission_reason_required' };
  }
  return { valid: true, retrospective: true, reason: lateReason };
}
