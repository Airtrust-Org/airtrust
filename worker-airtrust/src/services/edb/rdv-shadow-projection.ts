import {
  createEmptyEdbFlightRecord,
  type EdbAircraftIdentity,
  type EdbCrewMember,
  type EdbFlightRecord,
  type EdbMaintenanceSnapshot,
  type EdbOperatorRegulation,
} from './contracts';

export type EdbProjectionGapCode =
  | 'AIRCRAFT_IDENTITY_INCOMPLETE'
  | 'CYCLES_NOT_MAPPED_FROM_STARTS'
  | 'DAY_TIME_NOT_AVAILABLE'
  | 'IFR_SPLIT_REQUIRED'
  | 'FUEL_PRESTART_SEMANTICS_UNCONFIRMED'
  | 'POB_SEMANTICS_UNCONFIRMED'
  | 'CARGO_SEMANTICS_UNCONFIRMED'
  | 'OCCURRENCES_STAGE_SCOPE_UNCONFIRMED'
  | 'TECH_DISCREPANCY_NOT_MAPPED_FROM_DIVERGENCES';

export interface EdbProjectionGap {
  code: EdbProjectionGapCode;
  path: string;
  sourceField: string | null;
  message: string;
}

/**
 * Normalized read-only source for one operational stage. It intentionally
 * exposes ambiguous legacy fields separately instead of pretending they meet
 * the regulatory semantics.
 */
export interface EdbOperationalStageShadowSource {
  stageId: number;
  origin: string | null;
  destination: string | null;
  engineStartAt: string | null;
  takeoffAt: string | null;
  landingAt: string | null;
  engineShutdownAt: string | null;
  totalMinutes: number | null;
  nightMinutes: number | null;
  landingsDay: number | null;
  landingsNight: number | null;
  /** Existing operational field. It is NOT considered an ANAC cycle. */
  starts: number | null;
  /** Existing operational IFR time without actual/simulated classification. */
  ifrUnclassifiedMinutes: number | null;
  /** Existing operational fuel-at-start field; semantic equivalence is pending. */
  fuelAtStageStart: number | null;
  /** Existing passenger count; it does not necessarily include crew/extras. */
  passengers: number | null;
  /** Existing payload; it is not automatically equivalent to regulatory cargo. */
  payloadKg: number | null;
  crew: EdbCrewMember[];
}

export interface EdbRdvShadowSource {
  operatorCompanyId: number;
  operatorRegulation: EdbOperatorRegulation;
  flightId: number;
  rdvId: number | null;
  rdvVersion: number | null;
  date: string | null;
  nature: string | null;
  occurrences: string | null;
  /** Operational divergence is deliberately not treated as a technical discrepancy. */
  divergences: string | null;
  aircraft: EdbAircraftIdentity;
  maintenance: EdbMaintenanceSnapshot | null;
  stages: EdbOperationalStageShadowSource[];
  capturedAt: string;
}

export interface EdbShadowProjection {
  records: EdbFlightRecord[];
  gaps: EdbProjectionGap[];
}

function aircraftIdentityComplete(aircraft: EdbAircraftIdentity): boolean {
  return Boolean(
    aircraft.manufacturer?.trim() &&
      aircraft.model?.trim() &&
      aircraft.serialNumber?.trim() &&
      aircraft.registrationMarks?.trim() &&
      aircraft.owners?.length &&
      aircraft.operators?.length,
  );
}

function splitOccurrence(value: string): string[] {
  const normalized = value.trim();
  return normalized ? [normalized] : [];
}

