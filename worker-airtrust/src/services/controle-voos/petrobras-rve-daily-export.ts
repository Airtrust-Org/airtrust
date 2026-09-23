import { ApiError } from '../../middleware/error-handler';
import {
  buildPetrobrasRveXml,
  type PetrobrasRveAttendance,
  type PetrobrasRveClockPoint,
} from './petrobras-rve-xml';

export type PetrobrasRveStageRow = {
  numero_etapa: number;
  origem_icao: string | null;
  destino_icao: string | null;
  horario_motor_ligado: string | null;
  horario_decolagem: string | null;
  horario_pouso: string | null;
  horario_motor_desligado: string | null;
};

export type PetrobrasRveFlightRow = {
  voo_id: number;
  data_voo: string;
  prefixo: string;
  petrobras_equipamento: string | null;
  petrobras_atendimento: string | null;
  sigvoos_flight_report_id: number | null;
  sigvoos_flight_report_id_confident: number | null;
};

function ddmmyyyy(value: string): string {
  const date = String(value || '').trim().slice(0, 10);
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new ApiError('Data operacional invalida para XML Petrobras', 409, 'CONTROLE_VOOS_RVE_XML_INVALID_DATE');
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function clock(value: string | null, fallbackDate: string): PetrobrasRveClockPoint {
  const raw = String(value || '').trim();
  if (!raw) throw new ApiError('Horario operacional ausente para XML Petrobras', 409, 'CONTROLE_VOOS_RVE_XML_MISSING_CLOCK');

  const simple = raw.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (simple) {
    return { data: ddmmyyyy(fallbackDate), hora: `${simple[1]}:${simple[2]}:${simple[3] || '00'}` };
  }

  const timestamp = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (timestamp) {
    return { data: ddmmyyyy(timestamp[1]), hora: `${timestamp[2]}:${timestamp[3]}:${timestamp[4] || '00'}` };
  }

  throw new ApiError('Horario operacional invalido para XML Petrobras', 409, 'CONTROLE_VOOS_RVE_XML_INVALID_CLOCK');
}

export function resolvePetrobrasRveExternalIdentity(flight: PetrobrasRveFlightRow): {
  equipamento: string;
  atendimento: string;
} {
  const equipamento = String(flight.petrobras_equipamento || '').trim();
  const explicitAttendance = String(flight.petrobras_atendimento || '').trim();
  const confidentSigvoos =
    Number(flight.sigvoos_flight_report_id_confident || 0) === 1 &&
    flight.sigvoos_flight_report_id != null
      ? String(flight.sigvoos_flight_report_id)
      : '';
  const atendimento = explicitAttendance || confidentSigvoos;

  if (!equipamento || !atendimento) {
    const missing = [!equipamento ? 'EQUIPAMENTO' : null, !atendimento ? 'ATENDIMENTO' : null]
      .filter(Boolean)
      .join(', ');
    throw new ApiError(
      `Voo ${flight.voo_id} sem identificador Petrobras: ${missing}`,
      409,
      'CONTROLE_VOOS_RVE_XML_EXTERNAL_ID_REQUIRED',
    );
  }
  return { equipamento, atendimento };
}

export function buildPetrobrasRveAttendanceFromFlight(
  flight: PetrobrasRveFlightRow,
  stages: PetrobrasRveStageRow[],
): PetrobrasRveAttendance {
  if (!stages.length) {
    throw new ApiError(`Voo ${flight.voo_id} sem etapas para XML Petrobras`, 409, 'CONTROLE_VOOS_RVE_XML_STAGES_REQUIRED');
  }
  const ordered = [...stages].sort((a, b) => a.numero_etapa - b.numero_etapa);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const identity = resolvePetrobrasRveExternalIdentity(flight);
  const escalaBase = String(first.origem_icao || '').trim().toUpperCase();
  if (!escalaBase) {
    throw new ApiError(`Voo ${flight.voo_id} sem origem ICAO`, 409, 'CONTROLE_VOOS_RVE_XML_BASE_REQUIRED');
  }

  return {
    ...identity,
    escalaBase,
    acionamento: clock(first.horario_motor_ligado, flight.data_voo),
    decolagem: clock(first.horario_decolagem, flight.data_voo),
    pouso: clock(last.horario_pouso, flight.data_voo),
    corte: clock(last.horario_motor_desligado, flight.data_voo),
    etapas: ordered.map((stage) => {
      const escala = String(stage.destino_icao || '').trim().toUpperCase();
      if (!escala) {
        throw new ApiError(
          `Voo ${flight.voo_id}, etapa ${stage.numero_etapa} sem destino ICAO`,
          409,
          'CONTROLE_VOOS_RVE_XML_SCALE_REQUIRED',
        );
      }
      return {
        escala,
        inicio: clock(stage.horario_decolagem, flight.data_voo),
        fim: clock(stage.horario_pouso, flight.data_voo),
      };
    }),
  };
}

export function buildDailyPetrobrasRveXml(
  rows: Array<{ flight: PetrobrasRveFlightRow; stages: PetrobrasRveStageRow[] }>,
) {
  if (!rows.length) {
    throw new ApiError('Nenhum RDV finalizado encontrado para a data selecionada', 404, 'CONTROLE_VOOS_RVE_XML_NO_FINALIZED_FLIGHTS');
  }
  return buildPetrobrasRveXml(
    rows.map(({ flight, stages }) => buildPetrobrasRveAttendanceFromFlight(flight, stages)),
  );
}
