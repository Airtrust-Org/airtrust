import type {
  FlightRow,
  RdvRow,
} from '../../repositories/controle-voos/rdv-repository';
import type { EtapaRow } from '../controle-voos/rdv-etapas';
import type {
  EdbAircraftIdentity,
  EdbCrewMember,
  EdbMaintenanceSnapshot,
  EdbOperatorRegulation,
} from './contracts';
import type { EdbRdvShadowSource } from './rdv-shadow-projection';

export interface ControleVoosCrewForEdb {
  voo_id: number;
  etapa_id: number | null;
  funcionario_id: number;
  funcao: string;
  funcionario_nome: string | null;
  funcionario_codigo_anac: string | null;
}

export interface ControleVoosEdbShadowAdapterInput {
  flight: FlightRow;
  rdv: RdvRow;
  stages: EtapaRow[];
  crew: ControleVoosCrewForEdb[];
  aircraft: EdbAircraftIdentity;
  maintenance: EdbMaintenanceSnapshot | null;
  operatorRegulation: EdbOperatorRegulation;
  natureLabel: string | null;
  capturedAt: string;
}

function parseHhMmDurationToMinutes(value: string | null): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes > 59) return null;
  return hours * 60 + minutes;
}

function mapOperationalRole(value: string): EdbCrewMember['operationalRole'] {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'PIC') return 'PIC';
  if (normalized === 'SIC') return 'SIC';
  if (normalized === 'COM') return 'COM';
  if (normalized === 'MEC') return 'MEC';
  return 'OTHER';
}

function crewForStage(
  crew: ControleVoosCrewForEdb[],
  stageId: number,
): EdbCrewMember[] {
  return crew
    .filter((member) => member.etapa_id === null || member.etapa_id === stageId)
    .map((member) => ({
      employeeId: member.funcionario_id,
      fullName: member.funcionario_nome?.trim() || '',
      anacCode: member.funcionario_codigo_anac?.trim() || null,
      operationalRole: mapOperationalRole(member.funcao),
      // Current operational roles must not be guessed into ANAC DBE function codes.
      regulatoryFunctionCode: null,
    }));
}

function assertSourceScope(input: ControleVoosEdbShadowAdapterInput): void {
  const { flight, rdv, stages, crew } = input;
  if (rdv.voo_id !== flight.id || rdv.empresa_id !== flight.empresa_id) {
    throw new Error('RDV does not belong to the supplied flight/tenant');
  }

  for (const stage of stages) {
    if (stage.voo_id !== flight.id || stage.empresa_id !== flight.empresa_id) {
      throw new Error(`Stage ${stage.id} does not belong to the supplied flight/tenant`);
    }
  }

  for (const member of crew) {
    if (member.voo_id !== flight.id) {
      throw new Error(`Crew member ${member.funcionario_id} does not belong to the supplied flight`);
    }
  }
}

/**
 * Converts the existing operational Controle de Voos structures into the
 * normalized, read-only shadow source consumed by the eDB projector.
 *
 * This function performs no DB reads/writes and intentionally leaves fields
 * null when current semantics are not sufficient for a regulatory record.
 */
export function adaptControleVoosToEdbShadowSource(
  input: ControleVoosEdbShadowAdapterInput,
): EdbRdvShadowSource {
  assertSourceScope(input);

  return {
    operatorCompanyId: input.flight.empresa_id,
    operatorRegulation: input.operatorRegulation,
    flightId: input.flight.id,
    rdvId: input.rdv.id,
    rdvVersion: input.rdv.versao,
    date: input.rdv.data_voo || input.flight.data_programacao,
    nature: input.natureLabel,
    occurrences: input.rdv.ocorrencias,
    divergences: input.rdv.divergencias,
    aircraft: {
      ...input.aircraft,
      owners: input.aircraft.owners ? [...input.aircraft.owners] : null,
      operators: input.aircraft.operators ? [...input.aircraft.operators] : null,
    },
    maintenance: input.maintenance
      ? {
          lastIntervention: { ...input.maintenance.lastIntervention },
          nextIntervention: { ...input.maintenance.nextIntervention },
        }
      : null,
    capturedAt: input.capturedAt,
    stages: input.stages.map((stage) => ({
      stageId: stage.id,
      origin: stage.origem_icao,
      destination: stage.destino_icao,
      engineStartAt: stage.horario_motor_ligado,
      takeoffAt: stage.horario_decolagem,
      landingAt: stage.horario_pouso,
      engineShutdownAt: stage.horario_motor_desligado,
      // `tempo_total` is motor-on → motor-off in the current RDV service.
      // Do not treat it as regulatory total flight time without a confirmed definition.
      totalMinutes: null,
      nightMinutes: parseHhMmDurationToMinutes(stage.tempo_noturno),
      landingsDay: stage.pousos_diurnos,
      landingsNight: stage.pousos_noturnos,
      starts: stage.starts,
      ifrUnclassifiedMinutes: parseHhMmDurationToMinutes(stage.tempo_ifr),
      fuelAtStageStart: stage.combustivel_inicio,
      passengers: stage.pax,
      payloadKg: stage.payload,
      crew: crewForStage(input.crew, stage.id),
    })),
  };
}
