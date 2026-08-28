import type { Env } from '../../types';
import { getAnacPublicDataSource, isOfficialAnacPublicDataUrl } from './public-data-catalog';
import {
  normalizeAnacRabAircraft,
  normalizeBrazilianAircraftRegistration,
  type AnacRabAircraftProjection,
} from './rab-normalization';

export const ANAC_RAB_FLEET_SNAPSHOT_VERSION = 'anac.rab-fleet-snapshot.v1' as const;

const SOURCE_ID = 'RAB_AIRCRAFT' as const;
const MIN_EXPECTED_RAB_ROWS = 100;
const MAX_REJECTED_RATIO = 0.25;
const MAX_RELATIVE_DROP_RATIO = 0.6;
const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 60_000;

type SyncOutcome = 'PROMOTED' | 'NOT_MODIFIED' | 'UNCHANGED' | 'FAILED' | 'SKIPPED';

type SyncStateRow = {
  active_snapshot_hash: string | null;
  active_snapshot_key: string | null;
  source_etag: string | null;
  source_last_modified: string | null;
  last_record_count: number | null;
  consecutive_failures: number | null;
};

type FleetAircraftRow = {
  id: number;
  empresa_id: number;
  prefixo: string | null;
  modelo: string | null;
  ano_fabricacao: number | null;
};

type FleetProjection = {
  empresaId: number;
  aeronaveId: number;
  registration: string;
  matchStatus: 'MATCHED' | 'NOT_FOUND' | 'INVALID_REGISTRATION';
  rab: AnacRabAircraftProjection | null;
};

export type AnacRabSyncErrorCode =
  | 'SOURCE_URL_NOT_OFFICIAL'
  | 'FETCH_TIMEOUT'
  | 'FETCH_FAILED'
  | 'HTTP_ERROR'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_JSON'
  | 'INVALID_ROOT'
  | 'TOO_FEW_RECORDS'
  | 'RECORD_COUNT_DROP'
  | 'TOO_MANY_REJECTED_ROWS'
  | 'PERSISTENCE_FAILED';

export class AnacRabSyncError extends Error {
  constructor(public readonly code: AnacRabSyncErrorCode) {
    super(code);
    this.name = 'AnacRabSyncError';
  }
}

export interface AnacRabSyncResult {
  sourceId: typeof SOURCE_ID;
  outcome: SyncOutcome;
  checkedAt: string;
  snapshotHash: string | null;
  recordCount: number | null;
  rejectedCount: number | null;
  fleetAircraftCount: number | null;
}

export interface AnacRabSyncOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function runId(): string {
  return `anac-rab-${crypto.randomUUID()}`;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  // Some WebCrypto-compatible test runtimes transfer/detach the supplied buffer.
  // Hash a copy so the original response bytes remain available for JSON parsing.
  const digestInput = bytes.slice(0);
  return bytesToHex(await crypto.subtle.digest('SHA-256', digestInput));
}

function parseRabRows(bytes: ArrayBuffer): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AnacRabSyncError('INVALID_JSON');
  }

  if (Array.isArray(parsed)) {
    return parsed.filter(
      (row): row is Record<string, unknown> =>
        typeof row === 'object' && row !== null && !Array.isArray(row),
    );
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const root = parsed as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'aeronaves']) {
      const value = root[key];
      if (Array.isArray(value)) {
        return value.filter(
          (row): row is Record<string, unknown> =>
            typeof row === 'object' && row !== null && !Array.isArray(row),
        );
      }
    }
  }

  throw new AnacRabSyncError('INVALID_ROOT');
}

function validateRecordCounts(
  rowCount: number,
  rejectedCount: number,
  previousRowCount: number | null,
): void {
  if (rowCount < MIN_EXPECTED_RAB_ROWS) {
    throw new AnacRabSyncError('TOO_FEW_RECORDS');
  }

  if (previousRowCount && rowCount < Math.floor(previousRowCount * MAX_RELATIVE_DROP_RATIO)) {
    throw new AnacRabSyncError('RECORD_COUNT_DROP');
  }

  if (rowCount > 0 && rejectedCount / rowCount > MAX_REJECTED_RATIO) {
    throw new AnacRabSyncError('TOO_MANY_REJECTED_ROWS');
  }
}

function buildRabIndex(rows: Record<string, unknown>[]): {
  byRegistration: Map<string, AnacRabAircraftProjection>;
  rejectedCount: number;
} {
  const byRegistration = new Map<string, AnacRabAircraftProjection>();
  let rejectedCount = 0;

  for (const row of rows) {
    const projection = normalizeAnacRabAircraft(row);
    if (!projection) {
      rejectedCount += 1;
      continue;
    }
    byRegistration.set(projection.registration, projection);
  }

  return { byRegistration, rejectedCount };
}

