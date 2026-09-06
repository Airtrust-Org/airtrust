/**
 * AirTrust FRMS IOGP — shadow pipeline caller.
 *
 * This is the integration point between the canonical FRMS engine and the
 * IOGP/REDEMET evidence pipeline. It is called from `reprocessarTripulanteCompleto`
 * after a provisional canonical calculation produces fatorizacao + acumulo.
 *
 * Same-run convergence invariant:
 *   provisional canonical result
 *           ↓
 *   runFrmsIogpShadowForJornada()
 *           ↓
 *   SIGVOOS + location/timezone + historical REDEMET evidence
 *           ↓
 *   persist frms_jornada_avaliacoes
 *           ↓
 *   one FINAL canonical recalculation (no second shadow call)
 *
 * This controlled two-pass prevents newly collected observed temperature from
 * being delayed until a later cron/reprocess run.
 *
 * Feature OFF contract:
 *   - isFrmsIogpShadowModeEnabledForTenant() → false → returns null immediately.
 *   - Zero SQL against frms_jornada_avaliacoes / frms_location_catalog.
 *   - Zero REDEMET calls.
 *   - Zero changes to fatorizacao, acumulo, alertas, or bloqueado.
 *
 * Failure isolation:
 *   - Shadow/evidence failures are caught by the caller and never invalidate the
 *     already persisted provisional canonical result.
 *   - The final convergence recalculation is best-effort after evidence persistence.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { LIMITES_DEFAULT, type FrmsJornada } from './types';
import {
  isFrmsIogpShadowModeEnabledForTenant,
  type FrmsIogpShadowFlagEnv,
} from './frms-iogp-shadow-flag';
import { runFrmsIogpShadowPipeline, type FrmsIogpShadowRawLeg } from './frms-iogp-shadow-pipeline';
import { buildIogpComplianceEvaluations } from './frms-iogp-compliance-builder';
import { mapEffectivenessNivelToBiologicalLevel } from './frms-iogp-biological-adapter';
import { persistFrmsJornadaAvaliacao } from './frms-jornada-avaliacoes-repository';
import { RedemetClient } from './redemet-weather';
import type { FrmsLocationCatalogEntry } from './location-catalog';

/** Shape that the pipeline result (from recalcularPipeline) provides. */
export interface FrmsCanonicalPipelineResult {
  acumulo: {
    hv_dia_min: number;
    hv_7_dias_min: number;
    hv_28_dias_min: number;
    hv_365_dias_min: number;
  };
  fatorizacao: {
    effectiveness_nivel?: string | null;
    effectiveness_pct?: number | null;
  };
}

/** Environment shape required by the shadow caller. */
export interface FrmsIogpShadowCallerEnv extends FrmsIogpShadowFlagEnv {
  REDEMET_API_KEY?: string;
}

/** Minimal CV jornada leg row needed to build FrmsIogpShadowRawLeg. */
interface CvLegRow {
  external_id_sigvoos: number | null;
  sigvoos_leg_number: number | null;
  data_operacional: string;
  origem_icao: string | null;
  destino_icao: string | null;
  takeoff_time: string | null;
  landing_time: string | null;
  pousos_diurnos: number | null;
  pousos_noturnos: number | null;
  metadata_sigvoos_json: string | null;
}

function buildRedemetClientFromEnv(env: FrmsIogpShadowCallerEnv): RedemetClient | null {
  if (!env.REDEMET_API_KEY) return null;
  try {
    return new RedemetClient({ apiKey: env.REDEMET_API_KEY });
  } catch (error) {
    // A missing/failed funcionarios lookup is not evidence that the tripulante
    // has no tenant. Let the caller's existing shadow isolation log the failure.
    throw error;
  }
}

function isMissingOptionalSchemaError(error: unknown, tableNames: string[]): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  if (!normalized.includes('no such table:')) return false;
  return tableNames.some((table) => normalized.includes(table.toLowerCase()));
}

/**
 * Reads SIGVOOS legs for a specific tripulante + data from the Controle de Voos
 * tables (cv_voo_tripulantes → cv_voo_etapas), scoped strictly to empresaId.
 *
 * Returns [] if no rows exist — the shadow pipeline treats this as "no legs"
 * and returns { enabled: false } gracefully.
 */
