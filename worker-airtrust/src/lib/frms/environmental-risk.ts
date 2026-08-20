/**
 * AirTrust FRMS — Environmental Load / IOGP 690-2 §17C.1.
 *
 * Keeps measured ambient observations separate from derived/estimated indices.
 * METAR temperature is measured evidence; Heat Index/Wind Chill are derived;
 * WBGT is only considered measured when supplied as such by an appropriate
 * sensor/source. No value here is labelled as an ANAC flight limit.
 */

import type { WeatherEvidence, WeatherObservationEvidence } from './redemet-weather';

export type EnvironmentalLevel = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
export type HeatAcclimatization = 'ACCLIMATIZED' | 'UNACCLIMATIZED' | 'UNKNOWN';
export type WorkloadClass = 'LIGHT' | 'MODERATE' | 'HEAVY' | 'VERY_HEAVY' | 'UNKNOWN';

export interface ThermalContextInput {
  evidence: WeatherEvidence[];
  measuredWbgtC?: number | null;
  estimatedWbgtC?: number | null;
  wbgtSourceRef?: string | null;
  workloadClass?: WorkloadClass;
  acclimatization?: HeatAcclimatization;
  exposedMinutes?: number | null;
  climateControlled?: boolean | null;
}

export interface EnvironmentalRiskAssessment {
  level: EnvironmentalLevel;
  maxAmbientTempC: number | null;
  minAmbientTempC: number | null;
  maxRelativeHumidityPct: number | null;
  maxWindSpeedKt: number | null;
  maxHeatIndexC: number | null;
  minWindChillC: number | null;
  wbgtC: number | null;
  wbgtKind: 'MEASURED' | 'ESTIMATED' | 'UNAVAILABLE';
  wbgtThresholdC: number | null;
  wbgtThresholdKind: 'ACTION_LIMIT' | 'THRESHOLD_LIMIT_VALUE' | 'UNAVAILABLE';
  exposedMinutes: number | null;
  climateControlled: boolean | null;
  dataQuality: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT';
  alerts: string[];
  notes: string[];
}

function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}
function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** NOAA/NWS Rothfusz regression. Derived value, never a measured observation. */
export function calculateHeatIndexC(temperatureC: number, relativeHumidityPct: number): number | null {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(relativeHumidityPct)) return null;
  const rh = Math.max(0, Math.min(100, relativeHumidityPct));
  const t = cToF(temperatureC);
  if (t < 80 || rh < 40) return null;

  let hi =
    -42.379 +
    2.04901523 * t +
    10.14333127 * rh -
    0.22475541 * t * rh -
    0.00683783 * t * t -
    0.05481717 * rh * rh +
    0.00122874 * t * t * rh +
    0.00085282 * t * rh * rh -
    0.00000199 * t * t * rh * rh;

  // NWS low/high humidity adjustments for the regression domain.
  if (rh < 13 && t >= 80 && t <= 112) {
    hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
  } else if (rh > 85 && t >= 80 && t <= 87) {
    hi += ((rh - 85) / 10) * ((87 - t) / 5);
  }
  return round1(fToC(hi));
}

/** NWS wind chill formula; valid for cold air and wind > 3 mph. */
export function calculateWindChillC(temperatureC: number, windSpeedKt: number): number | null {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(windSpeedKt)) return null;
  const windMph = windSpeedKt * 1.150779448;
  if (temperatureC > 10 || windMph <= 3) return null;
  const tF = cToF(temperatureC);
  const v16 = Math.pow(windMph, 0.16);
  const wcF = 35.74 + 0.6215 * tF - 35.75 * v16 + 0.4275 * tF * v16;
  return round1(fToC(wcF));
}

