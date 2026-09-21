export const PETROBRAS_RVE_FIELDS = [
  'ITEM',
  'EQUIPAMENTO',
  'ATENDIMENTO',
  'ESCALA',
  'DESCRICAO_DA_OPERACAO',
  'GRUPO_DE_CODIGOS',
  'CODIGO_OPERACAO',
  'TPAP',
  'DATA_INICIAL',
  'HORA_INICIAL',
  'DATA_FINAL',
  'HORA_FINAL',
  'HORAS_VOADAS',
  'MIN_VOADOS',
  'HORAS_GLOSADAS_AE',
  'MIN_GLOSADOS',
  'TIPO_ABASTECIMENTO',
  'TIPO_OPERACAO',
  'TIPO_CARGA',
  'QTD_ITEM_AVULSO',
  'OBSERVACOES',
] as const;

export type PetrobrasRveField = (typeof PETROBRAS_RVE_FIELDS)[number];
export type PetrobrasRveRecord = Record<PetrobrasRveField, string>;

export type PetrobrasRveClockPoint = {
  data: string; // DD/MM/YYYY — contrato externo
  hora: string; // HH:MM:SS
};

export type PetrobrasRveLeg = {
  escala: string;
  inicio: PetrobrasRveClockPoint;
  fim: PetrobrasRveClockPoint;
};

export type PetrobrasRveOperationCode = {
  descricao: string;
  grupo: string;
  codigo: string;
};

export type PetrobrasRveOperationProfile = {
  tpAp: string;
  acionamentoDecolagem: PetrobrasRveOperationCode;
  decolagem: PetrobrasRveOperationCode;
  vooRegular: PetrobrasRveOperationCode;
  pouso: PetrobrasRveOperationCode;
  pousoCorte: PetrobrasRveOperationCode;
};

/**
 * Perfil observado no XML de referência AE fornecido em 2026-09-21.
 * É um perfil configurável, não uma afirmação de que os códigos são universais
 * para todos os contratos Petrobras.
 */
export const PETROBRAS_RVE_REFERENCE_AE_PROFILE: PetrobrasRveOperationProfile = {
  tpAp: 'AE',
  acionamentoDecolagem: {
    descricao: 'OA30 - ACIONAMENTO À DECOLAGEM',
    grupo: 'OPEAE1',
    codigo: 'OA30',
  },
  decolagem: {
    descricao: 'PA01 - DECOLAGEM',
    grupo: 'OPSDUA',
    codigo: 'PA01',
  },
  vooRegular: {
    descricao: 'OA08 - EM VÔO REGULAR PAX',
    grupo: 'OPEAE1',
    codigo: 'OA08',
  },
  pouso: {
    descricao: 'PA03 - POUSO',
    grupo: 'OPSDUA',
    codigo: 'PA03',
  },
  pousoCorte: {
    descricao: 'OA31 - POUSO AO CORTE',
    grupo: 'OPEAE1',
    codigo: 'OA31',
  },
};

export type PetrobrasRveAttendance = {
  equipamento: string;
  atendimento: string;
  escalaBase: string;
  acionamento: PetrobrasRveClockPoint;
  decolagem: PetrobrasRveClockPoint;
  pouso: PetrobrasRveClockPoint;
  corte: PetrobrasRveClockPoint;
  etapas: PetrobrasRveLeg[];
};

function parseClock(point: PetrobrasRveClockPoint): number {
  const dateMatch = point.data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const timeMatch = point.hora.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) {
    throw new Error(`PETROBRAS_RVE_INVALID_CLOCK:${point.data} ${point.hora}`);
  }
  const [, dd, mm, yyyy] = dateMatch;
  const [, hh, min, ss] = timeMatch;
  const millis = Date.UTC(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss),
  );
  if (!Number.isFinite(millis)) throw new Error('PETROBRAS_RVE_INVALID_CLOCK');
  return millis;
}

function durationParts(
  start: PetrobrasRveClockPoint,
  end: PetrobrasRveClockPoint,
): { horas: string; minutos: string } {
  const totalMinutes = Math.round((parseClock(end) - parseClock(start)) / 60_000);
  if (totalMinutes < 0) throw new Error('PETROBRAS_RVE_NEGATIVE_DURATION');
  return {
    horas: String(Math.floor(totalMinutes / 60)).padStart(2, '0'),
    minutos: String(totalMinutes % 60).padStart(2, '0'),
  };
}