async function fetchSigvoosLegsForJornada(
  db: D1Database,
  empresaId: number,
  tripulanteId: number,
  data: string,
): Promise<CvLegRow[]> {
  try {
    const result = await db
      .prepare(
        `SELECT
           v.sigvoos_flight_report_id AS external_id_sigvoos,
           e.sigvoos_leg_number       AS sigvoos_leg_number,
           v.data_programacao         AS data_operacional,
           COALESCE(e.origem_icao, ao.codigo_icao, ao.codigo)  AS origem_icao,
           COALESCE(e.destino_icao, ad.codigo_icao, ad.codigo) AS destino_icao,
           e.horario_decolagem        AS takeoff_time,
           e.horario_pouso            AS landing_time,
           e.pousos_diurnos           AS pousos_diurnos,
           e.pousos_noturnos          AS pousos_noturnos,
           e.metadata_sigvoos_json    AS metadata_sigvoos_json
         FROM cv_voo_tripulantes t
         INNER JOIN cv_voos v
           ON v.id = t.voo_id
          AND v.empresa_id = t.empresa_id
          AND v.deleted_at IS NULL
         INNER JOIN cv_voo_etapas e
           ON e.id = t.etapa_id
          AND e.empresa_id = t.empresa_id
          AND e.deleted_at IS NULL
         LEFT JOIN cv_aeroportos ao
           ON ao.id = v.origem_id AND ao.empresa_id = v.empresa_id AND ao.deleted_at IS NULL
         LEFT JOIN cv_aeroportos ad
           ON ad.id = v.destino_id AND ad.empresa_id = v.empresa_id AND ad.deleted_at IS NULL
         WHERE t.empresa_id = ?
           AND t.funcionario_id = ?
           AND v.data_programacao = ?
           AND t.deleted_at IS NULL
         ORDER BY COALESCE(e.numero_etapa, 0) ASC, t.id ASC`,
      )
      .bind(empresaId, tripulanteId, data)
      .all<CvLegRow>();
    return result.results ?? [];
  } catch (error) {
    // Older environments may legitimately predate the Controle de Voos schema.
    // Only that explicit compatibility case is treated as "no legs". Operational
    // D1 failures (AUTH, IO, malformed schema, etc.) must remain observable.
    if (
      isMissingOptionalSchemaError(error, [
        'cv_voo_tripulantes',
        'cv_voos',
        'cv_voo_etapas',
        'cv_aeroportos',
      ])
    ) {
      return [];
    }
    throw error;
  }
}

/**
 * Reads tenant-scoped location catalog from frms_location_catalog (migration 0463).
 * Returns [] if the table doesn't exist (feature flag was off when migration was skipped).
 */
async function fetchLocationCatalog(
  db: D1Database,
  empresaId: number,
): Promise<FrmsLocationCatalogEntry[]> {
  try {
    const result = await db
      .prepare(
        `SELECT
           location_code  AS code,
           operational_class AS operationalClass,
           timezone_iana  AS timezoneIana,
           weather_source_kind AS weatherSourceKind,
           redemet_station_icao AS redemetStationIcao,
           active
         FROM frms_location_catalog
         WHERE empresa_id = ?
           AND active = 1
           AND deleted_at IS NULL`,
      )
      .bind(empresaId)
      .all<{
        code: string;
        operationalClass: string;
        timezoneIana: string | null;
        weatherSourceKind: string;
        redemetStationIcao: string | null;
        active: number;
      }>();
    return (result.results ?? []).map((row) => ({
      code: row.code,
      operationalClass: row.operationalClass as FrmsLocationCatalogEntry['operationalClass'],
      timezoneIana: row.timezoneIana,
      weatherSourceKind: row.weatherSourceKind as FrmsLocationCatalogEntry['weatherSourceKind'],
      redemetStationIcao: row.redemetStationIcao,
      active: row.active === 1,
    }));
  } catch (error) {
    // Compatibility only: an environment that predates migration 0463 has no
    // catalog. Do not collapse unrelated D1 failures into an empty catalog.
    if (isMissingOptionalSchemaError(error, ['frms_location_catalog'])) {
      return [];
    }
    throw error;
  }
}

