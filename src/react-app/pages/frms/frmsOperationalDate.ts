export function localTodayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function isFrmsOperationalDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function resolveFrmsOperationalDate(
  requestedDate: string | null | undefined,
  now = new Date(),
): string {
  return isFrmsOperationalDate(requestedDate) ? requestedDate : localTodayIso(now);
}

export function resolveCalendarFortnightRange(date: string): { inicio: string; fim: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('FRMS_INVALID_OPERATIONAL_DATE');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthText = String(month).padStart(2, '0');
  if (day <= 15) return { inicio: `${year}-${monthText}-01`, fim: `${year}-${monthText}-15` };
  const lastDay = new Date(year, month, 0).getDate();
  return {
    inicio: `${year}-${monthText}-16`,
    fim: `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`,
  };
}
