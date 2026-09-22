import { ApiError } from '../../middleware/error-handler';

export const FLIGHT_PLAN_SCHEMA_CHANGE_ID = 'controle-voos-flight-plan-0509';
export const FLIGHT_PLAN_PAYLOAD_SCHEMA_VERSION = 1 as const;

export type StructuredFlightPlanCommonV1 = {
  identificacao_aeronave: string;
  regra_voo: '' | 'I' | 'V' | 'Y' | 'Z';
  tipo_voo: '' | 'S' | 'N' | 'G' | 'M' | 'X';
  numero_aeronaves: number;
  tipo_aeronave: string;
  categoria_esteira: '' | 'J' | 'H' | 'M' | 'L';
  equipamento: string;
  vigilancia: string;
};

export type StructuredFlightPlanLegV1 = {
  ordem: number;
  origem: string;
  data_partida_utc: string;
  eobt_utc: string;
  velocidade_cruzeiro: string;
  nivel_cruzeiro: string;
  rota: string;
  destino: string;
  eet: string;
  alternado_1: string;
  alternado_2: string;
  outros_dados: string;
  autonomia: string;
  pessoas_bordo: string;
};

export type StructuredFlightPlanPayloadV1 = {
  schema_version: 1;
  comuns: StructuredFlightPlanCommonV1;
  pernas: StructuredFlightPlanLegV1[];
  contato: {
    responsavel: string;
    telefone: string;
  };
};

export type StructuredFlightPlanReference = {
  identificacaoAeronave: string;
  dataOperacional: string;
  horarioPrevistoPartida: string;
  horarioPrevistoChegada: string;
  modeloAeronave: string | null;
  routePoints: Array<{ codigo: string; codigo_icao?: string | null; nome?: string | null }>;
  plannedPax: number | null;
  crewCount: number;
};

export type FlightPlanLegReadiness = {
  ordem: number;
  ready: boolean;
  missing: string[];
  warnings: string[];
  preview: string | null;
};

export type FlightPlanReadiness = {
  ready: boolean;
  missing_common: string[];
  warnings: string[];
  pernas: FlightPlanLegReadiness[];
};

function normalizeUpper(value: unknown, max = 500): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max);
}

function normalizePlain(value: unknown, max = 160): string {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeChoice<T extends string>(value: unknown, allowed: readonly T[]): T | '' {
  const normalized = normalizeUpper(value, 8) as T;
  return allowed.includes(normalized) ? normalized : '';
}

function normalizePositiveInteger(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) return fallback;
  return parsed;
}

function normalizeDate(value: unknown): string {
  const normalized = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function normalizeHhmm(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 4);
  return digits.length === 4 ? digits : '';
}

function isHhmm(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(2));
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function durationHhmmFromIso(start: string, end: string): string {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return '';
  const totalMinutes = Math.round((endMs - startMs) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 99) return '';
  return String(hours).padStart(2, '0') + String(minutes).padStart(2, '0');
}

function utcDateAndTime(value: string, fallbackDate: string): { date: string; hhmm: string } {
  const raw = String(value || '').trim();
  if (!raw) return { date: normalizeDate(fallbackDate), hhmm: '' };
  const timestamp = Date.parse(raw);
  if (Number.isFinite(timestamp) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const date = new Date(timestamp);
    return {
      date: date.toISOString().slice(0, 10),
      hhmm: date.toISOString().slice(11, 16).replace(':', ''),
    };
  }
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (match) return { date: match[1], hhmm: `${match[2]}${match[3]}` };
  return { date: normalizeDate(fallbackDate), hhmm: '' };
}

function routeCode(point: { codigo?: string | null; codigo_icao?: string | null }): string {
  return normalizeUpper(point.codigo_icao || point.codigo, 12);
}

export function buildDefaultStructuredFlightPlan(
  reference: StructuredFlightPlanReference,
): StructuredFlightPlanPayloadV1 {
  const points = reference.routePoints.map((point) => ({ ...point, normalized: routeCode(point) })).filter((p) => p.normalized);
  const departure = utcDateAndTime(reference.horarioPrevistoPartida, reference.dataOperacional);
  const singleLegEet = points.length === 2
    ? durationHhmmFromIso(reference.horarioPrevistoPartida, reference.horarioPrevistoChegada)
    : '';
  const plannedPob = reference.plannedPax == null
    ? ''
    : String(Math.max(0, reference.plannedPax + Math.max(0, reference.crewCount)));

  const pernas: StructuredFlightPlanLegV1[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    pernas.push({
      ordem: index + 1,
      origem: points[index].normalized,
      data_partida_utc: index === 0 ? departure.date : normalizeDate(reference.dataOperacional),
      eobt_utc: index === 0 ? departure.hhmm : '',
      velocidade_cruzeiro: '',
      nivel_cruzeiro: '',
      rota: 'DCT',
      destino: points[index + 1].normalized,
      eet: index === 0 && points.length === 2 ? singleLegEet : '',
      alternado_1: '',
      alternado_2: '',
      outros_dados: '',
      autonomia: '',
      pessoas_bordo: index === 0 ? plannedPob : '',
    });
  }

  if (pernas.length === 0) {
    pernas.push({
      ordem: 1,
      origem: '',
      data_partida_utc: departure.date,
      eobt_utc: departure.hhmm,
      velocidade_cruzeiro: '',
      nivel_cruzeiro: '',
      rota: 'DCT',
      destino: '',
      eet: singleLegEet,
      alternado_1: '',
      alternado_2: '',
      outros_dados: '',
      autonomia: '',
      pessoas_bordo: plannedPob,
    });
  }

  return {
    schema_version: 1,
    comuns: {
      identificacao_aeronave: normalizeUpper(reference.identificacaoAeronave, 12).replace(/[^A-Z0-9]/g, '').slice(0, 7),
      regra_voo: '',
      tipo_voo: '',
      numero_aeronaves: 1,
      tipo_aeronave: '',
      categoria_esteira: '',
      equipamento: '',
      vigilancia: '',
    },
    pernas,
    contato: { responsavel: '', telefone: '' },
  };
}

