/**
 * FRMS Operational Load V2 — independent governed components.
 *
 * Coefficients are supplied by the immutable tenant/profile revision through
 * FrmsOperationalPolicyV2. This file intentionally owns no operational
 * numeric default.
 */
import {
  computeImcDelta,
  computeLandingsDeltaPoints,
  computeTemperatureDeltaPoints,
  type FrmsOperationalPolicyV2,
  type ImcLegInput,
  type ImcLegResult,
} from './operational-policy-v2';

export type LandingsEvidenceQuality = 'OBSERVED' | 'CONFIRMED_ZERO' | 'INCOMPLETE';
export type WeatherEvidenceQuality = 'OBSERVED' | 'NOT_APPLICABLE' | 'INCOMPLETE';
export type OperationalLoadDataQuality = 'COMPLETE' | 'INCOMPLETE' | 'SIGVOOS_UNAVAILABLE';

export interface OperationalLoadV2Input {
  landingsCount: number;
  landingsEvidenceQuality?: LandingsEvidenceQuality;
  temperatureMaxC: number | null;
  imcLegs?: readonly ImcLegInput[];
  policy: FrmsOperationalPolicyV2;
  policyVersion: string;
}

export interface OperationalLoadV2Result {
  policy_version: string;
  landings_count: number;
  landings_evidence_quality: LandingsEvidenceQuality;
  temperature_max_c: number | null;
  weather_evidence_quality: WeatherEvidenceQuality;
  imc_evidence_quality: 'OBSERVED' | 'INCOMPLETE' | 'NOT_APPLICABLE';
  data_quality: OperationalLoadDataQuality;
  operational_load_landings_delta: number;
  operational_load_temperature_delta: number;
  operational_load_imc_delta: number;
  /** Compatibility only: raw sum, with NO shared cap. */
  operational_load_total_delta: number;
  imc_legs: ImcLegResult[];
}

/** @deprecated Compatibility type name for historical call sites. */
export type OperationalLoadV1Result = OperationalLoadV2Result;

function round1(value: number): number { return Math.round(value * 10) / 10; }

export function computeOperationalLoadV2(input: OperationalLoadV2Input): OperationalLoadV2Result {
  const count = Number.isFinite(input.landingsCount) ? Math.max(0, Math.floor(input.landingsCount)) : 0;
  const quality = input.landingsEvidenceQuality ?? (count > 0 ? 'OBSERVED' : 'CONFIRMED_ZERO');
  const noFlight = quality === 'CONFIRMED_ZERO';
  const hasTemp = !noFlight && input.temperatureMaxC != null && Number.isFinite(input.temperatureMaxC);
  const temp = hasTemp ? round1(Number(input.temperatureMaxC)) : null;
  const landingsDelta = quality === 'INCOMPLETE' ? 0 : computeLandingsDeltaPoints(count, input.policy);
  const temperatureDelta = hasTemp ? computeTemperatureDeltaPoints(temp, input.policy) : 0;
  const imc = noFlight ? { totalDelta: 0, legs: [] as ImcLegResult[] } : computeImcDelta(input.imcLegs ?? [], input.policy);
  const weatherQuality: WeatherEvidenceQuality = noFlight ? 'NOT_APPLICABLE' : hasTemp ? 'OBSERVED' : 'INCOMPLETE';
  const imcQuality = noFlight ? 'NOT_APPLICABLE' as const
    : (input.imcLegs ?? []).length === 0 || imc.legs.some((l) => l.departure.condition === 'INDETERMINATE' || l.arrival.condition === 'INDETERMINATE')
      ? 'INCOMPLETE' as const : 'OBSERVED' as const;
  const dataQuality: OperationalLoadDataQuality = quality === 'INCOMPLETE'
    ? 'SIGVOOS_UNAVAILABLE'
    : !noFlight && (weatherQuality !== 'OBSERVED' || imcQuality !== 'OBSERVED') ? 'INCOMPLETE' : 'COMPLETE';
  return {
    policy_version: input.policyVersion,
    landings_count: count,
    landings_evidence_quality: quality,
    temperature_max_c: temp,
    weather_evidence_quality: weatherQuality,
    imc_evidence_quality: imcQuality,
    data_quality: dataQuality,
    operational_load_landings_delta: round1(landingsDelta),
    operational_load_temperature_delta: round1(temperatureDelta),
    operational_load_imc_delta: round1(imc.totalDelta),
    operational_load_total_delta: round1(landingsDelta + temperatureDelta + imc.totalDelta),
    imc_legs: imc.legs,
  };
}

export function describeOperationalLoadV2(result: OperationalLoadV2Result): { title: string; lines: string[] } {
  const fmt = (points: number) => points.toFixed(1).replace('.', ',');
  const lines: string[] = [];
  if (result.landings_evidence_quality === 'INCOMPLETE') lines.push('Pousos: SIGVOOS indisponível (sem penalidade).');
  else if (result.landings_evidence_quality === 'CONFIRMED_ZERO') lines.push('Pousos: ausência de voo confirmada.');
  else lines.push(`Pousos: ${result.landings_count} → ${fmt(result.operational_load_landings_delta)} ponto(s).`);
  if (result.weather_evidence_quality === 'OBSERVED' && result.temperature_max_c != null) {
    lines.push(`Temperatura: ${result.temperature_max_c} °C → ${fmt(result.operational_load_temperature_delta)} ponto(s).`);
  } else if (result.weather_evidence_quality === 'INCOMPLETE') lines.push('Temperatura: evidência meteorológica incompleta (sem penalidade inventada).');
  if (result.imc_evidence_quality === 'OBSERVED') lines.push(`IMC: ${fmt(result.operational_load_imc_delta)} ponto(s).`);
  else if (result.imc_evidence_quality === 'INCOMPLETE') lines.push('IMC: evidência meteorológica incompleta (sem inferir VMC).');
  return { title: 'Fatores offshore independentes', lines };
}
