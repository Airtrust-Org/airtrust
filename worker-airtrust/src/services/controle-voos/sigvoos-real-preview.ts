import type { Env } from '../../types';
import {
  SigvoosApiClient,
  resolveSigvoosEncryptionSecret,
  decryptSigvoosPassword,
  SigvoosClientError,
} from '../../lib/sigvoos/client';

const SIGVOOS_DEFAULT_BASE_URL = 'https://api.sigvoos.com.br/api';
const SIGVOOS_DEFAULT_SYSTEM = 'sigtrip';
const SIGVOOS_PASSWORD_ENCRYPTED_PREFIX = 'enc:v1';
const MAX_WINDOW_DAYS = 31;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 10;
const DEFAULT_MAX_PAGES = 1;
const REQUEST_TIMEOUT_MS = 8_000;

type SigvoosRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

interface SigvoosReadOnlyConfig {
  baseUrl: string;
  username: string;
  password: string;
  system: string;
}

export interface SigvoosRealPreviewRequest {
  from: string;
  to: string;
  pageSize: number;
  maxPages: number;
}

export interface SigvoosRealPreviewSummary {
  recordsReceived: number;
  candidateFlights: number;
  withFlightReportId: number;
  withoutFlightReportId: number;
  crewWithStaffId: number;
  crewWithOnlyInscription: number;
  potentialConflictsEstimated: number;
  missingFields: Record<string, number>;
  sensitiveFieldsDetected: string[];
  observedTopLevelFields: string[];
  sampleShape: Array<Record<string, boolean>>;
  contractErrors: string[];
}

export class SigvoosRealPreviewError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 502) {
    super(code);
    this.name = 'SigvoosRealPreviewError';
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is SigvoosRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeBaseUrl(value: string | null): string {
  const url = value || SIGVOOS_DEFAULT_BASE_URL;
  return url.replace(/\/+$/, '');
}

function isIsoDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function daysBetweenInclusive(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function addDaysIso(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function parseBoundedInteger(value: unknown, fallback: number, min: number, max: number, code: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new SigvoosRealPreviewError(code, 400);
  }
  return parsed;
}

export function parseSigvoosRealPreviewRequest(
  payload: Record<string, unknown>,
  now = new Date(),
): SigvoosRealPreviewRequest {
  const allowed = new Set(['window', 'from', 'to', 'limit']);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_FIELD_FORBIDDEN', 400);
    }
  }

  const hasExplicitFrom = payload.from !== undefined && payload.from !== null && payload.from !== '';
  const hasExplicitTo = payload.to !== undefined && payload.to !== null && payload.to !== '';
  if ((hasExplicitFrom || hasExplicitTo) && payload.window !== undefined) {
    throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_FIELD_FORBIDDEN', 400);
  }

  const window = payload.window;
  if (window !== undefined && !isRecord(window)) {
    throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_INVALID_WINDOW', 400);
  }
  if (isRecord(window)) {
    const allowedWindowKeys = new Set(['days']);
    for (const key of Object.keys(window)) {
      if (!allowedWindowKeys.has(key)) {
        throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_FIELD_FORBIDDEN', 400);
      }
    }
  }

  const today = todayIso(now);

  if (hasExplicitFrom || hasExplicitTo) {
    const from = normalizeText(payload.from);
    const to = normalizeText(payload.to);

    if (!from || !to || !isIsoDateOnly(from) || !isIsoDateOnly(to) || to < from) {
      throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_INVALID_WINDOW', 400);
    }
    if (to > today) {
      throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_TO_FUTURE', 400);
    }
    if (daysBetweenInclusive(from, to) > MAX_WINDOW_DAYS) {
      throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_WINDOW_TOO_WIDE', 400);
    }

    return {
      from,
      to,
      pageSize: parseBoundedInteger(
        payload.limit,
        DEFAULT_PAGE_SIZE,
        1,
        MAX_PAGE_SIZE,
        'CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_LIMIT_INVALID',
      ),
      maxPages: DEFAULT_MAX_PAGES,
    };
  }

  let requestedDays = 1;
  if (window && window.days !== undefined && window.days !== null && window.days !== '') {
    const parsedDays = typeof window.days === 'number' ? window.days : Number(window.days);
    if (!Number.isInteger(parsedDays) || parsedDays < 1) {
      throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_INVALID_WINDOW', 400);
    }
    if (parsedDays > MAX_WINDOW_DAYS) {
      throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_WINDOW_TOO_WIDE', 400);
    }
    requestedDays = parsedDays;
  }
  const from = today;
  const to = addDaysIso(from, requestedDays - 1);

  return {
    from,
    to,
    pageSize: parseBoundedInteger(
      payload.limit,
      DEFAULT_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE,
      'CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_LIMIT_INVALID',
    ),
    maxPages: DEFAULT_MAX_PAGES,
  };
}