export function normalizeStructuredFlightPlanPayload(
  value: unknown,
  fallback?: StructuredFlightPlanPayloadV1,
): StructuredFlightPlanPayloadV1 {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const commonInput = input.comuns && typeof input.comuns === 'object'
    ? (input.comuns as Record<string, unknown>)
    : {};
  const contactInput = input.contato && typeof input.contato === 'object'
    ? (input.contato as Record<string, unknown>)
    : {};
  const legInputs = Array.isArray(input.pernas) ? input.pernas : [];
  const fallbackLegs = fallback?.pernas || [];
  const normalizedLegs = (legInputs.length ? legInputs : fallbackLegs).slice(0, 20).map((raw, index) => {
    const leg = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const base = fallbackLegs[index] || ({} as StructuredFlightPlanLegV1);
    return {
      ordem: index + 1,
      origem: normalizeUpper(leg.origem ?? base.origem, 12),
      data_partida_utc: normalizeDate(leg.data_partida_utc ?? base.data_partida_utc),
      eobt_utc: normalizeHhmm(leg.eobt_utc ?? base.eobt_utc),
      velocidade_cruzeiro: normalizeUpper(leg.velocidade_cruzeiro ?? base.velocidade_cruzeiro, 8),
      nivel_cruzeiro: normalizeUpper(leg.nivel_cruzeiro ?? base.nivel_cruzeiro, 8),
      rota: normalizeUpper(leg.rota ?? base.rota, 500),
      destino: normalizeUpper(leg.destino ?? base.destino, 12),
      eet: normalizeHhmm(leg.eet ?? base.eet),
      alternado_1: normalizeUpper(leg.alternado_1 ?? base.alternado_1, 12),
      alternado_2: normalizeUpper(leg.alternado_2 ?? base.alternado_2, 12),
      outros_dados: normalizeUpper(leg.outros_dados ?? base.outros_dados, 1000),
      autonomia: normalizeHhmm(leg.autonomia ?? base.autonomia),
      pessoas_bordo: normalizeUpper(leg.pessoas_bordo ?? base.pessoas_bordo, 8),
    } satisfies StructuredFlightPlanLegV1;
  });

  if (normalizedLegs.length === 0 && fallback) normalizedLegs.push(...fallback.pernas);

  return {
    schema_version: 1,
    comuns: {
      identificacao_aeronave: normalizeUpper(
        commonInput.identificacao_aeronave ?? fallback?.comuns.identificacao_aeronave,
        12,
      ).replace(/[^A-Z0-9]/g, '').slice(0, 7),
      regra_voo: normalizeChoice(commonInput.regra_voo ?? fallback?.comuns.regra_voo, ['I', 'V', 'Y', 'Z'] as const),
      tipo_voo: normalizeChoice(commonInput.tipo_voo ?? fallback?.comuns.tipo_voo, ['S', 'N', 'G', 'M', 'X'] as const),
      numero_aeronaves: normalizePositiveInteger(commonInput.numero_aeronaves ?? fallback?.comuns.numero_aeronaves, 1),
      tipo_aeronave: normalizeUpper(commonInput.tipo_aeronave ?? fallback?.comuns.tipo_aeronave, 8),
      categoria_esteira: normalizeChoice(
        commonInput.categoria_esteira ?? fallback?.comuns.categoria_esteira,
        ['J', 'H', 'M', 'L'] as const,
      ),
      equipamento: normalizeUpper(commonInput.equipamento ?? fallback?.comuns.equipamento, 40).replace(/\s+/g, ''),
      vigilancia: normalizeUpper(commonInput.vigilancia ?? fallback?.comuns.vigilancia, 40).replace(/\s+/g, ''),
    },
    pernas: normalizedLegs,
    contato: {
      responsavel: normalizePlain(contactInput.responsavel ?? fallback?.contato.responsavel, 160),
      telefone: normalizePlain(contactInput.telefone ?? fallback?.contato.telefone, 80),
    },
  };
}