function baseRecord(params: {
  equipamento: string;
  atendimento: string;
  escala: string;
  op: PetrobrasRveOperationCode;
  tpAp: string;
  inicio: PetrobrasRveClockPoint;
  fim: PetrobrasRveClockPoint;
  duration?: boolean;
}): Omit<PetrobrasRveRecord, 'ITEM'> {
  const duration = params.duration ? durationParts(params.inicio, params.fim) : null;
  return {
    EQUIPAMENTO: params.equipamento,
    ATENDIMENTO: params.atendimento,
    ESCALA: params.escala,
    DESCRICAO_DA_OPERACAO: params.op.descricao,
    GRUPO_DE_CODIGOS: params.op.grupo,
    CODIGO_OPERACAO: params.op.codigo,
    TPAP: params.tpAp,
    DATA_INICIAL: params.inicio.data,
    HORA_INICIAL: params.inicio.hora,
    DATA_FINAL: params.fim.data,
    HORA_FINAL: params.duration ? params.fim.hora : '00:00:00',
    HORAS_VOADAS: duration?.horas ?? '',
    MIN_VOADOS: duration?.minutos ?? '',
    HORAS_GLOSADAS_AE: '',
    MIN_GLOSADOS: '',
    TIPO_ABASTECIMENTO: '',
    TIPO_OPERACAO: '',
    TIPO_CARGA: '',
    QTD_ITEM_AVULSO: '',
    OBSERVACOES: '',
  };
}

export function buildPetrobrasRveRecords(
  attendances: PetrobrasRveAttendance[],
  profile: PetrobrasRveOperationProfile = PETROBRAS_RVE_REFERENCE_AE_PROFILE,
): PetrobrasRveRecord[] {
  const rows: Array<Omit<PetrobrasRveRecord, 'ITEM'>> = [];

  for (const attendance of attendances) {
    rows.push(
      baseRecord({
        equipamento: attendance.equipamento,
        atendimento: attendance.atendimento,
        escala: attendance.escalaBase,
        op: profile.acionamentoDecolagem,
        tpAp: profile.tpAp,
        inicio: attendance.acionamento,
        fim: attendance.decolagem,
        duration: true,
      }),
      baseRecord({
        equipamento: attendance.equipamento,
        atendimento: attendance.atendimento,
        escala: attendance.escalaBase,
        op: profile.decolagem,
        tpAp: profile.tpAp,
        inicio: attendance.decolagem,
        fim: attendance.decolagem,
      }),
    );

    for (const leg of attendance.etapas) {
      rows.push(
        baseRecord({
          equipamento: attendance.equipamento,
          atendimento: attendance.atendimento,
          escala: leg.escala,
          op: profile.vooRegular,
          tpAp: profile.tpAp,
          inicio: leg.inicio,
          fim: leg.fim,
          duration: true,
        }),
      );
    }

    rows.push(
      baseRecord({
        equipamento: attendance.equipamento,
        atendimento: attendance.atendimento,
        escala: attendance.escalaBase,
        op: profile.pouso,
        tpAp: profile.tpAp,
        inicio: attendance.pouso,
        fim: attendance.pouso,
      }),
      baseRecord({
        equipamento: attendance.equipamento,
        atendimento: attendance.atendimento,
        escala: attendance.escalaBase,
        op: profile.pousoCorte,
        tpAp: profile.tpAp,
        inicio: attendance.pouso,
        fim: attendance.corte,
        duration: true,
      }),
    );
  }

  return rows.map((row, index) => ({
    ITEM: String(index + 1).padStart(4, '0'),
    ...row,
  }));
}

function escapeXmlLatin1(value: string): string {
  let result = '';
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (char === '&') result += '&amp;';
    else if (char === '<') result += '&lt;';
    else if (char === '>') result += '&gt;';
    else if (code > 0xff) result += `&#x${code.toString(16).toUpperCase()};`;
    else result += char;
  }
  return result;
}

export function serializePetrobrasRveXml(records: PetrobrasRveRecord[]): string {
  const lines = ['<?xml version="1.0" encoding="ISO-8859-1"?>', '<meadinkent>'];
  for (const record of records) {
    lines.push('\t<RVE>');
    for (const field of PETROBRAS_RVE_FIELDS) {
      lines.push(`\t\t<${field}>${escapeXmlLatin1(record[field] ?? '')}</${field}>`);
    }
    lines.push('\t</RVE>');
  }
  lines.push('</meadinkent>');
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Worker/Fetch APIs default to UTF-8 when given strings. O contrato de
 * referência declara ISO-8859-1, então o body deve ser enviado como bytes.
 */
export function encodePetrobrasRveIso88591(xml: string): Uint8Array {
  const bytes = new Uint8Array(xml.length);
  for (let i = 0; i < xml.length; i += 1) {
    const code = xml.charCodeAt(i);
    if (code > 0xff) {
      throw new Error(`PETROBRAS_RVE_NON_LATIN1_AT:${i}`);
    }
    bytes[i] = code;
  }
  return bytes;
}

export function buildPetrobrasRveXml(
  attendances: PetrobrasRveAttendance[],
  profile: PetrobrasRveOperationProfile = PETROBRAS_RVE_REFERENCE_AE_PROFILE,
): { records: PetrobrasRveRecord[]; xml: string; bytes: Uint8Array } {
  const records = buildPetrobrasRveRecords(attendances, profile);
  const xml = serializePetrobrasRveXml(records);
  return { records, xml, bytes: encodePetrobrasRveIso88591(xml) };
}