function buildFleetProjection(
  fleet: FleetAircraftRow[],
  rabByRegistration: Map<string, AnacRabAircraftProjection>,
): FleetProjection[] {
  return fleet.map((aircraft) => {
    const registration = normalizeBrazilianAircraftRegistration(aircraft.prefixo);
    if (!registration) {
      return {
        empresaId: aircraft.empresa_id,
        aeronaveId: aircraft.id,
        registration: String(aircraft.prefixo || '').trim().toUpperCase(),
        matchStatus: 'INVALID_REGISTRATION',
        rab: null,
      };
    }

    const rab = rabByRegistration.get(registration) ?? null;
    return {
      empresaId: aircraft.empresa_id,
      aeronaveId: aircraft.id,
      registration,
      matchStatus: rab ? 'MATCHED' : 'NOT_FOUND',
      rab,
    };
  });
}

function snapshotKey(hash: string, checkedAt: string): string {
  const date = new Date(checkedAt);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `regulatory/anac/public/rab/${year}/${month}/${hash}.min.json`;
}

function minimizedSnapshotBody(params: {
  checkedAt: string;
  hash: string;
  etag: string | null;
  lastModified: string | null;
  rowCount: number;
  rejectedCount: number;
  fleet: FleetProjection[];
}): string {
  return JSON.stringify({
    schemaVersion: ANAC_RAB_FLEET_SNAPSHOT_VERSION,
    classification: 'MINIMIZED_OFFICIAL_PUBLIC_DATA_SNAPSHOT',
    source: {
      id: SOURCE_ID,
      authority: 'ANAC',
      contentHashSha256: params.hash,
      checkedAt: params.checkedAt,
      etag: params.etag,
      lastModified: params.lastModified,
      recordCount: params.rowCount,
      rejectedCount: params.rejectedCount,
    },
    aircraft: params.fleet.map((entry) => ({
      empresaId: entry.empresaId,
      aeronaveId: entry.aeronaveId,
      registration: entry.registration,
      matchStatus: entry.matchStatus,
      rab: entry.rab,
    })),
  });
}

async function loadState(db: D1Database): Promise<SyncStateRow | null> {
  return db
    .prepare(
      `SELECT active_snapshot_hash, active_snapshot_key, source_etag, source_last_modified,
              last_record_count, consecutive_failures
         FROM anac_public_sync_state
        WHERE source_id = ?`,
    )
    .bind(SOURCE_ID)
    .first<SyncStateRow>();
}

async function loadFleet(db: D1Database): Promise<FleetAircraftRow[]> {
  const result = await db
    .prepare(
      `SELECT id, empresa_id, prefixo, modelo, ano_fabricacao
         FROM aeronaves
        WHERE deleted_at IS NULL
          AND prefixo IS NOT NULL
          AND TRIM(prefixo) <> ''
        ORDER BY empresa_id, id`,
    )
    .all<FleetAircraftRow>();
  return result.results ?? [];
}

function syncRunStatement(
  db: D1Database,
  params: {
    id: string;
    startedAt: string;
    finishedAt: string;
    outcome: SyncOutcome;
    httpStatus: number | null;
    etag: string | null;
    lastModified: string | null;
    hash: string | null;
    key: string | null;
    contentLength: number | null;
    recordCount: number | null;
    rejectedCount: number | null;
    errorCode: string | null;
  },
) {
  return db
    .prepare(
      `INSERT INTO anac_public_sync_runs (
         id, source_id, started_at, finished_at, outcome, http_status,
         source_etag, source_last_modified, snapshot_hash, snapshot_key,
         content_length, record_count, rejected_count, error_code, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      params.id,
      SOURCE_ID,
      params.startedAt,
      params.finishedAt,
      params.outcome,
      params.httpStatus,
      params.etag,
      params.lastModified,
      params.hash,
      params.key,
      params.contentLength,
      params.recordCount,
      params.rejectedCount,
      params.errorCode,
      params.finishedAt,
    );
}

async function recordFailure(
  db: D1Database,
  params: {
    id: string;
    startedAt: string;
    finishedAt: string;
    httpStatus: number | null;
    errorCode: string;
  },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO anac_public_sync_state (
           source_id, last_checked_at, last_failure_at, consecutive_failures,
           last_http_status, last_error_code, created_at, updated_at
         ) VALUES (?, ?, ?, 1, ?, ?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           last_checked_at = excluded.last_checked_at,
           last_failure_at = excluded.last_failure_at,
           consecutive_failures = anac_public_sync_state.consecutive_failures + 1,
           last_http_status = excluded.last_http_status,
           last_error_code = excluded.last_error_code,
           updated_at = excluded.updated_at`,
      )
      .bind(
        SOURCE_ID,
        params.finishedAt,
        params.finishedAt,
        params.httpStatus,
        params.errorCode,
        params.finishedAt,
        params.finishedAt,
      ),
    syncRunStatement(db, {
      id: params.id,
      startedAt: params.startedAt,
      finishedAt: params.finishedAt,
      outcome: 'FAILED',
      httpStatus: params.httpStatus,
      etag: null,
      lastModified: null,
      hash: null,
      key: null,
      contentLength: null,
      recordCount: null,
      rejectedCount: null,
      errorCode: params.errorCode,
    }),
  ]);
}

