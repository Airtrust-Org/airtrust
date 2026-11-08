/**
 * Mirrors the Worker's pre-presentation guard for a timely UI warning.
 * The Worker remains authoritative: client time can be skewed or tampered with.
 * Missing/invalid times fail closed instead of granting preflight status.
 */
export function isAtOrAfterFrmsPresentationBrasilia(
  instant: Date,
  presentationTime: string | null | undefined,
): boolean {
  if (!Number.isFinite(instant.getTime()) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(presentationTime ?? '')) return true;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return true;
  const [scheduledHour, scheduledMinute] = presentationTime!.split(':').map(Number);
  return hour * 60 + minute >= scheduledHour * 60 + scheduledMinute;
}

/** Operational day at the flight base: independent of UTC and viewer's timezone. */
export function frmsBrazilOperationalTodayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const date = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${date.year}-${date.month}-${date.day}`;
}

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