export function projectRdvToEdbShadow(source: EdbRdvShadowSource): EdbShadowProjection {
  const gaps: EdbProjectionGap[] = [];
  const multiStage = source.stages.length > 1;

  const records = source.stages.map((stage) => {
    const record = createEmptyEdbFlightRecord({
      operatorCompanyId: source.operatorCompanyId,
      operatorRegulation: source.operatorRegulation,
      sourceFlightId: source.flightId,
      sourceRdvId: source.rdvId,
      sourceRdvVersion: source.rdvVersion,
      sourceStageId: stage.stageId,
      capturedAt: source.capturedAt,
    });

    record.identity.aircraft = {
      ...source.aircraft,
      owners: source.aircraft.owners ? [...source.aircraft.owners] : null,
      operators: source.aircraft.operators ? [...source.aircraft.operators] : null,
    };
    if (source.maintenance) {
      record.maintenance = {
        lastIntervention: { ...source.maintenance.lastIntervention },
        nextIntervention: { ...source.maintenance.nextIntervention },
      };
    }

    record.flight.date = source.date;
    record.flight.origin = stage.origin;
    record.flight.destination = stage.destination;
    record.flight.times = {
      engineStartAt: stage.engineStartAt,
      takeoffAt: stage.takeoffAt,
      landingAt: stage.landingAt,
      engineShutdownAt: stage.engineShutdownAt,
    };
    record.flight.duration.totalMinutes = stage.totalMinutes;
    record.flight.duration.nightMinutes = stage.nightMinutes;
    record.flight.nature = source.nature;
    record.flight.crew = stage.crew.map((member) => ({ ...member }));

    if (stage.landingsDay !== null && stage.landingsNight !== null) {
      record.flight.landingsTotal = stage.landingsDay + stage.landingsNight;
    }

    // Explicitly no inference for regulatory fields whose semantics are not proven.
    record.flight.cycles = null;
    record.flight.duration.dayMinutes = null;
    record.flight.duration.ifrActualMinutes = null;
    record.flight.duration.ifrSimulatedMinutes = null;
    record.flight.fuelBeforeEngineStart = null;
    record.flight.personsOnBoard = null;
    record.flight.cargoKg = null;
    record.flight.technicalDiscrepancies = null;

    if (source.occurrences === null) {
      record.flight.occurrences = null;
    } else if (multiStage && source.occurrences.trim()) {
      record.flight.occurrences = null;
      gaps.push({
        code: 'OCCURRENCES_STAGE_SCOPE_UNCONFIRMED',
        path: `records.${stage.stageId}.flight.occurrences`,
        sourceField: 'rdv.ocorrencias',
        message: 'Ocorrencia do RDV nao e distribuida automaticamente entre multiplas etapas.',
      });
    } else {
      record.flight.occurrences = splitOccurrence(source.occurrences);
    }

    gaps.push({
      code: 'DAY_TIME_NOT_AVAILABLE',
      path: `records.${stage.stageId}.flight.duration.dayMinutes`,
      sourceField: null,
      message: 'Tempo diurno deve ser registrado explicitamente; nao e inferido por total - noturno.',
    });

    if (stage.ifrUnclassifiedMinutes !== null) {
      gaps.push({
        code: 'IFR_SPLIT_REQUIRED',
        path: `records.${stage.stageId}.flight.duration`,
        sourceField: 'etapa.tempo_ifr',
        message: 'Tempo IFR operacional nao e classificado automaticamente como IFR real ou simulado.',
      });
    }

    if (stage.starts !== null) {
      gaps.push({
        code: 'CYCLES_NOT_MAPPED_FROM_STARTS',
        path: `records.${stage.stageId}.flight.cycles`,
        sourceField: 'etapa.starts',
        message: 'Starts nao sao convertidos automaticamente em ciclos regulatórios.',
      });
    }

    if (stage.fuelAtStageStart !== null) {
      gaps.push({
        code: 'FUEL_PRESTART_SEMANTICS_UNCONFIRMED',
        path: `records.${stage.stageId}.flight.fuelBeforeEngineStart`,
        sourceField: 'etapa.combustivel_inicio',
        message: 'Combustivel no inicio da etapa nao e tratado automaticamente como total antes da partida dos motores.',
      });
    }

    if (stage.passengers !== null) {
      gaps.push({
        code: 'POB_SEMANTICS_UNCONFIRMED',
        path: `records.${stage.stageId}.flight.personsOnBoard`,
        sourceField: 'etapa.pax',
        message: 'PAX nao e convertido em POB porque POB deve incluir tripulacao e extras.',
      });
    }

    if (stage.payloadKg !== null) {
      gaps.push({
        code: 'CARGO_SEMANTICS_UNCONFIRMED',
        path: `records.${stage.stageId}.flight.cargoKg`,
        sourceField: 'etapa.payload',
        message: 'Payload nao e convertido automaticamente em carga regulatoria.',
      });
    }

    if (source.divergences?.trim()) {
      gaps.push({
        code: 'TECH_DISCREPANCY_NOT_MAPPED_FROM_DIVERGENCES',
        path: `records.${stage.stageId}.flight.technicalDiscrepancies`,
        sourceField: 'rdv.divergencias',
        message: 'Divergencia operacional nao e tratada como discrepancia tecnica de manutencao.',
      });
    }

    return record;
  });

  if (!aircraftIdentityComplete(source.aircraft)) {
    gaps.push({
      code: 'AIRCRAFT_IDENTITY_INCOMPLETE',
      path: 'identity.aircraft',
      sourceField: 'cadastro_empresa.aeronave',
      message: 'Cadastro da aeronave da empresa precisa conter identificacao completa exigida pelo Diario de Bordo.',
    });
  }

  return { records, gaps };
}
