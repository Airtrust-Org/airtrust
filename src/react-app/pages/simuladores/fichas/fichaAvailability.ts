import { getSystemTimeZone } from '@/react-app/utils/timezone';

// Resolvido em runtime para usar o timezone configurado pela empresa.
// Fallback: 'UTC' (definido em getSystemTimeZone — nunca hardcoded).
const OPERATIONAL_TIMEZONE = getSystemTimeZone();

interface FichaAvailabilityInput {
  dataHora?: string | null;
  dataSessao?: string | null;
  horaInicio?: string | null;
}

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

function resolveSessionDateTime(input: FichaAvailabilityInput): string | null {
  const date = extractIsoDateOnly(input.dataSessao) || extractIsoDateOnly(input.dataHora);
  if (!date) return null;

  const timeSource = input.horaInicio || input.dataHora;
  return `${date} ${extractHourMinute(timeSource)}`;
}

export function isFichaAvailableForEvaluation(
  input: FichaAvailabilityInput | string | null | undefined,
  now = new Date(),
): boolean {
  const normalizedInput =
    typeof input === 'string' || input == null ? { dataHora: input } : input;
  const sessionKey = resolveSessionDateTime(normalizedInput);
  if (!sessionKey) return true;

  return getOperationalNowKey(now) >= sessionKey;
}

export function isFichaFutureEvaluation(
  input: FichaAvailabilityInput | string | null | undefined,
  now = new Date(),
): boolean {
  return !isFichaAvailableForEvaluation(input, now);
}
