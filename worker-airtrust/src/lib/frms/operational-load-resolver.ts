/**
 * Resolves the two inputs of Operational Load V2 for a single FRMS journey:
 *
 * - landings: SIGVOOS `pousos_diurnos + pousos_noturnos`, deduplicated by
 *   physical leg (distinct `cv_voo_etapas.id`), so two crew rows for the same
 *   leg are never double-counted;
 * - observed temperature: the max ambient METAR temperature already derived by
 *   the REDEMET/IOGP evidence pipeline and persisted per journey in
 *   `frms_jornada_avaliacoes.environmental_json`.
 *
 * A zero-row Controle de Voos result is not, by itself, positive evidence of
 * a no-flight day: the tenant/day may simply not have been imported yet. Until
 * coverage is explicitly proven, zero rows fail closed as SIGVOOS_UNAVAILABLE
 * so missing source data can never masquerade as confirmed compliance.
 */

import { computeOperationalLoadV2, type LandingsEvidenceQuality, type OperationalLoadV2Result } from './operational-load';
import type { FrmsOperationalPolicyV2, ImcLegInput } from './operational-policy-v2';

export type JornadaLandingsSource =
  | 'SIGVOOS_OBSERVED'
  | 'SIGVOOS_CONFIRMED_ZERO'
  | 'SIGVOOS_UNAVAILABLE';

export interface JornadaLandingsResult {
  landingsCount: number;
  source: JornadaLandingsSource;
}

export async function resolveJornadaLandings(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  dataYmd: string,
): Promise<JornadaLandingsResult> {
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    return { landingsCount: 0, source: 'SIGVOOS_UNAVAILABLE' };
  }
  if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
    return { landingsCount: 0, source: 'SIGVOOS_UNAVAILABLE' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataYmd)) {
    return { landingsCount: 0, source: 'SIGVOOS_UNAVAILABLE' };
  }

  try {
    const row = await db
      .prepare(
        `SELECT
           COALESCE(SUM(COALESCE(leg.pousos_diurnos, 0) + COALESCE(leg.pousos_noturnos, 0)), 0) AS landings,
           COUNT(*) AS legs
         FROM (
           SELECT DISTINCT e.id AS id, e.pousos_diurnos AS pousos_diurnos, e.pousos_noturnos AS pousos_noturnos
             FROM cv_voo_tripulantes t
             INNER JOIN cv_voos v
               ON v.id = t.voo_id AND v.empresa_id = t.empresa_id AND v.deleted_at IS NULL
             INNER JOIN cv_voo_etapas e
               ON e.id = t.etapa_id AND e.empresa_id = t.empresa_id AND e.deleted_at IS NULL
            WHERE t.empresa_id = ?
              AND t.funcionario_id = ?
              AND v.data_programacao = ?
              AND t.deleted_at IS NULL
         ) AS leg`,
      )
      .bind(empresaId, funcionarioId, dataYmd)
      .first<{ landings: number; legs: number }>();

    const legs = Number(row?.legs || 0);
    if (legs === 0) {
      return { landingsCount: 0, source: 'SIGVOOS_UNAVAILABLE' };
    }
    const landings = Number(row?.landings || 0);
    return {
      landingsCount: Number.isFinite(landings) && landings > 0 ? Math.round(landings) : 0,
      source: 'SIGVOOS_OBSERVED',
    };
  } catch {
    // Older environments or an unavailable source must remain explicitly incomplete.
    return { landingsCount: 0, source: 'SIGVOOS_UNAVAILABLE' };
  }
}

/**
 * Max ambient METAR temperature (°C) for the journey, taken from the persisted
 * IOGP/REDEMET evidence snapshot. Returns null unless the snapshot's weather
 * source is genuinely observed (DECEA_REDEMET or MIXED) and the value is finite.
 */