const OSHA_WBGT_LIMITS: Record<Exclude<WorkloadClass, 'UNKNOWN'>, { unacclimatized: number; acclimatized: number }> = {
  LIGHT: { unacclimatized: 28, acclimatized: 30 },
  MODERATE: { unacclimatized: 25, acclimatized: 28 },
  HEAVY: { unacclimatized: 23, acclimatized: 26 },
  VERY_HEAVY: { unacclimatized: 21, acclimatized: 25 },
};

export function resolveOshaWbgtThreshold(
  workloadClass: WorkloadClass,
  acclimatization: HeatAcclimatization,
): { thresholdC: number; kind: 'ACTION_LIMIT' | 'THRESHOLD_LIMIT_VALUE' } | null {
  if (workloadClass === 'UNKNOWN') return null;
  const limits = OSHA_WBGT_LIMITS[workloadClass];
  // Fail-safe for attention threshold: unknown acclimatization uses the
  // unacclimatized action limit, but the output remains explicit about state.
  if (acclimatization === 'ACCLIMATIZED') {
    return { thresholdC: limits.acclimatized, kind: 'THRESHOLD_LIMIT_VALUE' };
  }
  return { thresholdC: limits.unacclimatized, kind: 'ACTION_LIMIT' };
}

function observationValues(evidence: WeatherEvidence[]): WeatherObservationEvidence[] {
  return evidence.filter(
    (item): item is WeatherObservationEvidence => item.quality !== 'UNAVAILABLE',
  );
}

function maxOrNull(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value != null && Number.isFinite(value));
  return filtered.length ? Math.max(...filtered) : null;
}
function minOrNull(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value != null && Number.isFinite(value));
  return filtered.length ? Math.min(...filtered) : null;
}

function levelRank(value: EnvironmentalLevel): number {
  return { UNKNOWN: -1, NORMAL: 0, ELEVATED: 1, HIGH: 2, CRITICAL: 3 }[value];
}
function maxLevel(a: EnvironmentalLevel, b: EnvironmentalLevel): EnvironmentalLevel {
  return levelRank(a) >= levelRank(b) ? a : b;
}

function heatIndexLevel(heatIndexC: number | null): EnvironmentalLevel {
  if (heatIndexC == null) return 'UNKNOWN';
  // NWS categories converted from Fahrenheit thresholds:
  // Caution 80–90°F (26.7–32.2°C), Extreme Caution 90–103°F
  // (32.2–39.4°C), Danger 103–125°F (39.4–51.7°C), and
  // Extreme Danger >=125°F. With four AirTrust levels, both NWS Danger
  // categories map to CRITICAL.
  if (heatIndexC >= 39.4) return 'CRITICAL';
  if (heatIndexC >= 32.2) return 'HIGH';
  if (heatIndexC >= 26.7) return 'ELEVATED';
  return 'NORMAL';
}

function coldLevel(windChillC: number | null, ambientMinC: number | null): EnvironmentalLevel {
  const apparent = windChillC ?? ambientMinC;
  if (apparent == null) return 'UNKNOWN';
  // NWS identifies about -20°F (-28.9°C) and below as potentially dangerous.
  if (apparent <= -35) return 'CRITICAL';
  if (apparent <= -28.9) return 'HIGH';
  if (apparent <= -15) return 'ELEVATED';
  return 'NORMAL';
}

