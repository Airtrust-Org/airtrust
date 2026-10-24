import { ApiError } from '../../middleware/error-handler';
import {
  buildPetrobrasRveXml,
  isValidRveGregorianDay,
  isValidRveWallClock,
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
  if (!match ||
      !isValidRveGregorianDay(Number(match[1]), Number(match[2]), Number(match[3]))) {
    throw new ApiError('Data operacional invalida para XML Petrobras', 409, 'CONTROLE_VOOS_RVE_XML_INVALID_DATE');
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function clock(value: string | null, fallbackDate: string): PetrobrasRveClockPoint {
  const raw = String(value || '').trim();
  if (!raw) throw new ApiError('Horario operacional ausente para XML Petrobras', 409, 'CONTROLE_VOOS_RVE_XML_MISSING_CLOCK');

  const simple = raw.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (simple) {
    if (!isValidRveWallClock(Number(simple[1]), Number(simple[2]), Number(simple[3] || '00'))) {
      throw new ApiError('Horario operacional invalido para XML Petrobras', 409, 'CONTROLE_VOOS_RVE_XML_INVALID_CLOCK');
    }
    return { data: ddmmyyyy(fallbackDate), hora: `${simple[1]}:${simple[2]}:${simple[3] || '00'}` };
  }

  // Accept only fully specified local/UTC textual timestamps. Offsets cannot be
  // silently ignored: these output fields are operational wall-clock times.
  const timestamp = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,3})?Z?$/);
  if (timestamp) {
    if (!isValidRveWallClock(Number(timestamp[2]), Number(timestamp[3]), Number(timestamp[4] || '00'))) {
      throw new ApiError('Horario operacional invalido para XML Petrobras', 409, 'CONTROLE_VOOS_RVE_XML_INVALID_CLOCK');
    }
    return { data: ddmmyyyy(timestamp[1]), hora: `${timestamp[2]}:${timestamp[3]}:${timestamp[4] || '00'}` };
  }

  throw new ApiError('Horario operacional invalido para XML Petrobras', 409, 'CONTROLE_VOOS_RVE_XML_INVALID_CLOCK');
}


/**
 * Resolve a finalized flight's events in true operational order:
 * engine start, each departure/landing pair, then final engine stop.
 * Legacy HH:MM has no calendar date; assign at most one provable
 * midnight rollover. A backwards clock without a plausible overnight
 * transition is ambiguous and must not be invented in a Petrobras report.
 */
function chronologicalRveClocks(
  events: Array<string | null>,
  fallbackDate: string,
): PetrobrasRveClockPoint[] {
  const points = events.map((value) => clock(value, fallbackDate));
  const isWallClock = events.map((value) => /^\d{2}:\d{2}(?::\d{2})?$/.test(String(value || '').trim()));
  if (isWallClock.some(Boolean) && isWallClock.some((wall) => !wall)) {
    throw new ApiError(
      'Formatos de horario misturados sem data explicita para XML Petrobras',
      409, 'CONTROLE_VOOS_RVE_XML_MIXED_CLOCK_FORMATS',
    );
  }

  const hasLegacyClocks = isWallClock[0];
  const base = String(fallbackDate || '').trim().slice(0, 10);
  ddmmyyyy(base); // Reject an invalid operational flight date before computing offsets.
  const match = base.match(/^(\d{4})-(\d{2})-(\d{2})$/)!;
  const addDays = (dayOffset: number): string => {
    // setUTCFullYear also handles 0001–0099 without Date.UTC's 1900 offset.
    const date = new Date(0);
    date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + dayOffset);
    date.setUTCHours(0, 0, 0, 0);
    return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCFullYear()).padStart(4, '0')}`;
  };
  const badOrder = () => new ApiError(
    'Sequencia de horarios ambigua para XML Petrobras; informe data e hora completas',
    409, 'CONTROLE_VOOS_RVE_XML_CLOCK_ORDER_AMBIGUOUS',
  );

  let previousSecond: number | null = null;
  let previousInstant: number | null = null;
  let dayOffset = 0;
  return points.map((point) => {
    const [hours, minutes, seconds] = point.hora.split(':').map(Number);
    const secondOfDay = hours * 3600 + minutes * 60 + seconds;
    if (hasLegacyClocks) {
      if (previousSecond !== null && secondOfDay < previousSecond) {
        const impliedGap = 86400 - previousSecond + secondOfDay;
        // Never infer an overnight flight from a random reversed clock:
        // require a later-day time followed by an early-day time, with a
        // plausible <=12-hour forward interval; only one rollover per flight.
        if (dayOffset !== 0 || previousSecond < 12 * 3600 ||
            secondOfDay > 12 * 3600 || impliedGap > 12 * 3600) throw badOrder();
        dayOffset += 1;
      }
      previousSecond = secondOfDay;
      return { data: addDays(dayOffset), hora: point.hora };
    }
    const dated = point.data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)!;
    const date = new Date(0);
    date.setUTCFullYear(Number(dated[3]), Number(dated[2]) - 1, Number(dated[1]));
    date.setUTCHours(hours, minutes, seconds, 0);
    if (previousInstant !== null && date.getTime() < previousInstant) throw badOrder();
    previousInstant = date.getTime();
    return point;
  });
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

  const timeline = chronologicalRveClocks([
    first.horario_motor_ligado,
    ...ordered.flatMap((stage) => [stage.horario_decolagem, stage.horario_pouso]),
    last.horario_motor_desligado,
  ], flight.data_voo);
  return {
    ...identity,
    escalaBase,
    acionamento: timeline[0],
    decolagem: timeline[1],
    pouso: timeline[ordered.length * 2],
    corte: timeline[ordered.length * 2 + 1],
    etapas: ordered.map((stage, index) => {
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
        inicio: timeline[index * 2 + 1],
        fim: timeline[index * 2 + 2],
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
