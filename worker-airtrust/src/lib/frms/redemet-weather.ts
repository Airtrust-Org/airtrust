/**
 * Enriquecimento meteorológico do FRMS por REDEMET/DECEA.
 *
 * Fonte oficial: API-REDEMET `mensagens/metar/{localidades}`.
 * Este módulo é intencionalmente puro quanto a persistência: ele consulta e
 * normaliza METAR/SPECI, mas não escreve D1 nem altera jornada FRMS.
 *
 * Segurança:
 * - a chave da REDEMET deve vir de secret do Worker;
 * - nunca incluir a chave em logs, erros ou payloads persistidos;
 * - METAR é evidência de temperatura ambiente, não WBGT medido.
 */

export const REDEMET_DEFAULT_BASE_URL = 'https://api-redemet.decea.mil.br' as const;

export type MetarSelectionMode = 'LATEST_AT_OR_BEFORE' | 'NEAREST';
export type WeatherEvidenceQuality = 'EXACT_STATION' | 'STALE' | 'UNAVAILABLE';

export interface RedemetMetarRow {
  id_localidade: string;
  validade_inicial: string;
  mens: string;
  recebimento?: string | null;
}

export interface RedemetMetarResponse {
  status: boolean;
  message: unknown;
  data?: {
    current_page?: number;
    data?: RedemetMetarRow[];
    total?: number;
  } | null;
}

export interface ParsedMetarCore {
  metarKind: 'METAR' | 'SPECI' | 'UNKNOWN';
  temperatureC: number | null;
  dewPointC: number | null;
  relativeHumidityPct: number | null;
  windSpeedKt: number | null;
}

export interface WeatherObservationEvidence extends ParsedMetarCore {
  source: 'DECEA_REDEMET';
  sourceKind: 'MEASURED';
  stationIcao: string;
  observedAtUtc: string;
  receivedAtUtc: string | null;
  rawMetar: string;
  eventAtUtc: string;
  ageMinutes: number;
  quality: Exclude<WeatherEvidenceQuality, 'UNAVAILABLE'>;
  selectionMode: MetarSelectionMode;
}

export interface WeatherEvidenceUnavailable {
  source: 'DECEA_REDEMET';
  sourceKind: 'MEASURED';
  stationIcao: string | null;
  eventAtUtc: string | null;
  quality: 'UNAVAILABLE';
  reason:
    | 'ICAO_INVALIDO'
    | 'TIMEZONE_NAO_CONFIGURADO'
    | 'HORARIO_EVENTO_AUSENTE'
    | 'SEM_OBSERVACAO_COMPATIVEL';
}

export type WeatherEvidence = WeatherObservationEvidence | WeatherEvidenceUnavailable;

export interface RedemetClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface RedemetQueryWindow {
  fromUtc: Date;
  toUtc: Date;
}

export interface FlightLegWeatherInput {
  departureIcao: string | null;
  arrivalIcao: string | null;
  dataOperacional: string;
  takeoffLocal: string | null;
  landingLocal: string | null;
  timezoneIana: string | null;
}

export interface FlightLegWeatherResult {
  departure: WeatherEvidence;
  arrival: WeatherEvidence;
}

function normalizeIcao(value: string | null | undefined): string | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return /^[A-Z]{4}$/.test(normalized) ? normalized : null;
}

function parseSignedMetarTemperature(token: string | undefined): number | null {
  if (!token || token === 'XX') return null;
  const match = token.match(/^(M)?(\d{2})$/);
  if (!match) return null;
  const value = Number(match[2]);
  return match[1] ? -value : value;
}

/** Magnus approximation; suitable for deriving RH from METAR T/Td evidence. */
export function calculateRelativeHumidityPct(
  temperatureC: number | null,
  dewPointC: number | null,
): number | null {
  if (temperatureC == null || dewPointC == null) return null;
  const a = 17.625;
  const b = 243.04;
  const saturationAtDewPoint = Math.exp((a * dewPointC) / (b + dewPointC));
  const saturationAtTemperature = Math.exp((a * temperatureC) / (b + temperatureC));
  const rh = 100 * (saturationAtDewPoint / saturationAtTemperature);
  return Math.round(Math.max(0, Math.min(100, rh)) * 10) / 10;
}