export async function readPersistedObservedTemperatureMaxC(
  db: D1Database,
  empresaId: number,
  jornadaId: string,
): Promise<number | null> {
  if (!Number.isInteger(empresaId) || empresaId <= 0) return null;
  if (typeof jornadaId !== 'string' || jornadaId.length === 0) return null;

  try {
    const row = await db
      .prepare(
        `SELECT environmental_json
           FROM frms_jornada_avaliacoes
          WHERE jornada_id = ? AND empresa_id = ?
          ORDER BY created_at DESC
          LIMIT 1`,
      )
      .bind(jornadaId, empresaId)
      .first<{ environmental_json: string | null }>();

    if (!row?.environmental_json) return null;
    const parsed = JSON.parse(row.environmental_json) as {
      maxAmbientTempC?: unknown;
      weatherSource?: unknown;
    };
    const weatherSource = String(parsed.weatherSource ?? '');
    if (weatherSource !== 'DECEA_REDEMET' && weatherSource !== 'MIXED') return null;
    const temp = Number(parsed.maxAmbientTempC);
    return Number.isFinite(temp) ? temp : null;
  } catch {
    return null;
  }
}

export async function readPersistedImcLegs(
  db: D1Database,
  empresaId: number,
  jornadaId: string,
): Promise<ImcLegInput[]> {
  try {
    const row = await db.prepare(
      `SELECT evidence_hash FROM frms_jornada_avaliacoes
       WHERE jornada_id = ? AND empresa_id = ? ORDER BY created_at DESC LIMIT 1`,
    ).bind(jornadaId, empresaId).first<{ evidence_hash: string | null }>();
    if (!row?.evidence_hash) return [];
    const parsed = JSON.parse(row.evidence_hash) as {
      weatherEvents?: Array<{ legId?: unknown; phase?: unknown; rawMetar?: unknown; stationIcao?: unknown; observedAtUtc?: unknown; eventAtUtc?: unknown }>;
    };
    const grouped = new Map<string, ImcLegInput>();
    for (const event of parsed.weatherEvents ?? []) {
      const legId = typeof event.legId === 'string' ? event.legId : null;
      if (!legId) continue;
      const current = grouped.get(legId) ?? { legId };
      const raw = typeof event.rawMetar === 'string' ? event.rawMetar : null;
      const station = typeof event.stationIcao === 'string' ? event.stationIcao : null;
      const observed = typeof event.observedAtUtc === 'string' ? event.observedAtUtc : null;
      const eventAt = typeof event.eventAtUtc === 'string' ? event.eventAtUtc : null;
      if (event.phase === 'DEPARTURE') {
        current.departureRawMetar = raw; current.departureStationIcao = station;
        current.departureObservedAtUtc = observed; current.departureEventAtUtc = eventAt;
      }
      if (event.phase === 'ARRIVAL') {
        current.arrivalRawMetar = raw; current.arrivalStationIcao = station;
        current.arrivalObservedAtUtc = observed; current.arrivalEventAtUtc = eventAt;
      }
      grouped.set(legId, current);
    }
    return [...grouped.values()];
  } catch { return []; }
}

function mapLandingsEvidenceQuality(source: JornadaLandingsSource): LandingsEvidenceQuality {
  if (source === 'SIGVOOS_OBSERVED') return 'OBSERVED';
  if (source === 'SIGVOOS_CONFIRMED_ZERO') return 'CONFIRMED_ZERO';
  return 'INCOMPLETE';
}

/**
 * Convenience: resolve landings + observed temperature and run the V1 model.
 * Confirmed zero-flight days deliberately skip weather lookup: flight thermal
 * exposure is not inferred when there was no flight operation.
 */
export async function resolveOperationalLoadForJornada(
  db: D1Database,
  input: { empresaId: number; funcionarioId: number; dataYmd: string; jornadaId: string; policy: FrmsOperationalPolicyV2; policyVersion: string },
): Promise<OperationalLoadV2Result & { landings_source: JornadaLandingsSource }> {
  const landings = await resolveJornadaLandings(
    db,
    input.empresaId,
    input.funcionarioId,
    input.dataYmd,
  );
  const temperatureMaxC =
    landings.source === 'SIGVOOS_CONFIRMED_ZERO'
      ? null
      : await readPersistedObservedTemperatureMaxC(db, input.empresaId, input.jornadaId);
  const imcLegs = landings.source === 'SIGVOOS_CONFIRMED_ZERO' ? [] : await readPersistedImcLegs(db, input.empresaId, input.jornadaId);
  const result = computeOperationalLoadV2({
    landingsCount: landings.landingsCount,
    landingsEvidenceQuality: mapLandingsEvidenceQuality(landings.source),
    temperatureMaxC,
    imcLegs,
    policy: input.policy,
    policyVersion: input.policyVersion,
  });
  return { ...result, landings_source: landings.source };
}
