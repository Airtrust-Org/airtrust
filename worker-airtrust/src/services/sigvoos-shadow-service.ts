/**
 * SIGVOOS real shadow/parallel ingestion — Fase 0.
 *
 * This is path B: it reuses the exact same normalized SIGVOOS leg contract
 * (`SigvoosNormalizedLeg`, `normalizeSigvoosRecord`, `getArrayPayload`,
 * `findTripulanteByCanacOrName`) already produced by the production client
 * in `../services/sigvoos-frms.ts`, captured per-leg into shadow tables.
 *
 * Hard invariants (see AIRTRUST — SIGVOOS REAL — SHADOW/PARALELO V1 spec):
 *  - NEVER writes to frms_jornada, frms_alerta, rolling, or any operational
 *    FRMS table. Only sigvoos_shadow_* tables (migration 0467).
 *  - NEVER changes `FRMS_CANONICAL_OPERATIONAL_SOURCE` or calls
 *    `syncSigvoosForFrms`; path A is untouched by this module.
 *  - `empresaId` is REQUIRED and never falls back to another tenant's
 *    config — unlike `resolveSigvoosEmpresaId` in the production sync,
 *    which is allowed to fall back for the *operational* path. Shadow
 *    ingestion fails closed instead.
 *  - Not wired into any cron schedule; callers invoke it explicitly.
 */

import {
  SIGVOOS_DEFAULT_BASE_URL,
  SIGVOOS_DEFAULT_SYSTEM,
  SigvoosApiClient,
  type SigvoosConfig as ClientSigvoosConfig,
} from '../lib/sigvoos/client';
import { getArrayPayload } from './sigvoos-frms';
import {
  buildSigvoosMonthlyWindows,
  findTripulanteByCanacOrName,
  getSigvoosConfig,
  normalizeSigvoosRecord,
  shouldStopSigvoosPaging,
  type SigvoosNormalizedLeg,
  type SigvoosResolutionSource,
  type SigvoosSyncClient,
} from './sigvoos-frms';
import {
  classifyShadowComparison,
  type ShadowComparableLeg,
  type SigvoosShadowClassification,
} from '../lib/sigvoos/sigvoos-shadow-compare';

const SHADOW_PAGE_SIZE = 200;
const SHADOW_MAX_PAGES_DEFAULT = 2;

export class SigvoosShadowTenantRequiredError extends Error {
  constructor() {
    super('SIGVOOS_SHADOW_TENANT_REQUIRED');
    this.name = 'SigvoosShadowTenantRequiredError';
  }
}

export class SigvoosShadowConcurrentRunError extends Error {
  constructor() {
    super('SIGVOOS_SHADOW_CONCURRENT_RUN');
    this.name = 'SigvoosShadowConcurrentRunError';
  }
}

export type SigvoosShadowRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'SUPERSEDED';

export interface SigvoosShadowRunInput {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  pageSize?: number;
  maxPages?: number;
  /** Optional: resolves the IANA timezone for a given (empresaId, dateIso).
   * Returns null when unresolved — the leg is then classified
   * TIMEZONE_UNRESOLVED rather than assuming UTC-3. Absent by default. */
  resolveTimezone?: (empresaId: number, dateIso: string) => Promise<string | null> | string | null;
  /** Optional: reports whether a Controle de Voos manual value exists and
   * differs from the shadow value for this identity. Absent by default
   * (no CV per-field provenance system exists yet for legs in main), so no
   * MANUAL_CONFLICT is ever synthesized without real CV data backing it. */
  detectManualConflict?: (
    empresaId: number,
    identityKey: string,
  ) => Promise<boolean> | boolean;
}

export interface SigvoosShadowDeps {
  createClient?: (config: ClientSigvoosConfig) => SigvoosSyncClient;
}

interface SigvoosRuntimeEnv {
  SIGVOOS_CONFIG_ENCRYPTION_KEY?: string;
  JWT_SECRET?: string;
}

export interface SigvoosShadowRunSummary {
  runId: string;
  empresaId: number;
  status: SigvoosShadowRunStatus;
  from: string;
  to: string;
  attempted: number;
  processed: number;
  failed: number;
  unmapped: number;
  classifications: Record<SigvoosShadowClassification, number>;
}

