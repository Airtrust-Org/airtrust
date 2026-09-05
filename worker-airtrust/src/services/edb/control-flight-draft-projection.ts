import {
  EDB_DRAFT_SCHEMA_VERSION,
  createEdbDraftSnapshot,
  type EdbCrewFunction,
  type EdbDraft,
} from './domain-contracts';

type Nullable<T> = T | null;

type ControlFlightOrigin = 'MANUAL' | 'SIGVOOS' | string;

const MAX_RDV_SUMMARY_LENGTH = 4000;

export interface ControlFlightLegSource {
  id: number;
  empresa_id: number;
  voo_id: number;
  numero_etapa: number;
  origem_icao: Nullable<string>;
  destino_icao: Nullable<string>;
  horario_motor_ligado: Nullable<string>;
  horario_decolagem: Nullable<string>;
  horario_pouso: Nullable<string>;
  horario_motor_desligado: Nullable<string>;
  tempo_decolagem_pouso: Nullable<string>;
  tempo_total: Nullable<string>;
  tempo_ifr: Nullable<string>;
  tempo_noturno: Nullable<string>;
  pousos_diurnos: Nullable<number>;
  pousos_noturnos: Nullable<number>;
  starts: Nullable<number>;
  pax: Nullable<number>;
  payload: Nullable<number>;
  combustivel_inicio: Nullable<number>;
  combustivel_fim: Nullable<number>;
  unidade_combustivel: Nullable<string>;
  origem_dados: ControlFlightOrigin;
  sigvoos_importado_em: Nullable<string>;
}

export interface ControlFlightCrewSource {
  id: number;
  empresa_id: number;
  voo_id: number;
  etapa_id: Nullable<number>;
  funcionario_id: Nullable<number>;
  nome: Nullable<string>;
  canac: Nullable<string>;
  funcao: Nullable<string>;
  horario_apresentacao: Nullable<string>;
  base_contratual: Nullable<string>;
  funcao_origem: Nullable<string>;
}

export interface ControlFlightConflictSource {
  id: number;
  empresa_id: number;
  entidade_tipo: 'voo' | 'etapa' | 'tripulante';
  entidade_id: number;
  campo: string;
  severidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  status: 'ABERTO' | 'RESOLVIDO' | 'IGNORADO';
}

export interface ControlFlightRdvSource {
  id: number;
  empresa_id: number;
  voo_id: number;
  ocorrencias: Nullable<string>;
  divergencias: Nullable<string>;
  updated_at: Nullable<string>;
}

export interface ControlFlightDraftProjectionInput {
  draftId: string;
  tenantId: number;
  flightId: number;
  createdAt: string;
  operationalDate: string;
  timezone: Nullable<string>;
  sourceFlightReference: string;
  volumeNumber: Nullable<string>;
  flightNatureCode: Nullable<string>;
  operator: {
    legalName: Nullable<string>;
    legalIdentifier: Nullable<string>;
    operatingCertificate: Nullable<string>;
  };
  owner: {
    legalName: Nullable<string>;
    legalIdentifier: Nullable<string>;
  };
  aircraft: {
    manufacturer: Nullable<string>;
    model: Nullable<string>;
    serialNumber: Nullable<string>;
    registration: Nullable<string>;
  };
  legs: ControlFlightLegSource[];
  crew: ControlFlightCrewSource[];
  conflicts?: ControlFlightConflictSource[];
  rdv?: Nullable<ControlFlightRdvSource>;
  technicalStatus: {
    lastMaintenanceIntervention: Nullable<string>;
    nextMaintenanceIntervention: Nullable<string>;
    airframeHoursRemaining: Nullable<number>;
    returnToServiceReference: Nullable<string>;
    openDiscrepancyCount: Nullable<number>;
    sourceReference: Nullable<string>;
    observedAt: Nullable<string>;
  };
}