function commonMissing(common: StructuredFlightPlanCommonV1): string[] {
  const missing: string[] = [];
  if (!common.identificacao_aeronave) missing.push('Identificação da aeronave (campo 7)');
  if (!common.regra_voo) missing.push('Regra de voo (campo 8)');
  if (!common.tipo_voo) missing.push('Tipo de voo (campo 8)');
  if (!common.tipo_aeronave) missing.push('Tipo de aeronave (campo 9)');
  if (!common.categoria_esteira) missing.push('Categoria de esteira (campo 9)');
  if (!common.equipamento) missing.push('Equipamento/capacidades (campo 10)');
  if (!common.vigilancia) missing.push('Vigilância (campo 10)');
  return missing;
}

function legReadiness(common: StructuredFlightPlanCommonV1, leg: StructuredFlightPlanLegV1): FlightPlanLegReadiness {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!leg.origem) missing.push('Aeródromo/local de partida (campo 13)');
  if (!leg.data_partida_utc) missing.push('Data UTC da partida');
  if (!leg.eobt_utc || !isHhmm(leg.eobt_utc)) missing.push('EOBT UTC válido (campo 13)');
  if (!leg.velocidade_cruzeiro) missing.push('Velocidade de cruzeiro (campo 15)');
  if (!leg.nivel_cruzeiro) missing.push('Nível/altitude de cruzeiro (campo 15)');
  if (!leg.rota) missing.push('Rota (campo 15)');
  if (!leg.destino) missing.push('Destino (campo 16)');
  if (!leg.eet || !isHhmm(leg.eet)) missing.push('EET válido (campo 16)');

  if (leg.autonomia && !isHhmm(leg.autonomia)) warnings.push('Autonomia deve usar HHMM.');
  if (leg.pessoas_bordo && !/^(?:TBN|\d{1,3})$/.test(leg.pessoas_bordo)) {
    warnings.push('Pessoas a bordo deve ser um número ou TBN.');
  }
  if (leg.origem && !/^[A-Z0-9]{4}$/.test(leg.origem)) warnings.push('Partida deve ser conferida conforme MCA 100-11.');
  if (leg.destino && !/^[A-Z0-9]{4}$/.test(leg.destino)) warnings.push('Destino deve ser conferido conforme MCA 100-11.');

  const ready = commonMissing(common).length === 0 && missing.length === 0;
  return {
    ordem: leg.ordem,
    ready,
    missing,
    warnings,
    preview: ready ? buildFplMessage(common, leg) : null,
  };
}

export function evaluateStructuredFlightPlan(payload: StructuredFlightPlanPayloadV1): FlightPlanReadiness {
  const missingCommon = commonMissing(payload.comuns);
  const warnings: string[] = [];
  if (payload.pernas.length === 0) warnings.push('O plano precisa conter ao menos uma perna.');
  const legs = payload.pernas.map((leg) => legReadiness(payload.comuns, leg));
  return {
    ready: missingCommon.length === 0 && legs.length > 0 && legs.every((leg) => leg.ready),
    missing_common: missingCommon,
    warnings,
    pernas: legs,
  };
}

export function buildFplMessage(common: StructuredFlightPlanCommonV1, leg: StructuredFlightPlanLegV1): string {
  const aircraftCount = common.numero_aeronaves > 1 ? String(common.numero_aeronaves) : '';
  const alternates = [leg.alternado_1, leg.alternado_2].filter(Boolean).join(' ');
  const item16 = `${leg.destino}${leg.eet}${alternates ? ` ${alternates}` : ''}`;
  const other = leg.outros_dados || '0';
  return [
    `(FPL-${common.identificacao_aeronave}-${common.regra_voo}${common.tipo_voo}`,
    `-${aircraftCount}${common.tipo_aeronave}/${common.categoria_esteira}`,
    `-${common.equipamento}/${common.vigilancia}`,
    `-${leg.origem}${leg.eobt_utc}`,
    `-${leg.velocidade_cruzeiro}${leg.nivel_cruzeiro} ${leg.rota}`,
    `-${item16}`,
    `-${other})`,
  ].join('\n');
}

export function assertStructuredFlightPlanReady(payload: StructuredFlightPlanPayloadV1): void {
  const readiness = evaluateStructuredFlightPlan(payload);
  if (!readiness.ready) {
    const missing = [
      ...readiness.missing_common,
      ...readiness.pernas.flatMap((leg) => leg.missing.map((item) => `Perna ${leg.ordem}: ${item}`)),
    ];
    throw new ApiError(
      `Plano de voo incompleto: ${missing.join('; ')}`,
      400,
      'CONTROLE_VOOS_FLIGHT_PLAN_NOT_READY',
    );
  }
}

export function buildProjectedEobtUtc(payload: StructuredFlightPlanPayloadV1): string | null {
  const leg = payload.pernas[0];
  if (!leg?.data_partida_utc || !isHhmm(leg.eobt_utc)) return null;
  return `${leg.data_partida_utc}T${leg.eobt_utc.slice(0, 2)}:${leg.eobt_utc.slice(2)}:00Z`;
}