async function recordNotModified(
  db: D1Database,
  params: {
    id: string;
    startedAt: string;
    finishedAt: string;
    state: SyncStateRow | null;
    etag: string | null;
    lastModified: string | null;
  },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO anac_public_sync_state (
           source_id, active_snapshot_hash, active_snapshot_key, source_etag,
           source_last_modified, last_checked_at, last_success_at,
           consecutive_failures, last_http_status, last_error_code,
           last_record_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 304, NULL, ?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           source_etag = COALESCE(excluded.source_etag, anac_public_sync_state.source_etag),
           source_last_modified = COALESCE(excluded.source_last_modified, anac_public_sync_state.source_last_modified),
           last_checked_at = excluded.last_checked_at,
           last_success_at = excluded.last_success_at,
           consecutive_failures = 0,
           last_http_status = 304,
           last_error_code = NULL,
           updated_at = excluded.updated_at`,
      )
      .bind(
        SOURCE_ID,
        params.state?.active_snapshot_hash ?? null,
        params.state?.active_snapshot_key ?? null,
        params.etag,
        params.lastModified,
        params.finishedAt,
        params.finishedAt,
        params.state?.last_record_count ?? null,
        params.finishedAt,
        params.finishedAt,
      ),
    syncRunStatement(db, {
      id: params.id,
      startedAt: params.startedAt,
      finishedAt: params.finishedAt,
      outcome: 'NOT_MODIFIED',
      httpStatus: 304,
      etag: params.etag,
      lastModified: params.lastModified,
      hash: params.state?.active_snapshot_hash ?? null,
      key: params.state?.active_snapshot_key ?? null,
      contentLength: null,
      recordCount: params.state?.last_record_count ?? null,
      rejectedCount: null,
      errorCode: null,
    }),
  ]);
}

async function recordUnchanged(
  db: D1Database,
  params: {
    id: string;
    startedAt: string;
    finishedAt: string;
    state: SyncStateRow;
    httpStatus: number;
    etag: string | null;
    lastModified: string | null;
    hash: string;
    contentLength: number;
  },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE anac_public_sync_state
            SET source_etag = ?, source_last_modified = ?, last_checked_at = ?,
                last_success_at = ?, consecutive_failures = 0, last_http_status = ?,
                last_error_code = NULL, updated_at = ?
          WHERE source_id = ?`,
      )
      .bind(
        params.etag,
        params.lastModified,
        params.finishedAt,
        params.finishedAt,
        params.httpStatus,
        params.finishedAt,
        SOURCE_ID,
      ),
    syncRunStatement(db, {
      id: params.id,
      startedAt: params.startedAt,
      finishedAt: params.finishedAt,
      outcome: 'UNCHANGED',
      httpStatus: params.httpStatus,
      etag: params.etag,
      lastModified: params.lastModified,
      hash: params.hash,
      key: params.state.active_snapshot_key,
      contentLength: params.contentLength,
      recordCount: params.state.last_record_count,
      rejectedCount: null,
      errorCode: null,
    }),
  ]);
}