function buildRawLeg(row: CvLegRow, index: number): FrmsIogpShadowRawLeg {
  let raw: Record<string, unknown> = {};
  if (row.metadata_sigvoos_json) {
    try {
      raw = JSON.parse(row.metadata_sigvoos_json) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }

  return {
    data: row.data_operacional,
    horasVooMin:
      row.takeoff_time && row.landing_time
        ? (() => {
            const parse = (v: string) => {
              const m = v.match(/^(\d{1,2}):(\d{2})/);
              return m ? Number(m[1]) * 60 + Number(m[2]) : null;
            };
            const dep = parse(row.takeoff_time);
            const arr = parse(row.landing_time);
            return dep != null && arr != null && arr >= dep ? arr - dep : 0;
          })()
        : 0,
    departureIcao: row.origem_icao,
    arrivalIcao: row.destino_icao,
    takeoffTime: row.takeoff_time,
    landingTime: row.landing_time,
    dayLandings: row.pousos_diurnos,
    nightLandings: row.pousos_noturnos,
    flightReportId: row.external_id_sigvoos != null ? String(row.external_id_sigvoos) : null,
    legNumber: row.sigvoos_leg_number,
    raw: { ...raw, _cv_row_index: index },
  };
}

/**
 * Resolves the empresa_id for a tripulante. Returns null if not found.
 * Used to scope the shadow evaluation correctly.
 */
async function resolveEmpresaId(
  db: D1Database,
  tripulanteId: number,
  hintEmpresaId: number | null,
): Promise<number | null> {
  if (hintEmpresaId != null && hintEmpresaId > 0) return hintEmpresaId;
  try {
    const row = await db
      .prepare('SELECT empresa_id FROM funcionarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(tripulanteId)
      .first<{ empresa_id: number | null }>();
    return row?.empresa_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Runs the IOGP evidence evaluation for a specific jornada after the provisional
 * canonical pipeline has completed. If evidence is persisted, exactly one final
 * canonical recalculation is performed so that newly observed REDEMET temperature
 * is reflected in effectiveness during the same processing run.
 */
export async function runFrmsIogpShadowForJornada(
  db: D1Database,
  jornada: Pick<FrmsJornada, 'id' | 'tripulante_id' | 'data' | 'status' | 'origem'>,
  canonical: FrmsCanonicalPipelineResult,
  env: FrmsIogpShadowCallerEnv,
  hintEmpresaId: number | null,
): Promise<null> {
  // ── Feature gate (fail fast, zero side effects when OFF) ──────────────────
  const empresaId = await resolveEmpresaId(db, jornada.tripulante_id, hintEmpresaId);
  if (empresaId == null) return null;

  if (!isFrmsIogpShadowModeEnabledForTenant(env, empresaId)) {
    return null;
  }

  // ── Build inputs from canonical results ───────────────────────────────────
  const biologicalLevel = mapEffectivenessNivelToBiologicalLevel(
    canonical.fatorizacao.effectiveness_nivel,
  );

  const complianceEvaluations = buildIogpComplianceEvaluations({
    hv_dia_min: canonical.acumulo.hv_dia_min,
    hv_7_dias_min: canonical.acumulo.hv_7_dias_min,
    hv_28_dias_min: canonical.acumulo.hv_28_dias_min,
    hv_365_dias_min: canonical.acumulo.hv_365_dias_min,
  });

  // ── Fetch SIGVOOS legs (per-leg physical flights) ─────────────────────────
  const cvRows = await fetchSigvoosLegsForJornada(
    db,
    empresaId,
    jornada.tripulante_id,
    jornada.data,
  );

  if (cvRows.length === 0) {
    // No legs available: shadow pipeline would have nothing to evaluate.
    return null;
  }

  const rawSigvoosLegs = cvRows.map(buildRawLeg);

  // ── Location catalog (from frms_location_catalog if migration applied) ────
  const locationCatalogue = await fetchLocationCatalog(db, empresaId);

  // ── REDEMET client (null if not configured — shadow still runs, no weather) ─
  const redemetClient = buildRedemetClientFromEnv(env);

  // ── Run shadow/evidence pipeline ──────────────────────────────────────────
  const result = await runFrmsIogpShadowPipeline({
    env,
    tenantId: empresaId,
    tripulanteId: jornada.tripulante_id,
    jornadaId: jornada.id,
    dataOperacional: jornada.data,
    naturezaDado: 'JORNADA_REALIZADA',
    rawSigvoosLegs,
    locationCatalogue,
    tenantOperationalTimezoneIana: null, // resolved per-location from catalog
    redemetClient,
    complianceEvaluations,
    regulatoryProfileReady: false, // Phase 1 shadow: profile not yet DB-linked
    regulatoryProfileCode: null,
    regulatoryProfileReference: null,
    biologicalLevel,
  });

  if (!result.enabled) return null;

  // ── Persist evidence snapshot BEFORE the final effectiveness pass ──────────
  await persistFrmsJornadaAvaliacao(db, empresaId, result.snapshot);

  // Controlled two-pass convergence. Dynamic import avoids a static module cycle:
  // db-service-jornadas imports this caller, while the final pass needs its
  // recalcularPipeline. The second pass does NOT call the shadow pipeline again.
  try {
    const { recalcularPipeline } = await import('./db-service-jornadas');
    await recalcularPipeline(db, jornada as FrmsJornada, LIMITES_DEFAULT);
  } catch (error) {
    console.warn('[FRMS] Final canonical convergence after REDEMET evidence failed', {
      jornadaId: jornada.id,
      error: error instanceof Error ? error.message : String(error ?? ''),
    });
  }

  return null;
}
