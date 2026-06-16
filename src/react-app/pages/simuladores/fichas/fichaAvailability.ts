const OPERATIONAL_TIMEZONE = 'America/Sao_Paulo';

function extractIsoDateOnly(value?: string | null): string | null {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function extractHourMinute(value?: string | null): string {
  const raw = String(value || '').trim();
  const timeMatch = raw.match(/(?:T|\s)(\d{1,2}):(\d{2})/) || raw.match(/^(\d{1,2}):(\d{2})/);
  if (!timeMatch) return '00:00';

  const hour = Math.min(Math.max(Number(timeMatch[1]), 0), 23);
  const minute = Math.min(Math.max(Number(timeMatch[2]), 0), 59);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getOperationalNowKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPERATIONAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export function isFichaAvailableForEvaluation(dataHora?: string | null, now = new Date()): boolean {
  const date = extractIsoDateOnly(dataHora);
  if (!date) return true;

  const sessionKey = `${date} ${extractHourMinute(dataHora)}`;
  return getOperationalNowKey(now) >= sessionKey;
}

export function isFichaFutureEvaluation(dataHora?: string | null, now = new Date()): boolean {
  return !isFichaAvailableForEvaluation(dataHora, now);
}
