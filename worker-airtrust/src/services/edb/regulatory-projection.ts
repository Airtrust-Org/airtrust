import type { EdbFlightRecord } from './contracts';
import type { EdbExplicitRegulatoryStageData } from './operational-regulatory-source';
import {
  projectRdvToEdbShadow,
  type EdbProjectionGap,
  type EdbProjectionGapCode,
  type EdbRdvShadowSource,
  type EdbShadowProjection,
} from './rdv-shadow-projection';

export interface EdbStageRegulatoryOverride {
  stageId: number;
  data: EdbExplicitRegulatoryStageData;
}

export interface EdbCrewRegulatoryFunctionOverride {
  stageId: number;
  employeeId: number;
  regulatoryFunctionCode: string;
}

function removeGap(
  gaps: EdbProjectionGap[],
  stageId: number,
  code: EdbProjectionGapCode,
): EdbProjectionGap[] {
  const prefix = `records.${stageId}.`;
  return gaps.filter((gap) => !(gap.code === code && gap.path.startsWith(prefix)));
}

function applyStageOverride(
  record: EdbFlightRecord,
  data: EdbExplicitRegulatoryStageData,
): void {
  record.flight.duration.dayMinutes = data.dayMinutes;
  record.flight.duration.nightMinutes = data.nightMinutes;
  record.flight.duration.totalMinutes = data.totalMinutes;
  record.flight.duration.ifrActualMinutes = data.ifrActualMinutes;
  record.flight.duration.ifrSimulatedMinutes = data.ifrSimulatedMinutes;
  record.flight.landingsTotal = data.landingsTotal;
  record.flight.cycles = data.cycles;
  record.flight.fuelBeforeEngineStart = data.fuelBeforeEngineStart;
  record.flight.personsOnBoard = data.personsOnBoard;
  record.flight.cargoKg = data.cargoKg;
  record.flight.occurrences = data.occurrences === null ? null : [...data.occurrences];
  record.flight.technicalDiscrepancies =
    data.technicalDiscrepancies === null
      ? null
      : data.technicalDiscrepancies.map((item) => ({
          description: item.description,
          detectedBy: { ...item.detectedBy },
        }));
}

/**
 * Applies only explicit regulatory companion data on top of the legacy shadow
 * projection. Ambiguous legacy values never become regulatory fields here.
 */
export function projectRdvToEdbWithExplicitRegulatoryData(params: {
  source: EdbRdvShadowSource;
  stageOverrides: EdbStageRegulatoryOverride[];
  crewFunctionOverrides?: EdbCrewRegulatoryFunctionOverride[];
}): EdbShadowProjection {
  const projection = projectRdvToEdbShadow(params.source);
  let gaps = [...projection.gaps];
  const overrideByStage = new Map(params.stageOverrides.map((item) => [item.stageId, item.data]));

  for (const record of projection.records) {
    const stageId = record.source.sourceStageId;
    if (stageId === null) continue;
    const data = overrideByStage.get(stageId);
    if (!data) continue;

    applyStageOverride(record, data);

    if (data.dayMinutes !== null) {
      gaps = removeGap(gaps, stageId, 'DAY_TIME_NOT_AVAILABLE');
    }
    if (data.ifrActualMinutes !== null && data.ifrSimulatedMinutes !== null) {
      gaps = removeGap(gaps, stageId, 'IFR_SPLIT_REQUIRED');
    }
    if (data.cycles !== null) {
      gaps = removeGap(gaps, stageId, 'CYCLES_NOT_MAPPED_FROM_STARTS');
    }
    if (data.fuelBeforeEngineStart !== null) {
      gaps = removeGap(gaps, stageId, 'FUEL_PRESTART_SEMANTICS_UNCONFIRMED');
    }
    if (data.personsOnBoard !== null) {
      gaps = removeGap(gaps, stageId, 'POB_SEMANTICS_UNCONFIRMED');
    }
    if (data.cargoKg !== null) {
      gaps = removeGap(gaps, stageId, 'CARGO_SEMANTICS_UNCONFIRMED');
    }
    if (data.occurrences !== null) {
      gaps = removeGap(gaps, stageId, 'OCCURRENCES_STAGE_SCOPE_UNCONFIRMED');
    }
    if (data.technicalDiscrepancies !== null) {
      gaps = removeGap(gaps, stageId, 'TECH_DISCREPANCY_NOT_MAPPED_FROM_DIVERGENCES');
    }
  }

  for (const override of params.crewFunctionOverrides ?? []) {
    const record = projection.records.find(
      (item) => item.source.sourceStageId === override.stageId,
    );
    const crew = record?.flight.crew.find(
      (member) => member.employeeId === override.employeeId,
    );
    if (crew) crew.regulatoryFunctionCode = override.regulatoryFunctionCode;
  }

  return { records: projection.records, gaps };
}