export type ControlFlightProjectionFindingCode =
  | 'CREW_LEG_NOT_FOUND'
  | 'CREW_ROLE_UNMAPPED'
  | 'CREW_WITHOUT_LEG'
  | 'CYCLES_SOURCE_SEMANTICS_UNCONFIRMED'
  | 'DURATION_INVALID'
  | 'IFR_CLASSIFICATION_REQUIRED'
  | 'FUEL_CONSUMPTION_UNAVAILABLE'
  | 'FUEL_UNIT_UNKNOWN'
  | 'PAYLOAD_UNIT_UNKNOWN'
  | 'RDV_SUMMARY_WITHOUT_LEG'
  | 'RDV_TEXT_TOO_LONG'
  | 'SOURCE_CONFLICT_OPEN'
  | 'TECHNICAL_DISCREPANCY_STRUCTURED_SOURCE_REQUIRED'
  | 'TIMEZONE_REQUIRED';

export interface ControlFlightProjectionFinding {
  code: ControlFlightProjectionFindingCode;
  path: string;
}

export interface ControlFlightProjectionFieldSource {
  path: string;
  source: {
    kind: 'AIRTRUST_CONTROL_FLIGHTS';
    reference: string;
    observedAt?: string;
  };
}

export interface ControlFlightDraftProjectionResult {
  draft: EdbDraft;
  findings: ControlFlightProjectionFinding[];
  fieldSources: ControlFlightProjectionFieldSource[];
}

export class ControlFlightProjectionError extends Error {
  constructor(
    public readonly code: 'TENANT_MISMATCH' | 'FLIGHT_MISMATCH' | 'CONFLICT_SCOPE_MISMATCH',
  ) {
    super(code);
    this.name = 'ControlFlightProjectionError';
  }
}

