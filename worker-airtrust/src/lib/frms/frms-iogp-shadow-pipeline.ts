/**
 * AirTrust FRMS IOGP — shadow pipeline composition root.
 *
 * Wires: SIGVOOS raw leg rows -> leg-context -> per-leg dedup ->
 * location-catalog classification -> operational-demand -> REDEMET weather
 * (batched) -> environmental-risk -> compliance-policy (caller-resolved) ->
 * frms-risk-orchestrator -> evaluation-contract -> iogp-decision-adapter.
 *
 * This module is pure: it never writes D1 and never touches the canonical
 * operational decision. Callers are responsible for persisting the returned
 * snapshot (when running with persistence) and for gating any call at all
 * behind `isFrmsIogpShadowModeEnabledForTenant`. When the tenant is not
 * enabled, `runFrmsIogpShadowPipeline` returns `{ enabled: false }`
 * immediately — before any location-catalog access, REDEMET call, or
 * compliance/environmental computation.
 */

import {
  extractSigvoosLegOperationalContext,
  type SigvoosLegOperationalContext,
} from '../sigvoos/leg-context';
import {
  assessSigvoosOperationalDemand,
  type SigvoosLegForOperationalDemand,
  type SigvoosLocationClassifier,
} from '../sigvoos/operational-demand-adapter';
import {
  buildRedemetQueryWindow,
  localDateTimeToUtcIso,
  selectMetarObservation,
  type MetarSelectionMode,
  type RedemetClient,
  type WeatherEvidence,
  type WeatherEvidenceUnavailable,
} from './redemet-weather';
import {
  resolveOperationalLocation,
  type FrmsLocationCatalogEntry,
} from './location-catalog';
import {
  assessEnvironmentalRisk,
  type HeatAcclimatization,
  type WorkloadClass,
} from './environmental-risk';
import type { ComplianceEvaluation } from './compliance-policy';
import { orchestrateFrmsRisk, type AirTrustRiskLevel } from './frms-risk-orchestrator';
import { resolveIogpDecision, type FrmsIogpDecisionResult } from './iogp-decision-adapter';
import {
  buildFrmsIogpEvaluationSnapshot,
  type FrmsIogpEvaluationSnapshot,
} from './evaluation-contract';
import {
  isFrmsIogpShadowModeEnabledForTenant,
  type FrmsIogpShadowFlagEnv,
} from './frms-iogp-shadow-flag';
import type { FrmsNaturezaDado } from './decision-policy';

export interface FrmsIogpShadowRawLeg {
  data: string; // YYYY-MM-DD
  horasVooMin: number;
  departureIcao: string | null;
  arrivalIcao: string | null;
  takeoffTime: string | null;
  landingTime: string | null;
  dayLandings: number | null;
  nightLandings: number | null;
  flightReportId: string | null;
  legNumber: number | null;
  raw: Record<string, unknown>;
}

export interface FrmsIogpShadowThermalOptions {
  measuredWbgtC?: number | null;
  estimatedWbgtC?: number | null;
  wbgtSourceRef?: string | null;
  workloadClass?: WorkloadClass;
  acclimatization?: HeatAcclimatization;
  exposedMinutes?: number | null;
  climateControlled?: boolean | null;
}

export interface FrmsIogpShadowPipelineInput {
  env: FrmsIogpShadowFlagEnv;
  tenantId: number;
  tripulanteId: number;
  jornadaId: string;
  dataOperacional: string;
  naturezaDado: FrmsNaturezaDado;
  rawSigvoosLegs: FrmsIogpShadowRawLeg[];
  locationCatalogue: FrmsLocationCatalogEntry[];
  tenantOperationalTimezoneIana: string | null;
  /** Absent client means REDEMET is not configured; weather stays UNAVAILABLE, no call attempted. */
  redemetClient: RedemetClient | null;
  metarSelectionMode?: MetarSelectionMode;
  metarMaxAgeMinutes?: number;
  thermal?: FrmsIogpShadowThermalOptions;
  /** Resolved upstream by the existing ANAC/IOGP/operator accrual pipeline — not recomputed here. */
  complianceEvaluations: ComplianceEvaluation[];
  regulatoryProfileReady: boolean;
  regulatoryProfileCode: string | null;
  regulatoryProfileReference: string | null;
  biologicalLevel: 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
}

export interface FrmsIogpShadowPipelineDisabledResult {
  enabled: false;
}

export interface FrmsIogpShadowPipelineEnabledResult {
  enabled: true;
  legContexts: SigvoosLegOperationalContext[];
  weatherByLegId: Map<string, { departure: WeatherEvidence; arrival: WeatherEvidence }>;
  orchestration: ReturnType<typeof orchestrateFrmsRisk>;
  decision: FrmsIogpDecisionResult;
  snapshot: FrmsIogpEvaluationSnapshot;
}

export type FrmsIogpShadowPipelineResult =
  | FrmsIogpShadowPipelineDisabledResult
  | FrmsIogpShadowPipelineEnabledResult;

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
 * Same identity rule as `operational-demand-adapter`: flightReportId +
 * legNumber is the only reliable physical-leg identity. Rows missing either
 * are never collapsed with another row, even if date/ICAO/time coincide.
 */