export function parseMetarCore(rawMetar: string): ParsedMetarCore {
  const text = String(rawMetar || '').trim().toUpperCase();
  const temperatureGroup = text.match(/\s(M?\d{2})\/(M?\d{2}|XX)(?=\s|=)/);
  const temperatureC = parseSignedMetarTemperature(temperatureGroup?.[1]);
  const dewPointC = parseSignedMetarTemperature(temperatureGroup?.[2]);
  const wind = text.match(/\s(?:\d{3}|VRB)(\d{2,3})(?:G\d{2,3})?KT(?=\s|$)/);

  return {
    metarKind: text.startsWith('SPECI ')
      ? 'SPECI'
      : text.startsWith('METAR ')
        ? 'METAR'
        : 'UNKNOWN',
    temperatureC,
    dewPointC,
    relativeHumidityPct: calculateRelativeHumidityPct(temperatureC, dewPointC),
    windSpeedKt: wind ? Number(wind[1]) : null,
  };
}

function redemetTimestampToIsoUtc(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized.replace(' ', 'T')}Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function dateTimePartsInZone(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (['year', 'month', 'day', 'hour', 'minute', 'second'].includes(part.type)) {
      values[part.type] = Number(part.value);
    }
  }
  return values;
}

/**
 * Converte data/hora local explicitamente associada a timezone IANA para UTC.
 * Não existe fallback de timezone: ausência deve produzir dado indisponível.
 */
export function localDateTimeToUtcIso(
  dateYmd: string,
  timeHm: string,
  timeZone: string,
): string | null {
  const dateMatch = dateYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeHm.match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch || !timeZone) return null;

  const desired = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: 0,
  };
  if (desired.hour > 23 || desired.minute > 59) return null;

  let guessMs = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    0,
  );

  try {
    for (let i = 0; i < 4; i += 1) {
      const displayed = dateTimePartsInZone(new Date(guessMs), timeZone);
      const displayedAsUtc = Date.UTC(
        displayed.year,
        displayed.month - 1,
        displayed.day,
        displayed.hour,
        displayed.minute,
        displayed.second,
      );
      const desiredAsUtc = Date.UTC(
        desired.year,
        desired.month - 1,
        desired.day,
        desired.hour,
        desired.minute,
        desired.second,
      );
      const delta = desiredAsUtc - displayedAsUtc;
      if (delta === 0) break;
      guessMs += delta;
    }

    const verified = dateTimePartsInZone(new Date(guessMs), timeZone);
    if (
      verified.year !== desired.year ||
      verified.month !== desired.month ||
      verified.day !== desired.day ||
      verified.hour !== desired.hour ||
      verified.minute !== desired.minute
    ) {
      return null;
    }
    return new Date(guessMs).toISOString();
  } catch {
    return null;
  }
}

function formatRedemetHourUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  return `${y}${m}${d}${h}`;
}