function normalizeText(value: Nullable<string>): Nullable<string> {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeClockTime(value: Nullable<string>): Nullable<string> {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function clockTimeToMinutes(value: Nullable<string>): Nullable<number> {
  const normalized = normalizeClockTime(value);
  if (!normalized) return null;

  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

function durationToMinutes(value: Nullable<string>): Nullable<number> {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const match = normalized.match(/^(\d+):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isSafeInteger(hours) || minutes > 59) return null;

  return hours * 60 + minutes;
}

function addDaysToOperationalDate(value: string, days: number): string {
  if (days === 0) return value;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function deriveLegOperationalDates(
  legs: ControlFlightLegSource[],
  baseOperationalDate: string,
): string[] {
  let previousClockMinutes: Nullable<number> = null;
  let previousDayOffset = 0;

  return legs.map((leg) => {
    const clocks = [
      leg.horario_motor_ligado,
      leg.horario_decolagem,
      leg.horario_pouso,
      leg.horario_motor_desligado,
    ]
      .map(clockTimeToMinutes)
      .filter((value): value is number => value !== null);

    let legDayOffset = previousDayOffset;

    if (clocks.length > 0) {
      let eventDayOffset = previousDayOffset;
      if (previousClockMinutes !== null && clocks[0] < previousClockMinutes) {
        eventDayOffset += 1;
      }

      legDayOffset = eventDayOffset;
      let lastClockMinutes = clocks[0];

      for (const clockMinutes of clocks.slice(1)) {
        if (clockMinutes < lastClockMinutes) {
          eventDayOffset += 1;
        }
        lastClockMinutes = clockMinutes;
      }

      previousClockMinutes = lastClockMinutes;
      previousDayOffset = eventDayOffset;
    }

    return addDaysToOperationalDate(baseOperationalDate, legDayOffset);
  });
}

function mapCrewFunction(value: Nullable<string>): Nullable<EdbCrewFunction> {
  const normalized = normalizeText(value)?.toUpperCase();
  switch (normalized) {
    case 'PIC':
      return 'P1';
    case 'SIC':
      return 'P2';
    case 'COM':
      return 'C';
    case 'MEC':
      return 'M';
    default:
      return null;
  }
}

function mapFuelUnit(value: Nullable<string>): 'KG' | 'LB' | 'L' | null {
  const normalized = normalizeText(value)?.toUpperCase();
  if (normalized === 'KG' || normalized === 'LB' || normalized === 'L') {
    return normalized;
  }
  return null;
}

function mapSourceKind(origin: Nullable<string>) {
  const normalized = normalizeText(origin)?.toUpperCase();
  if (normalized === 'SIGVOOS') {
    return 'SIGVOOS' as const;
  }
  if (normalized === 'MANUAL') {
    return 'AIRTRUST_CONTROL_FLIGHTS' as const;
  }
  return 'UNKNOWN' as const;
}

function assertScope(input: ControlFlightDraftProjectionInput): void {
  for (const leg of input.legs) {
    if (leg.empresa_id !== input.tenantId) {
      throw new ControlFlightProjectionError('TENANT_MISMATCH');
    }
    if (leg.voo_id !== input.flightId) {
      throw new ControlFlightProjectionError('FLIGHT_MISMATCH');
    }
  }

  for (const member of input.crew) {
    if (member.empresa_id !== input.tenantId) {
      throw new ControlFlightProjectionError('TENANT_MISMATCH');
    }
    if (member.voo_id !== input.flightId) {
      throw new ControlFlightProjectionError('FLIGHT_MISMATCH');
    }
  }

  if (input.rdv) {
    if (input.rdv.empresa_id !== input.tenantId) {
      throw new ControlFlightProjectionError('TENANT_MISMATCH');
    }
    if (input.rdv.voo_id !== input.flightId) {
      throw new ControlFlightProjectionError('FLIGHT_MISMATCH');
    }
  }

  const legIds = new Set(input.legs.map((leg) => leg.id));
  const crewIds = new Set(input.crew.map((member) => member.id));

  for (const conflict of input.conflicts ?? []) {
    if (conflict.empresa_id !== input.tenantId) {
      throw new ControlFlightProjectionError('TENANT_MISMATCH');
    }

    const belongsToFlight =
      (conflict.entidade_tipo === 'voo' && conflict.entidade_id === input.flightId) ||
      (conflict.entidade_tipo === 'etapa' && legIds.has(conflict.entidade_id)) ||
      (conflict.entidade_tipo === 'tripulante' && crewIds.has(conflict.entidade_id));

    if (!belongsToFlight) {
      throw new ControlFlightProjectionError('CONFLICT_SCOPE_MISMATCH');
    }
  }
}

function addFinding(
  findings: ControlFlightProjectionFinding[],
  code: ControlFlightProjectionFindingCode,
  path: string,
): void {
  findings.push({ code, path });
}

function normalizeRdvSummary(
  value: Nullable<string>,
  path: string,
  findings: ControlFlightProjectionFinding[],
): Nullable<string> {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  if (normalized.length > MAX_RDV_SUMMARY_LENGTH) {
    addFinding(findings, 'RDV_TEXT_TOO_LONG', path);
    return null;
  }

  return normalized;
}

function projectCrew(
  members: ControlFlightCrewSource[],
  findings: ControlFlightProjectionFinding[],
  legIndex: number,
) {
  return members.map((member, crewIndex) => {
    const mappedFunction = mapCrewFunction(member.funcao);
    if (!mappedFunction && normalizeText(member.funcao)) {
      addFinding(findings, 'CREW_ROLE_UNMAPPED', `legs.${legIndex}.crew.${crewIndex}.function`);
    }

    return {
      personReference:
        member.funcionario_id === null
          ? `cv_voo_tripulantes:${member.id}`
          : `funcionarios:${member.funcionario_id}`,
      displayName: normalizeText(member.nome),
      canac: normalizeText(member.canac),
      function: mappedFunction,
      reportTime: normalizeClockTime(member.horario_apresentacao),
      contractualBase: normalizeText(member.base_contratual),
      source: {
        kind: mapSourceKind(member.funcao_origem),
        reference: `cv_voo_tripulantes:${member.id}`,
      },
    };
  });
}

export function projectControlFlightToEdbDraft(
  input: ControlFlightDraftProjectionInput,
): ControlFlightDraftProjectionResult {
  assertScope(input);

  const findings: ControlFlightProjectionFinding[] = [];
  const fieldSources: ControlFlightProjectionFieldSource[] = [];

  if (!normalizeText(input.timezone)) {
    addFinding(findings, 'TIMEZONE_REQUIRED', 'timezone');
  }

  const legIds = new Set(input.legs.map((leg) => leg.id));
  for (const [index, member] of input.crew.entries()) {
    if (member.etapa_id === null) {
      addFinding(findings, 'CREW_WITHOUT_LEG', `crew.${index}.etapa_id`);
      continue;
    }

    if (!legIds.has(member.etapa_id)) {
      addFinding(findings, 'CREW_LEG_NOT_FOUND', `crew.${index}.etapa_id`);
    }
  }

  for (const [index, conflict] of (input.conflicts ?? []).entries()) {
    if (conflict.status === 'ABERTO') {
      addFinding(findings, 'SOURCE_CONFLICT_OPEN', `conflicts.${index}`);
    }
  }

  const rdvOccurrenceSummary = normalizeRdvSummary(
    input.rdv?.ocorrencias ?? null,
    'rdv.ocorrencias',
    findings,
  );
  const rdvTechnicalDiscrepancySummary = normalizeRdvSummary(
    input.rdv?.divergencias ?? null,
    'rdv.divergencias',
    findings,
  );

  if (rdvTechnicalDiscrepancySummary !== null) {
    addFinding(
      findings,
      'TECHNICAL_DISCREPANCY_STRUCTURED_SOURCE_REQUIRED',
      'rdv.divergencias',
    );
  }

  const sortedLegs = [...input.legs].sort((left, right) => left.numero_etapa - right.numero_etapa);
  const operationalDates = deriveLegOperationalDates(sortedLegs, input.operationalDate);
  const finalLegIndex = sortedLegs.length - 1;

  if (
    finalLegIndex < 0 &&
    rdvOccurrenceSummary !== null
  ) {
    addFinding(findings, 'RDV_SUMMARY_WITHOUT_LEG', 'rdv');
  }

  const legs = sortedLegs.map((leg, legIndex) => {
    const blockMinutes = durationToMinutes(leg.tempo_total);
    const takeoffToLandingMinutes = durationToMinutes(leg.tempo_decolagem_pouso);
    const unclassifiedIfrMinutes = durationToMinutes(leg.tempo_ifr);
    const nightMinutes = durationToMinutes(leg.tempo_noturno);

    const durationValues = [
      [leg.tempo_total, blockMinutes, 'times.blockMinutes'],
      [leg.tempo_decolagem_pouso, takeoffToLandingMinutes, 'times.takeoffToLandingMinutes'],
      [leg.tempo_ifr, unclassifiedIfrMinutes, 'times.ifrActualMinutes'],
      [leg.tempo_noturno, nightMinutes, 'times.nightMinutes'],
    ] as const;

    for (const [sourceValue, parsedValue, path] of durationValues) {
      if (normalizeText(sourceValue) && parsedValue === null) {
        addFinding(findings, 'DURATION_INVALID', `legs.${legIndex}.${path}`);
      }
    }

    const fuelUnit = mapFuelUnit(leg.unidade_combustivel);
    if (normalizeText(leg.unidade_combustivel) && fuelUnit === null) {
      addFinding(findings, 'FUEL_UNIT_UNKNOWN', `legs.${legIndex}.fuelAtEngineStart.unit`);
    }

    const fuelConsumed =
      leg.combustivel_inicio !== null &&
      leg.combustivel_fim !== null &&
      leg.combustivel_inicio >= leg.combustivel_fim
        ? leg.combustivel_inicio - leg.combustivel_fim
        : null;

    if (
      (leg.combustivel_inicio !== null || leg.combustivel_fim !== null) &&
      fuelConsumed === null
    ) {
      addFinding(findings, 'FUEL_CONSUMPTION_UNAVAILABLE', `legs.${legIndex}.fuelConsumed.value`);
    }

    if (leg.payload !== null) {
      addFinding(findings, 'PAYLOAD_UNIT_UNKNOWN', `legs.${legIndex}.payloadUnit`);
    }

    if (normalizeText(leg.tempo_ifr) !== null) {
      addFinding(findings, 'IFR_CLASSIFICATION_REQUIRED', `legs.${legIndex}.times.ifrActualMinutes`);
    }
    if (leg.starts !== null) {
      addFinding(findings, 'CYCLES_SOURCE_SEMANTICS_UNCONFIRMED', `legs.${legIndex}.cycles`);
    }

    const source = {
      kind: mapSourceKind(leg.origem_dados),
      reference: `cv_voo_etapas:${leg.id}`,
      observedAt: leg.sigvoos_importado_em ?? undefined,
    };

    const fuelQuantity = (value: Nullable<number>) => ({
      value,
      unit: fuelUnit,
      source,
    });

    const isFinalLeg = legIndex === finalLegIndex;

    return {
      sequence: leg.numero_etapa,
      operationalDate: operationalDates[legIndex],
      origin: normalizeText(leg.origem_icao)?.toUpperCase() ?? null,
      destination: normalizeText(leg.destino_icao)?.toUpperCase() ?? null,
      timezone: normalizeText(input.timezone),
      engineStartTime: normalizeClockTime(leg.horario_motor_ligado),
      takeoffTime: normalizeClockTime(leg.horario_decolagem),
      landingTime: normalizeClockTime(leg.horario_pouso),
      engineShutdownTime: normalizeClockTime(leg.horario_motor_desligado),
      times: {
        blockMinutes,
        takeoffToLandingMinutes,
        dayMinutes: null,
        nightMinutes,
        vfrMinutes: null,
        ifrActualMinutes: null,
        ifrSimulatedMinutes: null,
      },
      dayLandings: leg.pousos_diurnos,
      nightLandings: leg.pousos_noturnos,
      cycles: null,
      fuelAtEngineStart: fuelQuantity(leg.combustivel_inicio),
      fuelAtEngineShutdown: fuelQuantity(leg.combustivel_fim),
      fuelConsumed: fuelQuantity(fuelConsumed),
      fuelAdded: fuelQuantity(null),
      personsOnBoard: leg.pax,
      payload: leg.payload,
      payloadUnit: null,
      flightNatureCode: normalizeText(input.flightNatureCode),
      crew: projectCrew(
        input.crew.filter((member) => member.etapa_id === leg.id),
        findings,
        legIndex,
      ),
      occurrenceSummary: isFinalLeg ? rdvOccurrenceSummary : null,
      technicalDiscrepancySummary: null,
      source,
    };
  });

  if (input.rdv && finalLegIndex >= 0) {
    const rdvSource = {
      kind: 'AIRTRUST_CONTROL_FLIGHTS' as const,
      reference: `cv_rdv_operacional:${input.rdv.id}`,
      ...(normalizeText(input.rdv.updated_at)
        ? { observedAt: normalizeText(input.rdv.updated_at) ?? undefined }
        : {}),
    };

    if (rdvOccurrenceSummary !== null) {
      fieldSources.push({
        path: `legs.${finalLegIndex}.occurrenceSummary`,
        source: rdvSource,
      });
    }

  }

  const technicalSource = {
    kind: input.technicalStatus.sourceReference
      ? ('MAINTENANCE_SYSTEM' as const)
      : ('UNKNOWN' as const),
    reference: input.technicalStatus.sourceReference ?? undefined,
    observedAt: input.technicalStatus.observedAt ?? undefined,
  };

  const draft = createEdbDraftSnapshot({
    schemaVersion: EDB_DRAFT_SCHEMA_VERSION,
    draftId: input.draftId,
    tenantId: input.tenantId,
    status: 'shadow_draft',
    createdAt: input.createdAt,
    sourceFlightReference: input.sourceFlightReference,
    operator: input.operator,
    owner: input.owner,
    aircraft: input.aircraft,
    volumeNumber: input.volumeNumber,
    legs,
    technicalStatus: {
      lastMaintenanceIntervention: normalizeText(input.technicalStatus.lastMaintenanceIntervention),
      nextMaintenanceIntervention: normalizeText(input.technicalStatus.nextMaintenanceIntervention),
      airframeHoursRemaining: input.technicalStatus.airframeHoursRemaining,
      returnToServiceReference: normalizeText(input.technicalStatus.returnToServiceReference),
      openDiscrepancyCount: input.technicalStatus.openDiscrepancyCount,
      source: technicalSource,
    },
  });

  return { draft, findings, fieldSources };
}