function stableLegId(leg: FrmsIogpShadowRawLeg, index: number): string {
  if (leg.flightReportId != null && leg.legNumber != null) {
    return `${leg.flightReportId}:${leg.legNumber}`;
  }
  return `unmapped:${index}:${leg.data}:${leg.takeoffTime ?? 'no-tkof'}`;
}

function dedupeLegs(legs: FrmsIogpShadowRawLeg[]): FrmsIogpShadowRawLeg[] {
  const seen = new Map<string, FrmsIogpShadowRawLeg>();
  legs.forEach((leg, index) => {
    const id = stableLegId(leg, index);
    if (!seen.has(id)) seen.set(id, leg);
  });
  return [...seen.values()];
}

function buildClassifier(
  catalogue: FrmsLocationCatalogEntry[],
  tenantTimezoneIana: string | null,
): SigvoosLocationClassifier {
  return ({ icao }) =>
    resolveOperationalLocation(icao, catalogue, { tenantTimezoneIana }).operationalClass;
}

/**
 * Resolves weather for every unique leg with a single batched REDEMET call
 * (one station+window fetch covering the whole set), instead of one request
 * per leg or per crew member. Helideck/platform codes without a REDEMET
 * station configured in the catalogue never fall back to an unrelated
 * aerodrome METAR — they resolve to UNAVAILABLE.
 *
 * Event timestamps use the timezone resolved for each departure/arrival
 * location. The tenant timezone is only an explicit fallback from the
 * location-catalog resolver; a null tenant fallback must not discard a valid
 * per-location timezone.
 */
async function resolveBatchedWeather(
  legs: FrmsIogpShadowRawLeg[],
  catalogue: FrmsLocationCatalogEntry[],
  tenantOperationalTimezoneIana: string | null,
  client: RedemetClient | null,
  selectionMode: MetarSelectionMode,
  maxAgeMinutes: number,
): Promise<Map<string, { departure: WeatherEvidence; arrival: WeatherEvidence }>> {
  const results = new Map<string, { departure: WeatherEvidence; arrival: WeatherEvidence }>();

  type LegEventPlan = {
    id: string;
    departureStation: string | null;
    departureEventUtc: string | null;
    arrivalStation: string | null;
    arrivalEventUtc: string | null;
  };

  const plans: LegEventPlan[] = legs.map((leg, index) => {
    const id = stableLegId(leg, index);
    const departureResolved = resolveOperationalLocation(leg.departureIcao, catalogue, {
      tenantTimezoneIana: tenantOperationalTimezoneIana,
    });
    const arrivalResolved = resolveOperationalLocation(leg.arrivalIcao, catalogue, {
      tenantTimezoneIana: tenantOperationalTimezoneIana,
    });

    const departureStation =
      departureResolved.weatherSourceKind === 'REDEMET' ? departureResolved.redemetStationIcao : null;
    const arrivalStation =
      arrivalResolved.weatherSourceKind === 'REDEMET' ? arrivalResolved.redemetStationIcao : null;

    const departureEventUtc =
      departureStation && leg.takeoffTime && departureResolved.timezoneIana
        ? localDateTimeToUtcIso(leg.data, leg.takeoffTime, departureResolved.timezoneIana)
        : null;
    const arrivalEventUtc =
      arrivalStation && leg.landingTime && arrivalResolved.timezoneIana
        ? localDateTimeToUtcIso(leg.data, leg.landingTime, arrivalResolved.timezoneIana)
        : null;

    return { id, departureStation, departureEventUtc, arrivalStation, arrivalEventUtc };
  });

  const allStations = [
    ...new Set(
      plans.flatMap((plan) => [plan.departureStation, plan.arrivalStation]).filter(
        (value): value is string => value !== null,
      ),
    ),
  ];
  const allEventDates = plans
    .flatMap((plan) => [plan.departureEventUtc, plan.arrivalEventUtc])
    .filter((value): value is string => value !== null)
    .map((value) => new Date(value));
  const window = buildRedemetQueryWindow(allEventDates);

  const rows =
    client && allStations.length > 0 && window ? await client.fetchMetarRows(allStations, window) : [];

  for (const plan of plans) {
    const departure = !plan.departureStation
      ? unavailable(null, plan.departureEventUtc, 'ICAO_INVALIDO')
      : !plan.departureEventUtc
        ? unavailable(plan.departureStation, null, 'HORARIO_EVENTO_AUSENTE')
        : (selectMetarObservation(rows, plan.departureStation, new Date(plan.departureEventUtc), {
            mode: selectionMode,
            maxAgeMinutes,
          }) ?? unavailable(plan.departureStation, plan.departureEventUtc, 'SEM_OBSERVACAO_COMPATIVEL'));

    const arrival = !plan.arrivalStation
      ? unavailable(null, plan.arrivalEventUtc, 'ICAO_INVALIDO')
      : !plan.arrivalEventUtc
        ? unavailable(plan.arrivalStation, null, 'HORARIO_EVENTO_AUSENTE')
        : (selectMetarObservation(rows, plan.arrivalStation, new Date(plan.arrivalEventUtc), {
            mode: selectionMode,
            maxAgeMinutes,
          }) ?? unavailable(plan.arrivalStation, plan.arrivalEventUtc, 'SEM_OBSERVACAO_COMPATIVEL'));

    results.set(plan.id, { departure, arrival });
  }

  return results;
}

