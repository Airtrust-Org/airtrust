/**
 * FRMS Operational Load V1 — landings + thermal exposure component of the
 * canonical effectiveness score.
 *
 * WHY THIS EXISTS
 * ICAO FRMS guidance treats operational workload as a fatigue factor and
 * recognises the number of sectors/segments as relevant. IOGP 690-2 asks for
 * additional restrictions on particularly demanding operations, including
 * multiple short offshore shuttles and extreme temperatures. Short-haul
 * literature links sector count to workload/fatigue, and the thermal
 * environment can raise physiological/cognitive load.
 *
 * POLICY STATUS — `OPERATIONAL_POLICY_V1`
 * The coefficients below are AirTrust internal policy values approved by the
 * system owner after a scientific benchmark. They are NOT prescribed by
 * ICAO or IOGP. They are deliberately conservative, versioned, and meant to
 * be re-calibrated against PVT/KSS and longitudinal AirTrust data. Any change
 * to the numbers must bump `OPERATIONAL_LOAD_POLICY_V1.version`.
 *
 * SCOPE
 * - Landings come from SIGVOOS (`pousos_diurnos + pousos_noturnos`),
 *   deduplicated by physical leg. There is NO extra night-landing penalty:
 *   night exposure is already captured by the circadian component and we do
 *   not want to double count it.
 * - Temperature comes from observed METAR/SPECI evidence (REDEMET). When no
 *   observed temperature is available the thermal delta is 0 and the result
 *   is flagged `data_quality = 'INCOMPLETE'` — a missing METAR is never read
 *   as 0 °C or as a comfortable temperature.
 * - Recovery (`frms_recovery_*`) is a different dimension and is untouched;
 *   `effectiveness_delta_pct` there stays NULL.
 */

export const OPERATIONAL_LOAD_POLICY_V1 = {
  version: 'operational-policy-v1' as const,
  /** Points are subtracted from the 100-point effectiveness baseline. */
  landings: [
    { minInclusive: 0, maxInclusive: 2, deltaPoints: 0 },
    { minInclusive: 3, maxInclusive: 3, deltaPoints: -1 },
    { minInclusive: 4, maxInclusive: 4, deltaPoints: -2 },
    { minInclusive: 5, maxInclusive: 5, deltaPoints: -3 },
    { minInclusive: 6, maxInclusive: Number.POSITIVE_INFINITY, deltaPoints: -4 },
  ],
  /** Observed METAR max temperature (°C) bands. */
  temperature: [
    { minInclusive: Number.NEGATIVE_INFINITY, maxExclusive: 30, deltaPoints: 0 },
    { minInclusive: 30, maxExclusive: 32, deltaPoints: -0.5 },
    { minInclusive: 32, maxExclusive: 34, deltaPoints: -1 },
    { minInclusive: 34, maxExclusive: 36, deltaPoints: -1.5 },
    { minInclusive: 36, maxExclusive: Number.POSITIVE_INFINITY, deltaPoints: -2 },
  ],
  /** Combined operational-load floor (most negative it can reach). */
  combinedFloorPoints: -6,
} as const;

export type WeatherEvidenceQuality = 'OBSERVED' | 'INCOMPLETE';
export type OperationalLoadDataQuality = 'COMPLETE' | 'INCOMPLETE';

export interface OperationalLoadV1Input {
  /** Deduplicated SIGVOOS landings for the journey/day. */
  landingsCount: number;
  /**
   * Max observed METAR/SPECI temperature in °C associated with the operation,
   * or null when no observed weather evidence is available.
   */
  temperatureMaxC: number | null;
}

export interface OperationalLoadV1Result {
  policy_version: typeof OPERATIONAL_LOAD_POLICY_V1.version;
  landings_count: number;
  temperature_max_c: number | null;
  weather_evidence_quality: WeatherEvidenceQuality;
  data_quality: OperationalLoadDataQuality;
  operational_load_landings_delta: number;
  operational_load_temperature_delta: number;
  /** Combined delta in points, already clamped to the policy floor. */
  operational_load_total_delta: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function landingsDeltaPoints(landingsCount: number): number {
  const count =
    Number.isFinite(landingsCount) && landingsCount > 0 ? Math.floor(landingsCount) : 0;
  for (const band of OPERATIONAL_LOAD_POLICY_V1.landings) {
    if (count >= band.minInclusive && count <= band.maxInclusive) return band.deltaPoints;
  }
  return 0;
}

export function temperatureDeltaPoints(temperatureMaxC: number | null): number {
  if (temperatureMaxC == null || !Number.isFinite(temperatureMaxC)) return 0;
  for (const band of OPERATIONAL_LOAD_POLICY_V1.temperature) {
    if (temperatureMaxC >= band.minInclusive && temperatureMaxC < band.maxExclusive) {
      return band.deltaPoints;
    }
  }
  return 0;
}

/**
 * Pure V1 model. No I/O. `temperatureMaxC = null` keeps the thermal delta at 0
 * and marks the result INCOMPLETE — never invented.
 */
export function computeOperationalLoadV1(input: OperationalLoadV1Input): OperationalLoadV1Result {
  const landingsCount =
    Number.isFinite(input.landingsCount) && input.landingsCount > 0
      ? Math.floor(input.landingsCount)
      : 0;
  const hasObservedTemperature =
    input.temperatureMaxC != null && Number.isFinite(input.temperatureMaxC);
  const temperatureMaxC = hasObservedTemperature ? round1(input.temperatureMaxC as number) : null;

  const landingsDelta = landingsDeltaPoints(landingsCount);
  const temperatureDelta = hasObservedTemperature ? temperatureDeltaPoints(temperatureMaxC) : 0;
  const totalDelta = Math.max(
    OPERATIONAL_LOAD_POLICY_V1.combinedFloorPoints,
    round1(landingsDelta + temperatureDelta),
  );

  return {
    policy_version: OPERATIONAL_LOAD_POLICY_V1.version,
    landings_count: landingsCount,
    temperature_max_c: temperatureMaxC,
    weather_evidence_quality: hasObservedTemperature ? 'OBSERVED' : 'INCOMPLETE',
    data_quality: hasObservedTemperature ? 'COMPLETE' : 'INCOMPLETE',
    operational_load_landings_delta: landingsDelta,
    operational_load_temperature_delta: round1(temperatureDelta),
    operational_load_total_delta: totalDelta,
  };
}

/**
 * Human-readable explainability lines, e.g.
 *   Carga operacional: -3,0
 *     • 4 pousos: -2,0
 *     • temperatura máxima 32 °C: -1,0
 */
export function describeOperationalLoadV1(result: OperationalLoadV1Result): {
  title: string;
  lines: string[];
} {
  const fmt = (points: number) => points.toFixed(1).replace('.', ',');
  const lines: string[] = [];

  lines.push(
    `${result.landings_count} ${result.landings_count === 1 ? 'pouso' : 'pousos'}: ${fmt(
      result.operational_load_landings_delta,
    )}`,
  );

  if (result.weather_evidence_quality === 'OBSERVED' && result.temperature_max_c != null) {
    lines.push(
      `temperatura máxima ${fmt(result.temperature_max_c).replace(',0', '')} °C: ${fmt(
        result.operational_load_temperature_delta,
      )}`,
    );
  } else {
    lines.push('temperatura: evidência meteorológica indisponível (0)');
  }

  return { title: `Carga operacional: ${fmt(result.operational_load_total_delta)}`, lines };
}