function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function generateId(): string {
  return crypto.randomUUID();
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function requireEmpresaId(empresaId: number | null | undefined): number {
  if (empresaId === null || empresaId === undefined || !Number.isFinite(Number(empresaId))) {
    throw new SigvoosShadowTenantRequiredError();
  }
  return Number(empresaId);
}

/** Deterministic content fields used for both identity fallback and the
 * fingerprint — excludes anything that can legitimately vary run-to-run
 * without the underlying flight content changing (e.g. no timestamps). */
function fingerprintFields(leg: SigvoosNormalizedLeg): Record<string, unknown> {
  return {
    canac: leg.canac,
    identificadorSigvoos: leg.identificadorSigvoos,
    staffIdSigvoos: leg.staffIdSigvoos,
    flightReportId: leg.flightReportId,
    legNumber: leg.legNumber,
    data: leg.data,
    departureIcao: leg.departureIcao,
    arrivalIcao: leg.arrivalIcao,
    engineStartTime: leg.engineStartTime,
    takeoffTime: leg.takeoffTime,
    landingTime: leg.landingTime,
    engineShutoffTime: leg.engineShutoffTime,
    dayLandings: leg.dayLandings,
    nightLandings: leg.nightLandings,
    starts: leg.starts,
    matriculaAeronave: leg.matriculaAeronave,
    tempoNoturnoMin: leg.tempoNoturnoMin,
    tempoIfrMin: leg.tempoIfrMin,
  };
}

function stableStringify(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort();
  const ordered: Record<string, unknown> = {};
  for (const key of keys) ordered[key] = value[key] ?? null;
  return JSON.stringify(ordered);
}

interface LegIdentity {
  identityKey: string;
  quality: 'STABLE' | 'UNSTABLE_IDENTITY';
}

async function buildLegIdentity(leg: SigvoosNormalizedLeg): Promise<LegIdentity> {
  if (leg.flightReportId && leg.legNumber !== null && leg.legNumber !== undefined) {
    return { identityKey: `${leg.flightReportId}::${leg.legNumber}`, quality: 'STABLE' };
  }
  // No stable external key available. Per spec 3.2 we must NOT invent a
  // stable id from date/name/route/registration/time — but idempotency
  // still requires the *same* payload to collapse to the *same* row rather
  // than duplicating shadow entities, so the fallback key is a content hash
  // (not treated as a real identity — always flagged UNSTABLE_IDENTITY).
  const hash = await sha256Hex(stableStringify(fingerprintFields(leg)));
  return { identityKey: `UNSTABLE::${hash}`, quality: 'UNSTABLE_IDENTITY' };
}

async function resolveCrewForLeg(
  db: D1Database,
  empresaId: number,
  leg: SigvoosNormalizedLeg,
): Promise<{ method: SigvoosResolutionSource; funcionarioId: string | null }> {
  const matched = await findTripulanteByCanacOrName(db, empresaId, {
    canac: leg.canac,
    identificadorSigvoos: leg.identificadorSigvoos,
    name: leg.tripulanteNome,
  });
  if (!matched) return { method: 'NAO_ENCONTRADO', funcionarioId: null };
  return { method: matched.fonteResolucao, funcionarioId: matched.id };
}

async function findExistingActiveLeg(
  db: D1Database,
  empresaId: number,
  identityKey: string,
): Promise<{
  id: string;
  source_fingerprint: string;
  normalized_json: string;
  source_state: string;
} | null> {
  const row = await db
    .prepare(
      `SELECT id, source_fingerprint, normalized_json, source_state
         FROM sigvoos_shadow_legs
        WHERE empresa_id = ? AND identity_key = ? AND active = 1
        LIMIT 1`,
    )
    .bind(empresaId, identityKey)
    .first<{ id: string; source_fingerprint: string; normalized_json: string; source_state: string }>();
  return row ?? null;
}

async function acquireRunLease(
  db: D1Database,
  empresaId: number,
  from: string,
  to: string,
): Promise<void> {
  const existing = await db
    .prepare(
      `SELECT id FROM sigvoos_shadow_runs
        WHERE empresa_id = ?
          AND status IN ('PENDING','RUNNING')
          AND NOT (period_to < ? OR period_from > ?)
        LIMIT 1`,
    )
    .bind(empresaId, from, to)
    .first<{ id: string }>();
  if (existing) throw new SigvoosShadowConcurrentRunError();
}

export async function runSigvoosShadowIngestion(
  db: D1Database,
  empresaId: number | null | undefined,
  input: SigvoosShadowRunInput,
  runtimeEnv?: SigvoosRuntimeEnv,
  deps?: SigvoosShadowDeps,
): Promise<SigvoosShadowRunSummary> {
  const tenantId = requireEmpresaId(empresaId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to) || input.from > input.to) {
    throw new Error('SIGVOOS_SHADOW_INVALID_RANGE');
  }

  await acquireRunLease(db, tenantId, input.from, input.to);

  const runId = generateId();
  const startedAt = now();
  await db
    .prepare(
      `INSERT INTO sigvoos_shadow_runs
        (id, empresa_id, period_from, period_to, execution_mode, source, status,
         cursor_json, attempted_count, processed_count, failed_count, unmapped_count,
         source_config_version, error_summary, started_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'SHADOW', 'SIGVOOS', 'RUNNING', NULL, 0, 0, 0, 0, ?, NULL, ?, NULL, ?, ?)`,
    )
    .bind(runId, tenantId, input.from, input.to, 'v1', startedAt, startedAt, startedAt)
    .run();

  const classifications: Record<SigvoosShadowClassification, number> = {
    MATCH: 0,
    DIFF_NONCRITICAL: 0,
    DIFF_CRITICAL: 0,
    ONLY_DIRECT_PATH: 0,
    ONLY_SHADOW_PATH: 0,
    UNMAPPED_CREW: 0,
    UNSTABLE_IDENTITY: 0,
    TIMEZONE_UNRESOLVED: 0,
    MANUAL_CONFLICT: 0,
    SOURCE_CHANGED: 0,
  };

  let attempted = 0;
  let processed = 0;
  let failed = 0;
  let unmapped = 0;
  let fatalError: string | null = null;

  try {
    const config = await getSigvoosConfig(
      db,
      tenantId,
      {
        base_url: SIGVOOS_DEFAULT_BASE_URL,
        system: SIGVOOS_DEFAULT_SYSTEM,
      },
      runtimeEnv,
    );

    const client: SigvoosSyncClient = deps?.createClient
      ? deps.createClient(config as ClientSigvoosConfig)
      : new SigvoosApiClient(config as ClientSigvoosConfig);

    await client.authenticate();

    const pageSize = input.pageSize || SHADOW_PAGE_SIZE;
    const maxPages = input.maxPages || SHADOW_MAX_PAGES_DEFAULT;
    const rawRecords: Record<string, unknown>[] = [];

    for (const window of buildSigvoosMonthlyWindows(input.from, input.to)) {
      for (let page = 1; page <= maxPages; page++) {
        const payload = await client.postSearch('/relatorios/voos/tripulantes/etapas/pesquisa', {
          date_start: window.from,
          date_finish: window.to,
          page,
          page_size: pageSize,
          limit: pageSize,
        });
        const pageItems = getArrayPayload(payload.data ?? payload);
        rawRecords.push(...pageItems);
        if (shouldStopSigvoosPaging(page, pageItems.length, pageSize)) break;
      }
    }

    const normalized = rawRecords
      .map((item) => normalizeSigvoosRecord(item))
      .filter((item): item is SigvoosNormalizedLeg => Boolean(item));

    const seenIdentityKeys: string[] = [];

    for (const leg of normalized) {
      attempted += 1;
      try {
        const identity = await buildLegIdentity(leg);
        seenIdentityKeys.push(identity.identityKey);

        const fingerprint = await sha256Hex(stableStringify(fingerprintFields(leg)));
        const normalizedJson = JSON.stringify(leg);
        const crew = await resolveCrewForLeg(db, tenantId, leg);
        if (crew.method === 'NAO_ENCONTRADO') unmapped += 1;

        const timezoneStatus = input.resolveTimezone
          ? (await input.resolveTimezone(tenantId, leg.data)) !== null
            ? 'RESOLVED'
            : 'TIMEZONE_UNRESOLVED'
          : 'TIMEZONE_UNRESOLVED';

        const existing = await findExistingActiveLeg(db, tenantId, identity.identityKey);
        let sourceChanged = false;
        const seenAt = now();

        if (!existing) {
          await db
            .prepare(
              `INSERT INTO sigvoos_shadow_legs
                (id, empresa_id, run_id, flight_report_id, leg_number, external_identity_quality,
                 identity_key, source_fingerprint, raw_hash, normalized_json, source_state,
                 crew_resolution_method, crew_funcionario_id, timezone_status,
                 first_seen_at, last_seen_at, active, deleted_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'ACTIVE', ?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
            )
            .bind(
              generateId(),
              tenantId,
              runId,
              leg.flightReportId,
              leg.legNumber,
              identity.quality,
              identity.identityKey,
              fingerprint,
              normalizedJson,
              crew.method,
              crew.funcionarioId,
              timezoneStatus,
              seenAt,
              seenAt,
              seenAt,
              seenAt,
            )
            .run();
          await db
            .prepare(
              `INSERT INTO sigvoos_shadow_leg_history
                (id, empresa_id, leg_id, run_id, source_fingerprint, normalized_json, transition,
                 field_differences_json, recorded_at)
               SELECT ?, ?, id, ?, ?, ?, 'CREATED', NULL, ?
                 FROM sigvoos_shadow_legs WHERE empresa_id = ? AND identity_key = ? AND active = 1`,
            )
            .bind(generateId(), tenantId, runId, fingerprint, normalizedJson, seenAt, tenantId, identity.identityKey)
            .run();
        } else if (existing.source_fingerprint === fingerprint) {
          // Same identity, same content — idempotent no-op besides last_seen_at.
          await db
            .prepare(
              `UPDATE sigvoos_shadow_legs
                  SET last_seen_at = ?, run_id = ?, updated_at = ?
                WHERE id = ? AND empresa_id = ?`,
            )
            .bind(seenAt, runId, seenAt, existing.id, tenantId)
            .run();
        } else {
          sourceChanged = true;
          const before = JSON.parse(existing.normalized_json) as SigvoosNormalizedLeg;
          const beforeFields = fingerprintFields(before);
          const afterFields = fingerprintFields(leg);
          const diffs: Record<string, { before: unknown; after: unknown }> = {};
          for (const key of Object.keys(afterFields)) {
            const beforeVal = beforeFields[key] ?? null;
            const afterVal = afterFields[key] ?? null;
            if (beforeVal !== afterVal) diffs[key] = { before: beforeVal, after: afterVal };
          }
          await db
            .prepare(
              `UPDATE sigvoos_shadow_legs
                  SET source_fingerprint = ?, normalized_json = ?, source_state = 'SOURCE_CHANGED',
                      crew_resolution_method = ?, crew_funcionario_id = ?, timezone_status = ?,
                      last_seen_at = ?, run_id = ?, updated_at = ?
                WHERE id = ? AND empresa_id = ?`,
            )
            .bind(
              fingerprint,
              normalizedJson,
              crew.method,
              crew.funcionarioId,
              timezoneStatus,
              seenAt,
              runId,
              seenAt,
              existing.id,
              tenantId,
            )
            .run();
          await db
            .prepare(
              `INSERT INTO sigvoos_shadow_leg_history
                (id, empresa_id, leg_id, run_id, source_fingerprint, normalized_json, transition,
                 field_differences_json, recorded_at)
               VALUES (?, ?, ?, ?, ?, ?, 'SOURCE_CHANGED', ?, ?)`,
            )
            .bind(
              generateId(),
              tenantId,
              existing.id,
              runId,
              fingerprint,
              normalizedJson,
              JSON.stringify(diffs),
              seenAt,
            )
            .run();
        }

        const manualConflict = input.detectManualConflict
          ? await input.detectManualConflict(tenantId, identity.identityKey)
          : false;

        const comparableLeg: ShadowComparableLeg = {
          flightReportId: leg.flightReportId,
          legNumber: leg.legNumber,
          funcionarioId: crew.funcionarioId,
          engineStartTime: leg.engineStartTime,
          takeoffTime: leg.takeoffTime,
          landingTime: leg.landingTime,
          engineShutoffTime: leg.engineShutoffTime,
          departureIcao: leg.departureIcao,
          arrivalIcao: leg.arrivalIcao,
          dayLandings: leg.dayLandings,
          nightLandings: leg.nightLandings,
          starts: leg.starts,
          matriculaAeronave: leg.matriculaAeronave,
        };

        const result = classifyShadowComparison({
          identityQuality: identity.quality,
          timezoneStatus,
          crewResolutionMethod: crew.method,
          sourceChanged,
          manualConflict,
          // Fase 0 has no independent read of the operational frms_jornada
          // row wired in here (out of scope — see spec section 4/8); the
          // comparator is exercised directly against direct-path fixtures
          // in tests. In production shadow runs this compares the shadow
          // leg against itself, which is intentionally always MATCH/absent
          // unless one of the fail-closed classifications above already
          // applied — it never fabricates a DIFF_CRITICAL from nothing.
          direct: comparableLeg,
          shadow: comparableLeg,
        });

        classifications[result.classification] += 1;

        await db
          .prepare(
            `INSERT INTO sigvoos_shadow_comparisons
              (id, empresa_id, run_id, identity_key, funcionario_id, competencia_data,
               classification, direct_fingerprint, shadow_fingerprint, field_differences_json,
               compared_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            generateId(),
            tenantId,
            runId,
            identity.identityKey,
            crew.funcionarioId,
            leg.data,
            result.classification,
            fingerprint,
            fingerprint,
            JSON.stringify(result.fieldDifferences),
            seenAt,
            seenAt,
          )
          .run();

        processed += 1;

        // Checkpoint only advances after persistence AND comparison above.
        await db
          .prepare(`UPDATE sigvoos_shadow_runs SET cursor_json = ?, updated_at = ? WHERE id = ? AND empresa_id = ?`)
          .bind(JSON.stringify({ lastIdentityKey: identity.identityKey, attempted, processed }), now(), runId, tenantId)
          .run();
      } catch (legError) {
        failed += 1;
        const msg = legError instanceof Error ? legError.message : String(legError);
        await db
          .prepare(
            `UPDATE sigvoos_shadow_runs SET error_summary = ?, updated_at = ? WHERE id = ? AND empresa_id = ?`,
          )
          .bind(`leg_error: ${msg}`.slice(0, 500), now(), runId, tenantId)
          .run();
      }
    }

    await reconcileMissingLegs(db, tenantId, runId, input.from, input.to, seenIdentityKeys);
  } catch (error) {
    fatalError = error instanceof Error ? error.message : String(error);
  }

  const finalStatus: SigvoosShadowRunStatus = fatalError
    ? 'FAILED'
    : failed > 0
      ? 'PARTIAL'
      : 'COMPLETE';

  const completedAt = now();
  await db
    .prepare(
      `UPDATE sigvoos_shadow_runs
          SET status = ?, attempted_count = ?, processed_count = ?, failed_count = ?,
              unmapped_count = ?, error_summary = COALESCE(?, error_summary),
              completed_at = ?, updated_at = ?
        WHERE id = ? AND empresa_id = ?`,
    )
    .bind(finalStatus, attempted, processed, failed, unmapped, fatalError, completedAt, completedAt, runId, tenantId)
    .run();

  return {
    runId,
    empresaId: tenantId,
    status: finalStatus,
    from: input.from,
    to: input.to,
    attempted,
    processed,
    failed,
    unmapped,
    classifications,
  };
}

/**
 * Marks previously-ACTIVE legs whose identity was not seen in this run as
 * MISSING_FROM_SOURCE. Never a hard delete — the row and its full history
 * stay in place; only `source_state` changes and a history entry is added.
 * Scoped strictly to legs first captured within [from, to] for this tenant,
 * so a shadow run over a narrow window never marks unrelated-period legs.
 */
async function reconcileMissingLegs(
  db: D1Database,
  empresaId: number,
  runId: string,
  from: string,
  to: string,
  seenIdentityKeys: string[],
): Promise<void> {
  const rows = await db
    .prepare(
      `SELECT id, identity_key, source_fingerprint, normalized_json
         FROM sigvoos_shadow_legs
        WHERE empresa_id = ? AND active = 1 AND source_state != 'MISSING_FROM_SOURCE'
          AND json_extract(normalized_json, '$.data') >= ? AND json_extract(normalized_json, '$.data') <= ?`,
    )
    .bind(empresaId, from, to)
    .all<{ id: string; identity_key: string; source_fingerprint: string; normalized_json: string }>();

  const seen = new Set(seenIdentityKeys);
  const timestamp = now();
  for (const row of rows.results || []) {
    if (seen.has(row.identity_key)) continue;
    await db
      .prepare(
        `UPDATE sigvoos_shadow_legs SET source_state = 'MISSING_FROM_SOURCE', updated_at = ? WHERE id = ? AND empresa_id = ?`,
      )
      .bind(timestamp, row.id, empresaId)
      .run();
    await db
      .prepare(
        `INSERT INTO sigvoos_shadow_leg_history
          (id, empresa_id, leg_id, run_id, source_fingerprint, normalized_json, transition,
           field_differences_json, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, 'MISSING_FROM_SOURCE', NULL, ?)`,
      )
      .bind(generateId(), empresaId, row.id, runId, row.source_fingerprint, row.normalized_json, timestamp)
      .run();
  }
}