export async function runFrmsIogpShadowPipeline(
  input: FrmsIogpShadowPipelineInput,
): Promise<FrmsIogpShadowPipelineResult> {
  if (!isFrmsIogpShadowModeEnabledForTenant(input.env, input.tenantId)) {
    return { enabled: false };
  }

  const uniqueLegs = dedupeLegs(input.rawSigvoosLegs);
  const legContexts = uniqueLegs.map((leg) => extractSigvoosLegOperationalContext(leg.raw));

  const classifier = buildClassifier(input.locationCatalogue, input.tenantOperationalTimezoneIana);
  const demandInput: SigvoosLegForOperationalDemand[] = uniqueLegs.map((leg) => ({
    data: leg.data,
    horasVooMin: leg.horasVooMin,
    departureIcao: leg.departureIcao,
    arrivalIcao: leg.arrivalIcao,
    takeoffTime: leg.takeoffTime,
    landingTime: leg.landingTime,
    dayLandings: leg.dayLandings,
    nightLandings: leg.nightLandings,
    flightReportId: leg.flightReportId,
    legNumber: leg.legNumber,
    raw: leg.raw,
  }));
  const operational = assessSigvoosOperationalDemand(demandInput, classifier);

  const weatherByLegId = await resolveBatchedWeather(
    uniqueLegs,
    input.locationCatalogue,
    input.tenantOperationalTimezoneIana,
    input.redemetClient,
    input.metarSelectionMode ?? 'LATEST_AT_OR_BEFORE',
    input.metarMaxAgeMinutes ?? 120,
  );

  const allEvidence = [...weatherByLegId.values()].flatMap((entry) => [entry.departure, entry.arrival]);
  const environmental = assessEnvironmentalRisk({
    evidence: allEvidence,
    measuredWbgtC: input.thermal?.measuredWbgtC,
    estimatedWbgtC: input.thermal?.estimatedWbgtC,
    wbgtSourceRef: input.thermal?.wbgtSourceRef,
    workloadClass: input.thermal?.workloadClass,
    acclimatization: input.thermal?.acclimatization,
    exposedMinutes: input.thermal?.exposedMinutes,
    climateControlled: input.thermal?.climateControlled,
  });

  const orchestration = orchestrateFrmsRisk({
    compliance: input.complianceEvaluations,
    regulatoryProfileReady: input.regulatoryProfileReady,
    biologicalLevel: input.biologicalLevel,
    operational,
    environmental,
  });

  const decision = resolveIogpDecision(orchestration, input.naturezaDado);

  const weatherStations = [...allEvidence]
    .map((item) => item.stationIcao)
    .filter((value): value is string => value !== null);
  const weatherSourceValues = new Set(allEvidence.map((item) => item.quality));
  const weatherSource: FrmsIogpEvaluationSnapshot['evidence']['weatherSource'] =
    weatherSourceValues.size === 0 || (weatherSourceValues.size === 1 && weatherSourceValues.has('UNAVAILABLE'))
      ? 'UNAVAILABLE'
      : allEvidence.every((item) => item.quality !== 'UNAVAILABLE')
        ? 'DECEA_REDEMET'
        : 'MIXED';
  const missingData: string[] = [];
  if (allEvidence.some((item) => item.quality === 'UNAVAILABLE')) missingData.push('WEATHER_EVIDENCE');
  if (operational.dataQuality !== 'COMPLETE') missingData.push('OPERATIONAL_DEMAND');
  if (environmental.dataQuality !== 'COMPLETE') missingData.push('ENVIRONMENTAL_RISK');
  if (!input.regulatoryProfileReady) missingData.push('REGULATORY_PROFILE');

  const snapshot = buildFrmsIogpEvaluationSnapshot({
    evaluationVersion: 'shadow-v1',
    empresaId: input.tenantId,
    tripulanteId: input.tripulanteId,
    jornadaId: input.jornadaId,
    dataOperacional: input.dataOperacional,
    regulatoryProfileCode: input.regulatoryProfileCode,
    regulatoryProfileReference: input.regulatoryProfileReference,
    compliance: input.complianceEvaluations,
    biological: {
      level: input.biologicalLevel,
      source: 'CURRENT_AIRTRUST_ENGINE',
    },
    operational,
    environmental,
    orchestration,
    evidence: {
      sigvoosLegKeys: uniqueLegs.map((leg, index) => stableLegId(leg, index)),
      weatherStations,
      weatherSource,
      missingData,
    },
  });

  return { enabled: true, legContexts, weatherByLegId, orchestration, decision, snapshot };
}
