/** Validates chronological sync markers; historical rechecks cannot rewind progress. */
export function shouldAdvanceSigvoosSyncProgress(
  currentTo: string | null | undefined,
  candidateTo: string,
): boolean {
  const valid = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!valid(candidateTo) || (currentTo && !valid(currentTo))) {
    throw new Error('SIGVOOS_INVALID_PROGRESS_DATE');
  }
  return !currentTo || candidateTo >= currentTo;
}
