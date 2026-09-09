import { ApiError } from '../../middleware/error-handler';
import type { RdvInput } from '../../repositories/controle-voos/rdv-repository';

function parseNonNegativeNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ApiError(`${field} invalido`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return parsed;
}

function parseOptionalNonNegativeNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  return parseNonNegativeNumber(value, field);
}

function parseOptionalNonNegativeInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ApiError(`${field} invalido`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return parsed;
}

function normalizeString(value: unknown, field: string, required = false): string | null {
  if (value === null || value === undefined) {
    if (required) {
      throw new ApiError(`${field} obrigatorio`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
    }
    return null;
  }

  const normalized = String(value).trim();
  if (required && normalized.length === 0) {
    throw new ApiError(`${field} obrigatorio`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return normalized.length > 0 ? normalized : null;
}

function assertTimeOrder(
  start: string | null | undefined,
  end: string | null | undefined,
  code: string,
): void {
  if (!start || !end) return;
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    throw new ApiError('Horario invalido', 400, 'CONTROLE_VOOS_INVALID_TIME');
  }
  if (endTime < startTime) {
    throw new ApiError('Horario final anterior ao inicial', 400, code);
  }
}

export function normalizeRdvInput(
  payload: Record<string, unknown>,
  requireBaseFields: boolean,
): RdvInput {
  const input: RdvInput = {};

  if (payload.numero !== undefined || requireBaseFields) {
    input.numero = normalizeString(payload.numero, 'numero', requireBaseFields) || undefined;
  }
  if (payload.data_voo !== undefined || requireBaseFields) {
    input.data_voo = normalizeString(payload.data_voo, 'data_voo', requireBaseFields) || undefined;
  }
  if (payload.horario_decolagem_real !== undefined) {
    input.horario_decolagem_real = normalizeString(
      payload.horario_decolagem_real,
      'horario_decolagem_real',
    );
  }
  if (payload.horario_pouso_real !== undefined) {
    input.horario_pouso_real = normalizeString(
      payload.horario_pouso_real,
      'horario_pouso_real',
    );
  }
  if (payload.horas_voadas !== undefined) {
    input.horas_voadas = parseOptionalNonNegativeNumber(payload.horas_voadas, 'horas_voadas');
  }
  if (payload.numero_pousos !== undefined) {
    input.numero_pousos = parseOptionalNonNegativeInteger(payload.numero_pousos, 'numero_pousos');
  }
  if (payload.ciclos !== undefined) {
    input.ciclos = parseOptionalNonNegativeInteger(payload.ciclos, 'ciclos');
  }
  if (payload.combustivel_decolagem !== undefined) {
    input.combustivel_decolagem = parseOptionalNonNegativeNumber(
      payload.combustivel_decolagem,
      'combustivel_decolagem',
    );
  }
  if (payload.combustivel_pouso !== undefined) {
    input.combustivel_pouso = parseOptionalNonNegativeNumber(
      payload.combustivel_pouso,
      'combustivel_pouso',
    );
  }
  if (payload.combustivel_consumo !== undefined) {
    input.combustivel_consumo = parseOptionalNonNegativeNumber(
      payload.combustivel_consumo,
      'combustivel_consumo',
    );
  }
  if (payload.pob !== undefined) {
    input.pob = parseOptionalNonNegativeInteger(payload.pob, 'pob');
  }
  if (payload.carga_kg !== undefined) {
    input.carga_kg = parseOptionalNonNegativeNumber(payload.carga_kg, 'carga_kg');
  }
  if (payload.ocorrencias !== undefined) {
    input.ocorrencias = normalizeString(payload.ocorrencias, 'ocorrencias');
  }
  if (payload.divergencias !== undefined) {
    input.divergencias = normalizeString(payload.divergencias, 'divergencias');
  }

  return input;
}

export function assertRdvRules(input: {
  horario_decolagem_real?: string | null;
  horario_pouso_real?: string | null;
  combustivel_decolagem?: number | null;
  combustivel_pouso?: number | null;
  combustivel_consumo?: number | null;
}): void {
  assertTimeOrder(
    input.horario_decolagem_real,
    input.horario_pouso_real,
    'CONTROLE_VOOS_INVALID_RDV_TIME',
  );

  if (input.combustivel_decolagem == null || input.combustivel_pouso == null) return;
  if (input.combustivel_pouso > input.combustivel_decolagem) {
    throw new ApiError('Combustivel incoerente', 400, 'CONTROLE_VOOS_INVALID_RDV_FUEL');
  }
  if (input.combustivel_consumo == null) return;

  const expected = Number((input.combustivel_decolagem - input.combustivel_pouso).toFixed(3));
  const actual = Number(input.combustivel_consumo.toFixed(3));
  if (Math.abs(expected - actual) > 0.01) {
    throw new ApiError('Combustivel incoerente', 400, 'CONTROLE_VOOS_INVALID_RDV_FUEL');
  }
}
