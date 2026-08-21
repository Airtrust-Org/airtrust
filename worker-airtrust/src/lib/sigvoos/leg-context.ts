/**
 * Extração aditiva de granularidade de etapa do payload SIGVOOS.
 *
 * Mantém `null` quando um campo não está presente. Não inventa destino,
 * horário ou contagem e não converte horário local para UTC sem timezone
 * explicitamente configurado fora deste módulo.
 */

export interface SigvoosLegOperationalContext {
  staffIdSigvoos: string | null;
  flightReportId: string | null;
  legNumber: number | null;
  departureIcao: string | null;
  arrivalIcao: string | null;
  engineStartTime: string | null;
  takeoffTime: string | null;
  landingTime: string | null;
  engineShutoffTime: string | null;
  dayLandings: number | null;
  nightLandings: number | null;
  starts: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function normalizeString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeIcao(value: unknown): string | null {
  const text = normalizeString(value)?.toUpperCase() ?? null;
  return text && /^[A-Z0-9]{4}$/.test(text) ? text : null;
}

function normalizeTime(value: unknown): string | null {
  const text = normalizeString(value);
  if (!text) return null;
  const match = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:\s|$)/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function normalizeIdentifier(value: unknown): string | null {
  const text = normalizeString(value);
  return text ? text : null;
}

export function extractSigvoosLegOperationalContext(
  raw: Record<string, unknown>,
): SigvoosLegOperationalContext {
  const staff = asRecord(raw.staff);
  const flightReport = asRecord(raw.flight_report);
  const leg = asRecord(raw.flight_report_leg);
  const departure = asRecord(leg?.departure_location);
  const arrival = asRecord(leg?.arrival_location);

  return {
    staffIdSigvoos: normalizeIdentifier(staff?.id),
    flightReportId: normalizeIdentifier(flightReport?.id),
    legNumber: normalizeInteger(leg?.number),
    departureIcao: normalizeIcao(departure?.icao_code),
    arrivalIcao: normalizeIcao(arrival?.icao_code),
    engineStartTime: normalizeTime(leg?.engine_start_time_str),
    takeoffTime: normalizeTime(leg?.takeoff_time_str),
    landingTime: normalizeTime(leg?.landing_time_str),
    engineShutoffTime: normalizeTime(leg?.engine_shutoff_time_str),
    dayLandings: normalizeInteger(leg?.day_landings),
    nightLandings: normalizeInteger(leg?.night_landings),
    starts: normalizeInteger(leg?.starts),
  };
}
