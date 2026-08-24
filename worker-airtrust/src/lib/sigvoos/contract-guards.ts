export const SIGVOOS_OPERATIONAL_SEARCH_ENDPOINT = '/relatorios/voos/tripulantes/etapas/pesquisa';
export const SIGVOOS_MAX_SEARCH_WINDOW_DAYS = 90;

export interface SigvoosApplicationError {
  code: 'SIGVOOS_PERMISSION_DENIED' | 'SIGVOOS_APPLICATION_ERROR';
  message: string;
}

export interface SigvoosEtapasSearchRequest extends Record<string, unknown> {
  date_start: string;
  date_finish: string;
  staff_ids?: number[];
}

function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('SIGVOOS_INVALID_ISO_DATE');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('SIGVOOS_INVALID_ISO_DATE');
  }
  return date;
}

export function formatSigvoosBrDate(value: string): string {
  const date = parseIsoDate(value);
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

export function countInclusiveDays(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (from > to) throw new Error('SIGVOOS_INVALID_DATE_RANGE');
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

/** Builds only the documented vendor body. Pagination fields are intentionally absent. */
export function buildSigvoosEtapasSearchRequest(input: {
  from: string;
  to: string;
  staffIds?: number[];
}): SigvoosEtapasSearchRequest {
  if (countInclusiveDays(input.from, input.to) > SIGVOOS_MAX_SEARCH_WINDOW_DAYS) {
    throw new Error('SIGVOOS_SEARCH_WINDOW_EXCEEDS_90_DAYS');
  }
  const request: SigvoosEtapasSearchRequest = {
    date_start: formatSigvoosBrDate(input.from),
    date_finish: formatSigvoosBrDate(input.to),
  };
  if (input.staffIds?.length) {
    if (!input.staffIds.every((id) => Number.isInteger(id) && id > 0)) {
      throw new Error('SIGVOOS_INVALID_STAFF_IDS');
    }
    request.staff_ids = [...input.staffIds];
  }
  return request;
}

function sanitizeUpstreamMessage(value: string): string {
  return value
    .replace(/(token|senha|password|secret|credential|authorization)\s*[:=]\s*[^,;\s]+/gi, '$1=[MASKED]')
    .slice(0, 240);
}

/** HTTP 200 vendor business failures must never be interpreted as an empty page. */
export function detectSigvoosApplicationError(payload: Record<string, unknown>): SigvoosApplicationError | null {
  if (payload.permission_denied === 1 || payload.permission_denied === true) {
    return { code: 'SIGVOOS_PERMISSION_DENIED', message: 'SIGVOOS negou permissão para a consulta.' };
  }
  const status = typeof payload.status === 'string' ? payload.status.trim().toLowerCase() : '';
  if (status === 'error' || status === 'failed' || status === 'failure') {
    const raw = typeof payload.message === 'string' ? payload.message.trim() : '';
    return { code: 'SIGVOOS_APPLICATION_ERROR', message: raw ? sanitizeUpstreamMessage(raw) : 'SIGVOOS retornou erro de aplicação.' };
  }
  return null;
}

export function classifySigvoosHttpStatus(status: number):
  | 'SIGVOOS_UNAUTHORIZED'
  | 'SIGVOOS_UPSTREAM_UNAVAILABLE'
  | 'SIGVOOS_SERVER_ERROR'
  | 'SIGVOOS_HTTP_ERROR' {
  if (status === 401) return 'SIGVOOS_UNAUTHORIZED';
  if (status === 502 || status === 503 || status === 504) return 'SIGVOOS_UPSTREAM_UNAVAILABLE';
  if (status >= 500) return 'SIGVOOS_SERVER_ERROR';
  return 'SIGVOOS_HTTP_ERROR';
}
