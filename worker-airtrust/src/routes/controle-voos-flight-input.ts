import type { Context } from 'hono';
import type { Env } from '../types';
import { ApiError } from '../middleware/error-handler';
import type { FlightInput, FlightStatus } from '../repositories/controle-voos/rdv-repository';

export type OperationalReadFilters = {
  dataInicio: string;
  dataFim: string;
  status: FlightStatus | null;
  aeronaveId: number | null;
  origemId: number | null;
  destinoId: number | null;
};


const allowedStatuses = new Set<FlightStatus>([
  'planejado',
  'liberado_operacionalmente',
  'em_andamento',
  'pousado',
  'concluido_operacionalmente',
  'cancelado',
  'alternado_divergido',
]);


export function parsePositiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(`${field} invalido`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return parsed;
}

export function parseOptionalPositiveInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  return parsePositiveInteger(value, field);
}

export function normalizeString(value: unknown, field: string, required = false): string | null {
  if (value === null || value === undefined) {
    if (required) throw new ApiError(`${field} obrigatorio`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
    return null;
  }

  const normalized = String(value).trim();
  if (required && normalized.length === 0) {
    throw new ApiError(`${field} obrigatorio`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return normalized.length > 0 ? normalized : null;
}

export function normalizeStatus(value: unknown): FlightStatus {
  const status = String(value || '').trim() as FlightStatus;
  if (!allowedStatuses.has(status)) {
    throw new ApiError('Status de voo invalido', 400, 'CONTROLE_VOOS_INVALID_STATUS');
  }
  return status;
}

export function isIsoDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}


export function parseDateOnlyParam(
  value: string | null | undefined,
  field: string,
  required = false,
): string | null {
  const normalized = normalizeString(value, field, required);
  if (normalized === null) return null;
  if (!isIsoDateOnly(normalized)) {
    throw new ApiError(`${field} invalido`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return normalized;
}

export function parseOperationalReadFilters(
  c: Context<{ Bindings: Env }>,
  options?: { requireRange?: boolean },
): OperationalReadFilters {
  const exactDate = parseDateOnlyParam(c.req.query('data'), 'data');
  const dataInicioQuery = parseDateOnlyParam(c.req.query('data_inicio'), 'data_inicio');
  const dataFimQuery = parseDateOnlyParam(c.req.query('data_fim'), 'data_fim');

  let dataInicio = dataInicioQuery;
  let dataFim = dataFimQuery;

  if (exactDate) {
    dataInicio = exactDate;
    dataFim = exactDate;
  } else if (options?.requireRange) {
    if (!dataInicio || !dataFim) {
      throw new ApiError('Periodo obrigatorio', 400, 'CONTROLE_VOOS_INVALID_PERIOD');
    }
  } else if (!dataInicio && !dataFim) {
    const today = new Date().toISOString().slice(0, 10);
    dataInicio = today;
    dataFim = today;
  } else if (dataInicio && !dataFim) {
    dataFim = dataInicio;
  } else if (!dataInicio && dataFim) {
    dataInicio = dataFim;
  }

  if (!dataInicio || !dataFim) {
    throw new ApiError('Periodo obrigatorio', 400, 'CONTROLE_VOOS_INVALID_PERIOD');
  }
  if (dataFim < dataInicio) {
    throw new ApiError('Periodo invalido', 400, 'CONTROLE_VOOS_INVALID_PERIOD');
  }

  return {
    dataInicio,
    dataFim,
    status: c.req.query('status') ? normalizeStatus(c.req.query('status')) : null,
    aeronaveId: parseOptionalPositiveInteger(c.req.query('aeronave_id'), 'aeronave_id'),
    origemId: parseOptionalPositiveInteger(c.req.query('origem_id'), 'origem_id'),
    destinoId: parseOptionalPositiveInteger(c.req.query('destino_id'), 'destino_id'),
  };
}

export function buildFlightScope(alias: string, empresaId: number, filters: OperationalReadFilters) {
  const clauses = [
    `${alias}.empresa_id = ?`,
    `${alias}.deleted_at IS NULL`,
    `${alias}.data_programacao >= ?`,
    `${alias}.data_programacao <= ?`,
  ];
  const values: unknown[] = [empresaId, filters.dataInicio, filters.dataFim];

  if (filters.status) {
    clauses.push(`${alias}.status = ?`);
    values.push(filters.status);
  }
  if (filters.aeronaveId) {
    clauses.push(`${alias}.aeronave_id = ?`);
    values.push(filters.aeronaveId);
  }
  if (filters.origemId) {
    clauses.push(`${alias}.origem_id = ?`);
    values.push(filters.origemId);
  }
  if (filters.destinoId) {
    clauses.push(`${alias}.destino_id = ?`);
    values.push(filters.destinoId);
  }

  return { where: clauses.join(' AND '), values };
}

export function normalizeFlightInput(
  payload: Record<string, unknown>,
  requireBaseFields: boolean,
): FlightInput {
  const input: FlightInput = {};

  if (payload.prefixo !== undefined || requireBaseFields) {
    input.prefixo = normalizeString(payload.prefixo, 'prefixo', requireBaseFields) || undefined;
  }
  if (payload.data_programacao !== undefined || requireBaseFields) {
    input.data_programacao =
      normalizeString(payload.data_programacao, 'data_programacao', requireBaseFields) || undefined;
  }
  if (payload.origem_id !== undefined || requireBaseFields) {
    input.origem_id = parsePositiveInteger(payload.origem_id, 'origem_id');
  }
  if (payload.destino_id !== undefined || requireBaseFields) {
    input.destino_id = parsePositiveInteger(payload.destino_id, 'destino_id');
  }
  if (payload.numero_voo !== undefined) input.numero_voo = normalizeString(payload.numero_voo, 'numero_voo');
  if (payload.numero_db !== undefined) input.numero_db = normalizeString(payload.numero_db, 'numero_db');
  if (payload.petrobras_equipamento !== undefined) input.petrobras_equipamento = normalizeString(payload.petrobras_equipamento, 'petrobras_equipamento'); if (payload.petrobras_atendimento !== undefined) input.petrobras_atendimento = normalizeString(payload.petrobras_atendimento, 'petrobras_atendimento');
  if (payload.contrato_id !== undefined || requireBaseFields) input.contrato_id = parsePositiveInteger(payload.contrato_id, 'contrato_id');
  if (payload.tipo_voo_id !== undefined || requireBaseFields) {
    input.tipo_voo_id = parsePositiveInteger(payload.tipo_voo_id, 'tipo_voo_id');
  }
  if (payload.natureza_voo_id !== undefined) {
    input.natureza_voo_id = parsePositiveInteger(payload.natureza_voo_id, 'natureza_voo_id');
  }
  if (payload.aeronave_id !== undefined) {
    input.aeronave_id = parseOptionalPositiveInteger(payload.aeronave_id, 'aeronave_id');
  }
  if (payload.horario_previsto_partida !== undefined || requireBaseFields) {
    input.horario_previsto_partida =
      normalizeString(
        payload.horario_previsto_partida,
        'horario_previsto_partida',
        requireBaseFields,
      ) || undefined;
  }
  if (payload.horario_previsto_chegada !== undefined || requireBaseFields) {
    input.horario_previsto_chegada =
      normalizeString(
        payload.horario_previsto_chegada,
        'horario_previsto_chegada',
        requireBaseFields,
      ) || undefined;
  }
  if (payload.horario_real_partida !== undefined) {
    input.horario_real_partida = normalizeString(
      payload.horario_real_partida,
      'horario_real_partida',
    );
  }
  if (payload.horario_real_chegada !== undefined) {
    input.horario_real_chegada = normalizeString(
      payload.horario_real_chegada,
      'horario_real_chegada',
    );
  }
  if (payload.status !== undefined) {
    input.status = normalizeStatus(payload.status);
  } else if (requireBaseFields) {
    input.status = 'planejado';
  }
  if (payload.observacoes !== undefined) {
    input.observacoes = normalizeString(payload.observacoes, 'observacoes');
  }
  if (payload.cancelado_motivo_id !== undefined) {
    input.cancelado_motivo_id = parseOptionalPositiveInteger(
      payload.cancelado_motivo_id,
      'cancelado_motivo_id',
    );
  }
  if (payload.alternado_destino_id !== undefined) {
    input.alternado_destino_id = parseOptionalPositiveInteger(
      payload.alternado_destino_id,
      'alternado_destino_id',
    );
  }

  return input;
}