function hhmmToMinutes(value: string | null | undefined): number | null {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function addDaysYmd(dateYmd: string, days: number): string | null {
  const match = dateYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildRedemetQueryWindow(
  eventTimesUtc: Date[],
  beforeMinutes = 120,
  afterMinutes = 60,
): RedemetQueryWindow | null {
  const valid = eventTimesUtc.filter((date) => Number.isFinite(date.getTime()));
  if (valid.length === 0) return null;
  const min = Math.min(...valid.map((date) => date.getTime()));
  const max = Math.max(...valid.map((date) => date.getTime()));
  return {
    fromUtc: new Date(min - beforeMinutes * 60_000),
    toUtc: new Date(max + afterMinutes * 60_000),
  };
}

function getMetarRows(payload: unknown): RedemetMetarRow[] {
  if (!payload || typeof payload !== 'object') return [];
  const response = payload as RedemetMetarResponse;
  if (response.status !== true) return [];
  const rows = response.data?.data;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is RedemetMetarRow => {
    return Boolean(
      row &&
        typeof row.id_localidade === 'string' &&
        typeof row.validade_inicial === 'string' &&
        typeof row.mens === 'string',
    );
  });
}

export function selectMetarObservation(
  rows: RedemetMetarRow[],
  stationIcao: string,
  eventAtUtc: Date,
  options?: {
    mode?: MetarSelectionMode;
    maxAgeMinutes?: number;
  },
): WeatherObservationEvidence | null {
  const icao = normalizeIcao(stationIcao);
  if (!icao || !Number.isFinite(eventAtUtc.getTime())) return null;

  const mode = options?.mode ?? 'LATEST_AT_OR_BEFORE';
  const maxAgeMinutes = Math.max(0, options?.maxAgeMinutes ?? 120);
  const candidates = rows
    .filter((row) => normalizeIcao(row.id_localidade) === icao)
    .map((row) => ({ row, observedAt: redemetTimestampToIsoUtc(row.validade_inicial) }))
    .filter(
      (item): item is { row: RedemetMetarRow; observedAt: string } => item.observedAt !== null,
    )
    .map((item) => ({ ...item, observedMs: new Date(item.observedAt).getTime() }));

  let selected:
    | { row: RedemetMetarRow; observedAt: string; observedMs: number }
    | undefined;

  if (mode === 'LATEST_AT_OR_BEFORE') {
    selected = candidates
      .filter((item) => item.observedMs <= eventAtUtc.getTime())
      .sort((a, b) => b.observedMs - a.observedMs)[0];
  } else {
    selected = candidates.sort(
      (a, b) =>
        Math.abs(a.observedMs - eventAtUtc.getTime()) -
        Math.abs(b.observedMs - eventAtUtc.getTime()),
    )[0];
  }

  if (!selected) return null;
  const ageMinutes = Math.abs(eventAtUtc.getTime() - selected.observedMs) / 60_000;
  if (ageMinutes > maxAgeMinutes) return null;

  const parsed = parseMetarCore(selected.row.mens);
  return {
    ...parsed,
    source: 'DECEA_REDEMET',
    sourceKind: 'MEASURED',
    stationIcao: icao,
    observedAtUtc: selected.observedAt,
    receivedAtUtc: redemetTimestampToIsoUtc(selected.row.recebimento),
    rawMetar: selected.row.mens,
    eventAtUtc: eventAtUtc.toISOString(),
    ageMinutes: Math.round(ageMinutes * 10) / 10,
    quality: ageMinutes <= 90 ? 'EXACT_STATION' : 'STALE',
    selectionMode: mode,
  };
}

export class RedemetClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RedemetClientOptions) {
    if (!options.apiKey?.trim()) throw new Error('REDEMET_API_KEY não configurada.');
    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl || REDEMET_DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchMetarRows(
    stationIcaos: string[],
    window: RedemetQueryWindow,
  ): Promise<RedemetMetarRow[]> {
    const locations = [...new Set(stationIcaos.map(normalizeIcao).filter(Boolean))] as string[];
    if (locations.length === 0) return [];

    const params = new URLSearchParams({
      api_key: this.apiKey,
      data_ini: formatRedemetHourUtc(window.fromUtc),
      data_fim: formatRedemetHourUtc(window.toUtc),
      page_tam: '150',
    });
    const url = `${this.baseUrl}/mensagens/metar/${locations.join(',')}?${params.toString()}`;

    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Falha REDEMET HTTP ${response.status}.`);
    }
    const payload = (await response.json()) as unknown;
    return getMetarRows(payload);
  }
}

function unavailable(
  stationIcao: string | null,
  eventAtUtc: string | null,
  reason: WeatherEvidenceUnavailable['reason'],
): WeatherEvidenceUnavailable {
  return {
    source: 'DECEA_REDEMET',
    sourceKind: 'MEASURED',
    stationIcao,
    eventAtUtc,
    quality: 'UNAVAILABLE',
    reason,
  };
}

/**
 * Enriquece origem e destino de uma etapa usando somente estação exata.
 * Não inventa proxy para helideck/plataforma sem fonte meteorológica própria.
 */
export async function enrichFlightLegWeatherFromRedemet(
  client: RedemetClient,
  input: FlightLegWeatherInput,
  options?: {
    selectionMode?: MetarSelectionMode;
    maxAgeMinutes?: number;
  },
): Promise<FlightLegWeatherResult> {
  const departureIcao = normalizeIcao(input.departureIcao);
  const arrivalIcao = normalizeIcao(input.arrivalIcao);

  if (!input.timezoneIana) {
    return {
      departure: unavailable(departureIcao, null, 'TIMEZONE_NAO_CONFIGURADO'),
      arrival: unavailable(arrivalIcao, null, 'TIMEZONE_NAO_CONFIGURADO'),
    };
  }

  const takeoffUtcIso = input.takeoffLocal
    ? localDateTimeToUtcIso(input.dataOperacional, input.takeoffLocal, input.timezoneIana)
    : null;
  const takeoffLocalMin = hhmmToMinutes(input.takeoffLocal);
  const landingLocalMin = hhmmToMinutes(input.landingLocal);
  const landingDate =
    takeoffLocalMin != null && landingLocalMin != null && landingLocalMin < takeoffLocalMin
      ? addDaysYmd(input.dataOperacional, 1)
      : input.dataOperacional;
  const landingUtcIso = input.landingLocal && landingDate
    ? localDateTimeToUtcIso(landingDate, input.landingLocal, input.timezoneIana)
    : null;

  const departureBase = !departureIcao
    ? unavailable(null, takeoffUtcIso, 'ICAO_INVALIDO')
    : !takeoffUtcIso
      ? unavailable(departureIcao, null, 'HORARIO_EVENTO_AUSENTE')
      : null;
  const arrivalBase = !arrivalIcao
    ? unavailable(null, landingUtcIso, 'ICAO_INVALIDO')
    : !landingUtcIso
      ? unavailable(arrivalIcao, null, 'HORARIO_EVENTO_AUSENTE')
      : null;

  const eventDates = [takeoffUtcIso, landingUtcIso]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value));
  const window = buildRedemetQueryWindow(eventDates);
  const stations = [departureIcao, arrivalIcao].filter((value): value is string => Boolean(value));

  if (!window || stations.length === 0) {
    return {
      departure:
        departureBase ?? unavailable(departureIcao, takeoffUtcIso, 'SEM_OBSERVACAO_COMPATIVEL'),
      arrival: arrivalBase ?? unavailable(arrivalIcao, landingUtcIso, 'SEM_OBSERVACAO_COMPATIVEL'),
    };
  }

  const rows = await client.fetchMetarRows(stations, window);
  const selectionMode = options?.selectionMode ?? 'LATEST_AT_OR_BEFORE';
  const maxAgeMinutes = options?.maxAgeMinutes ?? 120;

  const departure =
    departureBase ??
    selectMetarObservation(rows, departureIcao!, new Date(takeoffUtcIso!), {
      mode: selectionMode,
      maxAgeMinutes,
    }) ??
    unavailable(departureIcao, takeoffUtcIso, 'SEM_OBSERVACAO_COMPATIVEL');

  const arrival =
    arrivalBase ??
    selectMetarObservation(rows, arrivalIcao!, new Date(landingUtcIso!), {
      mode: selectionMode,
      maxAgeMinutes,
    }) ??
    unavailable(arrivalIcao, landingUtcIso, 'SEM_OBSERVACAO_COMPATIVEL');

  return { departure, arrival };
}