// Cryptography and base64 functions imported from client

async function loadConfigFromDb(db: D1Database, empresaId: number, env: Env): Promise<SigvoosReadOnlyConfig | null> {
  let rows: D1Result<{ chave: string; valor: string | null }>;
  try {
    rows = await db
      .prepare(
        `SELECT chave, valor
           FROM integracoes_sigvoos_config
          WHERE empresa_id = ?
            AND deleted_at IS NULL
            AND chave IN ('base_url', 'username', 'password', 'password_encrypted', 'system')`,
      )
      .bind(empresaId)
      .all<{ chave: string; valor: string | null }>();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/no such table|no such column/i.test(message)) return null;
    throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_CONFIG_UNAVAILABLE', 503);
  }

  const values = new Map((rows.results || []).map((row) => [row.chave, row.valor]));
  const username = normalizeText(values.get('username'));
  let password = normalizeText(values.get('password'));
  const encrypted = normalizeText(values.get('password_encrypted'));
  const secret = resolveSigvoosEncryptionSecret(env as any);

  if (!password && encrypted && secret) {
    try {
      password = await decryptSigvoosPassword(encrypted, secret);
    } catch {
      password = null;
    }
  }

  if (!username || !password || password === '__WORKER_ENCRYPTED__') return null;

  return {
    baseUrl: normalizeBaseUrl(normalizeText(values.get('base_url'))),
    username,
    password,
    system: normalizeText(values.get('system')) || SIGVOOS_DEFAULT_SYSTEM,
  };
}

async function loadReadOnlyConfig(db: D1Database, empresaId: number, env: Env): Promise<SigvoosReadOnlyConfig> {
  const envUsername = normalizeText(env.SIGVOOS_REAL_API_USERNAME);
  const envPassword = normalizeText(env.SIGVOOS_REAL_API_PASSWORD);
  if (envUsername && envPassword) {
    return {
      baseUrl: normalizeBaseUrl(normalizeText(env.SIGVOOS_REAL_API_BASE_URL)),
      username: envUsername,
      password: envPassword,
      system: normalizeText(env.SIGVOOS_REAL_API_SYSTEM) || SIGVOOS_DEFAULT_SYSTEM,
    };
  }

  const fromDb = await loadConfigFromDb(db, empresaId, env);
  if (fromDb) return fromDb;

  throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_CREDENTIALS_MISSING', 503);
}

function formatBrDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

// Auth handled by client

function extractRecords(payload: unknown): SigvoosRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];

  for (const key of ['items', 'records', 'results', 'variants', 'main']) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  for (const key of ['data', 'result', 'payload']) {
    const nested = extractRecords(payload[key]);
    if (nested.length > 0) return nested;
  }
  return [];
}

function nestedRecord(record: SigvoosRecord, key: string): SigvoosRecord {
  return isRecord(record[key]) ? (record[key] as SigvoosRecord) : {};
}

function pick(record: SigvoosRecord, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), record);
}

function hasValue(record: SigvoosRecord, path: string): boolean {
  return normalizeText(pick(record, path)) !== null;
}

function hasAny(record: SigvoosRecord, paths: string[]): boolean {
  return paths.some((path) => hasValue(record, path));
}

function countMissing(records: SigvoosRecord[], path: string): number {
  return records.reduce((total, record) => total + (hasValue(record, path) ? 0 : 1), 0);
}

function collectSensitiveKeys(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 10)) collectSensitiveKeys(item, output);
    return output;
  }
  if (!isRecord(value)) return output;

  for (const [key, nested] of Object.entries(value)) {
    if (/(cpf|email|token|senha|password|secret|credential|authorization)/i.test(key)) {
      output.add(key);
    }
    collectSensitiveKeys(nested, output);
  }
  return output;
}

function flightIdentity(record: SigvoosRecord): string {
  const report = nestedRecord(record, 'flight_report');
  const reportId = normalizeText(report.id);
  if (reportId) return `report:${reportId}`;
  return [
    normalizeText(record.date),
    normalizeText(report.flight_number) || normalizeText(report.report_number),
    normalizeText(nestedRecord(record, 'aircraft').registration),
    normalizeText(nestedRecord(record, 'departure_location').icao_code),
    normalizeText(nestedRecord(record, 'arrival_location').icao_code),
  ]
    .filter(Boolean)
    .join('|');
}

