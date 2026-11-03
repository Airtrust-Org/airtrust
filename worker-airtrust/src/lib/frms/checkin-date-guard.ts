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
