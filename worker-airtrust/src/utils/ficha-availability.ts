export const FICHA_NOT_AVAILABLE_YET = 'FICHA_NOT_AVAILABLE_YET';
export const SIMULADORES_OPERATIONAL_TIMEZONE = 'America/Sao_Paulo';

export interface FichaAvailabilityInput {
  data_sessao?: string | null;
  hora_inicio?: string | null;
  now?: Date;
}

export interface FichaAvailabilityResult {
  available: boolean;
  code?: typeof FICHA_NOT_AVAILABLE_YET;
  message?: string;
  sessionStartsAt?: string | null;
  timezone: typeof SIMULADORES_OPERATIONAL_TIMEZONE;
}

function extractIsoDateOnly(value?: string | null): string | null {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function normalizeHourMinute(value?: string | null): string {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!match) return '00:00';

  const hour = Math.min(Math.max(Number(match[1]), 0), 23);
  const minute = Math.min(Math.max(Number(match[2] || 0), 0), 59);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function saoPauloNowKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SIMULADORES_OPERATIONAL_TIMEZONE,
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

export function getFichaAvailability(input: FichaAvailabilityInput): FichaAvailabilityResult {
  const date = extractIsoDateOnly(input.data_sessao);
  if (!date) {
    return {
      available: true,
      sessionStartsAt: null,
      timezone: SIMULADORES_OPERATIONAL_TIMEZONE,
    };
  }

  const sessionStartsAt = `${date} ${normalizeHourMinute(input.hora_inicio)}`;
  const isFuture = saoPauloNowKey(input.now) < sessionStartsAt;

  if (!isFuture) {
    return {
      available: true,
      sessionStartsAt,
      timezone: SIMULADORES_OPERATIONAL_TIMEZONE,
    };
  }

  return {
    available: false,
    code: FICHA_NOT_AVAILABLE_YET,
    message: 'Ficha disponível no dia da sessão',
    sessionStartsAt,
    timezone: SIMULADORES_OPERATIONAL_TIMEZONE,
  };
}

export async function getFichaAvailabilityFromDb(
  db: D1Database,
  fichaId: string | number,
): Promise<FichaAvailabilityResult> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(sa.data, fs.data_sessao) as data_sessao,
         sa.hora_inicio as hora_inicio
       FROM fichas_sessao fs
       LEFT JOIN simulador_agendamentos sa
         ON fs.agendamento_slot_id = sa.id
        AND sa.deleted_at IS NULL
       WHERE fs.id = ?
         AND fs.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(fichaId)
    .first<{ data_sessao?: string | null; hora_inicio?: string | null }>();

  return getFichaAvailability({
    data_sessao: row?.data_sessao,
    hora_inicio: row?.hora_inicio,
  });
}