export function assessEnvironmentalRisk(input: ThermalContextInput): EnvironmentalRiskAssessment {
  const observations = observationValues(input.evidence);
  const temps = observations.map((item) => item.temperatureC);
  const rhs = observations.map((item) => item.relativeHumidityPct);
  const winds = observations.map((item) => item.windSpeedKt);

  const maxAmbientTempC = maxOrNull(temps);
  const minAmbientTempC = minOrNull(temps);
  const maxRelativeHumidityPct = maxOrNull(rhs);
  const maxWindSpeedKt = maxOrNull(winds);

  const heatIndices = observations.map((item) =>
    item.temperatureC != null && item.relativeHumidityPct != null
      ? calculateHeatIndexC(item.temperatureC, item.relativeHumidityPct)
      : null,
  );
  const windChills = observations.map((item) =>
    item.temperatureC != null && item.windSpeedKt != null
      ? calculateWindChillC(item.temperatureC, item.windSpeedKt)
      : null,
  );
  const maxHeatIndexC = maxOrNull(heatIndices);
  const minWindChillC = minOrNull(windChills);

  const wbgtKind = input.measuredWbgtC != null
    ? 'MEASURED'
    : input.estimatedWbgtC != null
      ? 'ESTIMATED'
      : 'UNAVAILABLE';
  const wbgtC = input.measuredWbgtC ?? input.estimatedWbgtC ?? null;
  const workloadClass = input.workloadClass ?? 'UNKNOWN';
  const acclimatization = input.acclimatization ?? 'UNKNOWN';
  const wbgtThreshold = resolveOshaWbgtThreshold(workloadClass, acclimatization);

  let heatLevel = heatIndexLevel(maxHeatIndexC);
  // If Heat Index is outside its regression domain, retain direct ambient heat
  // as a transparent AirTrust environmental trigger rather than declaring safe.
  if (maxHeatIndexC == null && maxAmbientTempC != null) {
    if (maxAmbientTempC >= 40) heatLevel = 'CRITICAL';
    else if (maxAmbientTempC >= 35) heatLevel = 'HIGH';
    else if (maxAmbientTempC >= 32) heatLevel = 'ELEVATED';
    else heatLevel = 'NORMAL';
  }

  if (wbgtC != null && wbgtThreshold) {
    if (wbgtC >= wbgtThreshold.thresholdC + 2) heatLevel = maxLevel(heatLevel, 'CRITICAL');
    else if (wbgtC >= wbgtThreshold.thresholdC) heatLevel = maxLevel(heatLevel, 'HIGH');
    else if (wbgtC >= wbgtThreshold.thresholdC - 1) heatLevel = maxLevel(heatLevel, 'ELEVATED');
  }

  const cold = coldLevel(minWindChillC, minAmbientTempC);
  let level = maxLevel(heatLevel, cold);
  if (observations.length === 0 && wbgtC == null) level = 'UNKNOWN';

  const alerts: string[] = [];
  const notes: string[] = [];
  if (heatLevel === 'HIGH' || heatLevel === 'CRITICAL') alerts.push('EXTREME_HEAT');
  if (cold === 'HIGH' || cold === 'CRITICAL') alerts.push('EXTREME_COLD');
  if (wbgtKind === 'ESTIMATED') notes.push('WBGT é estimado; não foi promovido a medição.');
  if (input.climateControlled === true) {
    notes.push('Ambiente climatizado informado; temperatura externa não representa todo o FDP.');
  }
  if (observations.some((item) => item.quality === 'STALE')) {
    notes.push('Existe observação meteorológica STALE; confiança ambiental reduzida.');
  }
  if (input.evidence.some((item) => item.quality === 'UNAVAILABLE')) {
    notes.push('Há evento/local sem meteorologia oficial compatível.');
  }

  const dataQuality =
    observations.length === 0 && wbgtC == null
      ? 'INSUFFICIENT'
      : input.evidence.every((item) => item.quality !== 'UNAVAILABLE') &&
          !observations.some((item) => item.quality === 'STALE')
        ? 'COMPLETE'
        : 'PARTIAL';

  return {
    level,
    maxAmbientTempC,
    minAmbientTempC,
    maxRelativeHumidityPct,
    maxWindSpeedKt,
    maxHeatIndexC,
    minWindChillC,
    wbgtC,
    wbgtKind,
    wbgtThresholdC: wbgtThreshold?.thresholdC ?? null,
    wbgtThresholdKind: wbgtThreshold?.kind ?? 'UNAVAILABLE',
    exposedMinutes: input.exposedMinutes ?? null,
    climateControlled: input.climateControlled ?? null,
    dataQuality,
    alerts,
    notes,
  };
}