export function summarizeSigvoosRealPreview(records: SigvoosRecord[]): SigvoosRealPreviewSummary {
  const identities = new Set(records.map(flightIdentity).filter((identity) => identity.length > 0));
  const withFlightReportId = records.filter((record) => hasValue(record, 'flight_report.id')).length;
  const crewWithStaffId = records.filter((record) => hasValue(record, 'staff.id')).length;
  const crewWithOnlyInscription = records.filter(
    (record) => !hasValue(record, 'staff.id') && hasValue(record, 'staff.inscription'),
  ).length;
  const potentialConflictsEstimated = records.filter(
    (record) =>
      !hasValue(record, 'flight_report.id') ||
      !hasAny(record, ['staff.id', 'staff.inscription']) ||
      !hasAny(record, ['date', 'flight_date']) ||
      !hasValue(record, 'departure_location.icao_code') ||
      !hasValue(record, 'arrival_location.icao_code'),
  ).length;
  const observedTopLevelFields = Array.from(
    records.reduce((fields, record) => {
      Object.keys(record).forEach((key) => fields.add(key));
      return fields;
    }, new Set<string>()),
  )
    .sort()
    .slice(0, 40);

  return {
    recordsReceived: records.length,
    candidateFlights: identities.size,
    withFlightReportId,
    withoutFlightReportId: records.length - withFlightReportId,
    crewWithStaffId,
    crewWithOnlyInscription,
    potentialConflictsEstimated,
    missingFields: {
      date: countMissing(records, 'date'),
      flightReportId: countMissing(records, 'flight_report.id'),
      flightNumber: records.reduce(
        (total, record) => total + (hasAny(record, ['flight_report.flight_number', 'flight_report.report_number']) ? 0 : 1),
        0,
      ),
      legNumber: countMissing(records, 'flight_report_leg.number'),
      departureIcao: countMissing(records, 'departure_location.icao_code'),
      arrivalIcao: countMissing(records, 'arrival_location.icao_code'),
      staffId: countMissing(records, 'staff.id'),
      staffInscription: countMissing(records, 'staff.inscription'),
    },
    sensitiveFieldsDetected: Array.from(collectSensitiveKeys(records)).sort(),
    observedTopLevelFields,
    sampleShape: records.slice(0, 3).map((record) => ({
      hasDate: hasAny(record, ['date', 'flight_date']),
      hasFlightReportId: hasValue(record, 'flight_report.id'),
      hasLegNumber: hasValue(record, 'flight_report_leg.number'),
      hasDepartureIcao: hasValue(record, 'departure_location.icao_code'),
      hasArrivalIcao: hasValue(record, 'arrival_location.icao_code'),
      hasStaffId: hasValue(record, 'staff.id'),
      hasStaffInscription: hasValue(record, 'staff.inscription'),
    })),
    contractErrors: records.length === 0 ? ['CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_EMPTY_PAYLOAD'] : [],
  };
}

async function fetchRecords(
  client: SigvoosApiClient,
  request: SigvoosRealPreviewRequest,
): Promise<SigvoosRecord[]> {
  const records: SigvoosRecord[] = [];
  for (let page = 1; page <= request.maxPages; page += 1) {
    let payload;
    try {
      payload = await client.postSearch('/relatorios/voos/tripulantes/etapas/pesquisa', {
        date_start: formatBrDate(request.from),
        date_finish: formatBrDate(request.to),
        page,
        page_size: request.pageSize,
        limit: request.pageSize,
      });
    } catch (err: unknown) {
      if (err instanceof SigvoosClientError) {
        if (err.code === 'SIGVOOS_UNAUTHORIZED') throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_TOKEN_MISSING', 502);
        if (err.code === 'SIGVOOS_TIMEOUT') throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_NETWORK_ERROR', 502);
        throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_UPSTREAM_ERROR', 502);
      }
      throw new SigvoosRealPreviewError('CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_NETWORK_ERROR', 502);
    }
    const pageRecords = extractRecords(payload);
    records.push(...pageRecords);
    if (pageRecords.length < request.pageSize) break;
  }
  return records;
}

export async function runSigvoosRealApiPreview(
  db: D1Database,
  empresaId: number,
  env: Env,
  request: SigvoosRealPreviewRequest,
  options: { fetchImpl?: FetchLike } = {},
) {
  const config = await loadReadOnlyConfig(db, empresaId, env);
  const client = new SigvoosApiClient({
    base_url: config.baseUrl,
    username: config.username,
    password: config.password,
    system: config.system,
  }, { fetchImpl: options.fetchImpl as typeof fetch });
  
  const records = await fetchRecords(client, request);

  return {
    mode: 'real-preview' as const,
    enabled: true,
    tenantScoped: true,
    writesEnabled: false,
    realApiCalled: true,
    provider: 'SIGVOOS',
    empresaId,
    status: 'READY' as const,
    window: {
      from: request.from,
      to: request.to,
    },
    limits: {
      pageSize: request.pageSize,
      maxPages: request.maxPages,
      maxWindowDays: MAX_WINDOW_DAYS,
      timeoutMs: REQUEST_TIMEOUT_MS,
    },
    summary: summarizeSigvoosRealPreview(records),
  };
}