function cacheStatement(
  db: D1Database,
  entry: FleetProjection,
  hash: string,
  checkedAt: string,
  changedAt: string,
) {
  const rab = entry.rab;
  return db
    .prepare(
      `INSERT INTO anac_rab_aircraft_cache (
         empresa_id, aeronave_id, registration, match_status, snapshot_hash,
         serial_number, category, type_certificate, model, manufacturer,
         aircraft_class, maximum_takeoff_weight, icao_type, minimum_crew,
         maximum_passengers, seats, manufacture_year, cav_valid_until,
         ca_valid_until, registration_cancelled_at, airworthiness_code,
         airworthiness_status, source_checked_at, source_changed_at,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(empresa_id, aeronave_id) DO UPDATE SET
         registration = excluded.registration,
         match_status = excluded.match_status,
         snapshot_hash = excluded.snapshot_hash,
         serial_number = excluded.serial_number,
         category = excluded.category,
         type_certificate = excluded.type_certificate,
         model = excluded.model,
         manufacturer = excluded.manufacturer,
         aircraft_class = excluded.aircraft_class,
         maximum_takeoff_weight = excluded.maximum_takeoff_weight,
         icao_type = excluded.icao_type,
         minimum_crew = excluded.minimum_crew,
         maximum_passengers = excluded.maximum_passengers,
         seats = excluded.seats,
         manufacture_year = excluded.manufacture_year,
         cav_valid_until = excluded.cav_valid_until,
         ca_valid_until = excluded.ca_valid_until,
         registration_cancelled_at = excluded.registration_cancelled_at,
         airworthiness_code = excluded.airworthiness_code,
         airworthiness_status = excluded.airworthiness_status,
         source_checked_at = excluded.source_checked_at,
         source_changed_at = excluded.source_changed_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      entry.empresaId,
      entry.aeronaveId,
      entry.registration,
      entry.matchStatus,
      hash,
      rab?.serialNumber ?? null,
      rab?.category ?? null,
      rab?.typeCertificate ?? null,
      rab?.model ?? null,
      rab?.manufacturer ?? null,
      rab?.aircraftClass ?? null,
      rab?.maximumTakeoffWeight ?? null,
      rab?.icaoType ?? null,
      rab?.minimumCrew ?? null,
      rab?.maximumPassengers ?? null,
      rab?.seats ?? null,
      rab?.manufactureYear ?? null,
      rab?.cavValidUntil ?? null,
      rab?.caValidUntil ?? null,
      rab?.registrationCancelledAt ?? null,
      rab?.airworthinessCode ?? null,
      rab?.airworthinessStatus ?? null,
      checkedAt,
      changedAt,
      checkedAt,
      checkedAt,
    );
}

async function promoteSnapshot(
  env: Pick<Env, 'DB' | 'BUCKET'>,
  params: {
    id: string;
    startedAt: string;
    finishedAt: string;
    httpStatus: number;
    etag: string | null;
    lastModified: string | null;
    hash: string;
    key: string;
    contentLength: number;
    rowCount: number;
    rejectedCount: number;
    fleet: FleetProjection[];
    snapshotBody: string;
  },
): Promise<void> {
  await env.BUCKET.put(params.key, params.snapshotBody, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: {
      source: SOURCE_ID,
      sha256: params.hash,
      classification: 'minimized-official-public-data',
    },
  });

  const statements = params.fleet.map((entry) =>
    cacheStatement(env.DB, entry, params.hash, params.finishedAt, params.finishedAt),
  );

  statements.push(
    env.DB
      .prepare(
        `INSERT INTO anac_public_sync_state (
           source_id, active_snapshot_hash, active_snapshot_key, source_etag,
           source_last_modified, last_checked_at, last_changed_at, last_success_at,
           consecutive_failures, last_http_status, last_error_code,
           last_record_count, last_rejected_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, ?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           active_snapshot_hash = excluded.active_snapshot_hash,
           active_snapshot_key = excluded.active_snapshot_key,
           source_etag = excluded.source_etag,
           source_last_modified = excluded.source_last_modified,
           last_checked_at = excluded.last_checked_at,
           last_changed_at = excluded.last_changed_at,
           last_success_at = excluded.last_success_at,
           consecutive_failures = 0,
           last_http_status = excluded.last_http_status,
           last_error_code = NULL,
           last_record_count = excluded.last_record_count,
           last_rejected_count = excluded.last_rejected_count,
           updated_at = excluded.updated_at`,
      )
      .bind(
        SOURCE_ID,
        params.hash,
        params.key,
        params.etag,
        params.lastModified,
        params.finishedAt,
        params.finishedAt,
        params.finishedAt,
        params.httpStatus,
        params.rowCount,
        params.rejectedCount,
        params.finishedAt,
        params.finishedAt,
      ),
    syncRunStatement(env.DB, {
      id: params.id,
      startedAt: params.startedAt,
      finishedAt: params.finishedAt,
      outcome: 'PROMOTED',
      httpStatus: params.httpStatus,
      etag: params.etag,
      lastModified: params.lastModified,
      hash: params.hash,
      key: params.key,
      contentLength: params.contentLength,
      recordCount: params.rowCount,
      rejectedCount: params.rejectedCount,
      errorCode: null,
    }),
  );

  await env.DB.batch(statements);
}

export async function syncAnacRabPublicData(
  env: Pick<Env, 'DB' | 'BUCKET'>,
  options: AnacRabSyncOptions = {},
): Promise<AnacRabSyncResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const startedAt = nowIso(now);
  const id = runId();
  const source = getAnacPublicDataSource(SOURCE_ID);

  if (!isOfficialAnacPublicDataUrl(source.dataUrl)) {
    throw new AnacRabSyncError('SOURCE_URL_NOT_OFFICIAL');
  }

  let state: SyncStateRow | null = null;
  let httpStatus: number | null = null;

  try {
    state = await loadState(env.DB);

    const headers = new Headers({ Accept: 'application/json' });
    if (state?.source_etag) headers.set('If-None-Match', state.source_etag);
    if (state?.source_last_modified) headers.set('If-Modified-Since', state.source_last_modified);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(source.dataUrl, {
        method: 'GET',
        headers,
        redirect: 'follow',
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw new AnacRabSyncError('FETCH_TIMEOUT');
      throw new AnacRabSyncError('FETCH_FAILED');
    } finally {
      clearTimeout(timeout);
    }

    httpStatus = response.status;
    const etag = response.headers.get('etag');
    const lastModified = response.headers.get('last-modified');

    if (response.status === 304) {
      const finishedAt = nowIso(now);
      await recordNotModified(env.DB, { id, startedAt, finishedAt, state, etag, lastModified });
      return {
        sourceId: SOURCE_ID,
        outcome: 'NOT_MODIFIED',
        checkedAt: finishedAt,
        snapshotHash: state?.active_snapshot_hash ?? null,
        recordCount: state?.last_record_count ?? null,
        rejectedCount: null,
        fleetAircraftCount: null,
      };
    }

    if (!response.ok) {
      throw new AnacRabSyncError('HTTP_ERROR');
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_PAYLOAD_BYTES) {
      throw new AnacRabSyncError('PAYLOAD_TOO_LARGE');
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_PAYLOAD_BYTES) {
      throw new AnacRabSyncError('PAYLOAD_TOO_LARGE');
    }

    const hash = await sha256Hex(bytes);
    const finishedAt = nowIso(now);

    if (state?.active_snapshot_hash === hash) {
      await recordUnchanged(env.DB, {
        id,
        startedAt,
        finishedAt,
        state,
        httpStatus: response.status,
        etag,
        lastModified,
        hash,
        contentLength: bytes.byteLength,
      });
      return {
        sourceId: SOURCE_ID,
        outcome: 'UNCHANGED',
        checkedAt: finishedAt,
        snapshotHash: hash,
        recordCount: state.last_record_count,
        rejectedCount: null,
        fleetAircraftCount: null,
      };
    }

    const rows = parseRabRows(bytes);
    const { byRegistration, rejectedCount } = buildRabIndex(rows);
    validateRecordCounts(rows.length, rejectedCount, state?.last_record_count ?? null);

    const fleetRows = await loadFleet(env.DB);
    const fleet = buildFleetProjection(fleetRows, byRegistration);
    const key = snapshotKey(hash, finishedAt);
    const body = minimizedSnapshotBody({
      checkedAt: finishedAt,
      hash,
      etag,
      lastModified,
      rowCount: rows.length,
      rejectedCount,
      fleet,
    });

    try {
      await promoteSnapshot(env, {
        id,
        startedAt,
        finishedAt,
        httpStatus: response.status,
        etag,
        lastModified,
        hash,
        key,
        contentLength: bytes.byteLength,
        rowCount: rows.length,
        rejectedCount,
        fleet,
        snapshotBody: body,
      });
    } catch {
      throw new AnacRabSyncError('PERSISTENCE_FAILED');
    }

    return {
      sourceId: SOURCE_ID,
      outcome: 'PROMOTED',
      checkedAt: finishedAt,
      snapshotHash: hash,
      recordCount: rows.length,
      rejectedCount,
      fleetAircraftCount: fleet.length,
    };
  } catch (error) {
    const finishedAt = nowIso(now);
    const code = error instanceof AnacRabSyncError ? error.code : 'PERSISTENCE_FAILED';
    try {
      await recordFailure(env.DB, {
        id,
        startedAt,
        finishedAt,
        httpStatus,
        errorCode: code,
      });
    } catch {
      // The original failure remains authoritative. Telemetry failure must not
      // replace it or leak upstream payload data.
    }
    if (error instanceof AnacRabSyncError) throw error;
    throw new AnacRabSyncError(code);
  }
}
