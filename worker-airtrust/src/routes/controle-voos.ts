import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { checkPermission } from '../middleware/tenant';
import type { Env } from '../types';
import {
  parseSigvoosRealPreviewRequest,
  runSigvoosRealApiPreview,
  SigvoosRealPreviewError,
} from '../services/controle-voos/sigvoos-real-preview';
import {
  buildSigvoosShadowCompareReport,
  parseSigvoosShadowCompareWindow,
  SigvoosShadowCompareError,
} from '../services/controle-voos/sigvoos-shadow-compare';
import { listControleVoosJornadas } from '../services/controle-voos/controle-voos-jornadas';
import {
  type FlightStatus,
  type FlightRow,
  type RdvStatus,
  type RdvRow,
  type FlightInput,
  type RdvInput,
  FLIGHT_SELECT,
  RDV_SELECT,
  allowedRdvFields,
  getEmpresaIdSafe,
  getActorId,
  getFlightOrThrow,
  getActiveRdvByFlight,
  getRdvOrThrow,
  buildMergedRdv,
  recordFlightEvent,
  maybeRecordSystemAudit,
  getFuncionarioIdForUser,
  buildRdvVersionGuardedUpdate,
  mapRdvOperacionalUniqueConstraintError,
} from '../repositories/controle-voos/rdv-repository';
import { 
  RDV_CAPABILITIES, 
  assertRdvSelfScope, 
  requireExpectedRdvVersion, 
  assertCasApplied 
} from '../services/controle-voos/rdv-workflow';

type OperationalReadFilters = {
  dataInicio: string;
  dataFim: string;
  status: FlightStatus | null;
  aeronaveId: number | null;
  origemId: number | null;
  destinoId: number | null;
};

type CatalogConfig = {
  table: string;
  fields: string;
  orderBy: string;
};

type SigvoosRefreshPreviewCounts = {
  stagingTotal: number;
  stagingPending: number;
  stagingProcessed: number;
  stagingConflict: number;
  openConflicts: number;
  importedFlights: number;
  importedStages: number;
  importedCrew: number;
};

const controleVoos = new Hono<{ Bindings: Env }>();

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

const allowedStatuses = new Set<FlightStatus>([
  'planejado',
  'liberado_operacionalmente',
  'em_andamento',
  'pousado',
  'concluido_operacionalmente',
  'cancelado',
  'alternado_divergido',
]);

const allowedFields = new Set([
  'prefixo',
  'data_programacao',
  'origem_id',
  'destino_id',
  'tipo_voo_id',
  'natureza_voo_id',
  'aeronave_id',
  'horario_previsto_partida',
  'horario_previsto_chegada',
  'horario_real_partida',
  'horario_real_chegada',
  'status',
  'observacoes',
  'cancelado_motivo_id',
  'alternado_destino_id',
]);

// A criacao pode receber o estado inicial. Transicoes posteriores de status
// sao governadas exclusivamente por POST /voos/:id/status, que aplica os
// gates de dominio antes de persistir a mudanca.
const allowedPatchFields = new Set([...allowedFields].filter((field) => field !== 'status'));

const allowedFieldsWithVersion = new Set([...allowedPatchFields, 'versao']);

const blockedFields = new Set([
  'id',
  'empresa_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'created_by',
  'updated_by',
  'usuario_id',
]);

const blockedScopePatterns = [
  new RegExp('\\b' + 'assi' + 'natura' + '\\b', 'i'),
  new RegExp('\\b' + 'assi' + 'nado' + '\\b', 'i'),
  new RegExp('\\b' + 'vali' + 'dado' + '\\b', 'i'),
  new RegExp('\\b' + 'valida' + 'cao' + '\\b', 'i'),
  new RegExp('\\b' + 'homolo' + 'gado' + '\\b', 'i'),
  new RegExp('\\bANAC\\s+' + 'aprovado' + '\\b', 'i'),
  new RegExp('\\b' + 'e' + 'DB' + '\\b', 'i'),
  new RegExp('\\b' + 'SDR' + 'Me' + '\\b', 'i'),
  new RegExp('\\b' + 'R' + 'AS' + '\\b', 'i'),
  new RegExp('\\b' + 'fis' + 'cal' + '\\b', 'i'),
  new RegExp('\\b' + 'regulated' + '_', 'i'),
];

const statusTransitions: Record<FlightStatus, FlightStatus[]> = {
  planejado: ['liberado_operacionalmente', 'cancelado'],
  liberado_operacionalmente: ['em_andamento', 'cancelado'],
  em_andamento: ['pousado', 'alternado_divergido'],
  pousado: ['concluido_operacionalmente'],
  concluido_operacionalmente: [],
  cancelado: [],
  alternado_divergido: ['pousado', 'concluido_operacionalmente'],
};

const catalogos: Record<string, CatalogConfig> = {
  aeroportos: {
    table: 'cv_aeroportos',
    fields: 'id, codigo, codigo_icao, codigo_iata, nome, cidade, uf, tipo, descricao, ativo, ordem',
    orderBy: 'ordem ASC, nome ASC',
  },
  tipos: {
    table: 'cv_tipos_voo',
    fields: 'id, codigo, nome, descricao, ativo, ordem',
    orderBy: 'ordem ASC, nome ASC',
  },
  naturezas: {
    table: 'cv_naturezas_voo',
    fields: 'id, codigo, nome, descricao, ativo, ordem',
    orderBy: 'ordem ASC, nome ASC',
  },
  motivos: {
    table: 'cv_motivos_operacionais',
    fields: 'id, codigo, nome, tipo, descricao, ativo, ordem',
    orderBy: 'tipo ASC, ordem ASC, nome ASC',
  },
};

function requireControleVoosWrite(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (!checkPermission(c, 'editor')) {
      throw new ApiError('Permissao insuficiente', 403, 'CONTROLE_VOOS_RBAC_FORBIDDEN');
    }

    await next();
  };
}

function requireControleVoosSigvoosPreview(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (!checkPermission(c, 'manager')) {
      throw new ApiError('Permissao insuficiente', 403, 'CONTROLE_VOOS_SIGVOOS_RBAC_FORBIDDEN');
    }

    await next();
  };
}

function parsePositiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(`${field} invalido`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return parsed;
}

function parseOptionalPositiveInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  return parsePositiveInteger(value, field);
}

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
    if (required) throw new ApiError(`${field} obrigatorio`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
    return null;
  }

  const normalized = String(value).trim();
  if (required && normalized.length === 0) {
    throw new ApiError(`${field} obrigatorio`, 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
  return normalized.length > 0 ? normalized : null;
}

function normalizeStatus(value: unknown): FlightStatus {
  const status = String(value || '').trim() as FlightStatus;
  if (!allowedStatuses.has(status)) {
    throw new ApiError('Status de voo invalido', 400, 'CONTROLE_VOOS_INVALID_STATUS');
  }
  return status;
}

function isIsoDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function isIsoLikeDateTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function assertTimeOrder(
  start: string | null | undefined,
  end: string | null | undefined,
  code: string,
) {
  if (!start || !end) return;
  if (!isIsoLikeDateTime(start) || !isIsoLikeDateTime(end)) {
    throw new ApiError('Horario invalido', 400, 'CONTROLE_VOOS_INVALID_TIME');
  }
  if (Date.parse(end) < Date.parse(start)) {
    throw new ApiError('Horario final anterior ao inicial', 400, code);
  }
}

function assertNoBlockedScopeTerms(value: unknown): void {
  if (typeof value === 'string') {
    if (blockedScopePatterns.some((pattern) => pattern.test(value))) {
      throw new ApiError('Payload contem termo fora do escopo', 400, 'CONTROLE_VOOS_SCOPE_TERM');
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) assertNoBlockedScopeTerms(item);
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      assertNoBlockedScopeTerms(key);
      assertNoBlockedScopeTerms(nested);
    }
  }
}

function assertPayloadFields(payload: Record<string, unknown>, allowed: Set<string>): void {
  for (const field of Object.keys(payload)) {
    const normalized = field.toLowerCase();
    if (blockedFields.has(normalized) || !allowed.has(field)) {
      throw new ApiError(`Campo nao permitido: ${field}`, 400, 'CONTROLE_VOOS_FORBIDDEN_FIELD');
    }
    assertNoBlockedScopeTerms(field);
  }
  assertNoBlockedScopeTerms(payload);
}

async function parseJsonPayload(c: Context<{ Bindings: Env }>): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('Payload JSON invalido', 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Payload JSON invalido', 400, 'CONTROLE_VOOS_INVALID_PAYLOAD');
  }
}

async function parseOptionalJsonPayload(
  c: Context<{ Bindings: Env }>,
): Promise<Record<string, unknown>> {
  const contentType = c.req.header('content-type') || '';
  const length = c.req.header('content-length');
  if (!contentType.includes('application/json') && (!length || Number(length) === 0)) {
    return {};
  }

  try {
    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
    return body as Record<string, unknown>;
  } catch {
    return {};
  }
}

function assertNoTenantOverride(payload: Record<string, unknown>): void {
  if (
    'empresaId' in payload ||
    'empresa_id' in payload ||
    'tenantId' in payload ||
    'tenant_id' in payload
  ) {
    throw new ApiError(
      'Tenant arbitrario nao permitido neste gatilho',
      400,
      'CONTROLE_VOOS_SIGVOOS_TENANT_OVERRIDE_FORBIDDEN',
    );
  }
}

function parseDateOnlyParam(
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

function parseOperationalReadFilters(
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

function buildFlightScope(alias: string, empresaId: number, filters: OperationalReadFilters) {
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

function normalizeFlightInput(
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
  if (payload.tipo_voo_id !== undefined || requireBaseFields) {
    input.tipo_voo_id = parsePositiveInteger(payload.tipo_voo_id, 'tipo_voo_id');
  }
  if (payload.natureza_voo_id !== undefined || requireBaseFields) {
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

function normalizeRdvInput(payload: Record<string, unknown>, requireBaseFields: boolean): RdvInput {
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
    input.horario_pouso_real = normalizeString(payload.horario_pouso_real, 'horario_pouso_real');
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

function assertFlightTimes(input: {
  horario_previsto_partida?: string | null;
  horario_previsto_chegada?: string | null;
  horario_real_partida?: string | null;
  horario_real_chegada?: string | null;
}) {
  assertTimeOrder(
    input.horario_previsto_partida,
    input.horario_previsto_chegada,
    'CONTROLE_VOOS_INVALID_PLANNED_TIME',
  );
  assertTimeOrder(
    input.horario_real_partida,
    input.horario_real_chegada,
    'CONTROLE_VOOS_INVALID_ACTUAL_TIME',
  );
}

function assertRdvTimes(input: {
  horario_decolagem_real?: string | null;
  horario_pouso_real?: string | null;
}) {
  assertTimeOrder(
    input.horario_decolagem_real,
    input.horario_pouso_real,
    'CONTROLE_VOOS_INVALID_RDV_TIME',
  );
}

function assertFuelConsistency(input: {
  combustivel_decolagem?: number | null;
  combustivel_pouso?: number | null;
  combustivel_consumo?: number | null;
}) {
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

function assertRdvRules(input: {
  horario_decolagem_real?: string | null;
  horario_pouso_real?: string | null;
  combustivel_decolagem?: number | null;
  combustivel_pouso?: number | null;
  combustivel_consumo?: number | null;
}) {
  assertRdvTimes(input);
  assertFuelConsistency(input);
}

function assertStatusTransition(from: FlightStatus, to: FlightStatus): void {
  if (from === to) return;
  if (!statusTransitions[from].includes(to)) {
    throw new ApiError(
      'Transicao de status nao permitida',
      409,
      'CONTROLE_VOOS_INVALID_TRANSITION',
    );
  }
}

// Concorrencia otimista (CAS) de cv_voos — aggregate root proprio, distinto
// do versionamento de cv_rdv_operacional (services/controle-voos/rdv-workflow.ts).
// cv_voos e mutado diretamente por PATCH/status mesmo em voos sem RDV algum,
// entao nao pode depender da versao do RDV. Mesmo padrao de erro/codigo dos
// helpers equivalentes do RDV (requireExpectedRdvVersion/assertRdvVersion/
// assertCasApplied), com codigos proprios para nao colidir na resposta.
function requireExpectedFlightVersion(payload: Record<string, unknown>): number {
  if (
    !Object.prototype.hasOwnProperty.call(payload, 'versao') ||
    payload.versao === null ||
    payload.versao === undefined ||
    payload.versao === ''
  ) {
    throw new ApiError('versao e obrigatoria', 400, 'CONTROLE_VOOS_FLIGHT_VERSION_REQUIRED');
  }
  const parsed = typeof payload.versao === 'number' ? payload.versao : Number(payload.versao);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError('versao invalida', 400, 'CONTROLE_VOOS_FLIGHT_VERSION_INVALID');
  }
  return parsed;
}

function assertFlightVersion(existing: FlightRow, expectedVersion: unknown): void {
  const parsed = typeof expectedVersion === 'number' ? expectedVersion : Number(expectedVersion);
  if (!Number.isInteger(parsed) || parsed !== existing.versao) {
    throw new ApiError(
      'Versao do voo desatualizada. Recarregue os dados antes de continuar.',
      409,
      'CONTROLE_VOOS_FLIGHT_VERSION_CONFLICT',
    );
  }
}

// Cobre a janela entre o SELECT que validou a versao e o UPDATE em si: se
// outra requisicao venceu a corrida nesse intervalo, o UPDATE atual afeta 0
// linhas mesmo com assertFlightVersion ja tendo passado (mesmo raciocinio
// documentado em rdv-repository.ts para cv_rdv_operacional).
function assertFlightCasApplied(result: { meta: { changes: number } }): void {
  if (!result.meta.changes) {
    throw new ApiError(
      'Versao do voo desatualizada. Recarregue os dados antes de continuar.',
      409,
      'CONTROLE_VOOS_FLIGHT_VERSION_CONFLICT',
    );
  }
}

async function assertCatalogItem(
  db: D1Database,
  table: string,
  id: number | null | undefined,
  empresaId: number,
  field: string,
  expectedType?: string,
): Promise<void> {
  if (id === null || id === undefined) return;

  const row = expectedType
    ? await db
        .prepare(
          `
          SELECT id
          FROM ${table}
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL
            AND ativo = 1
            AND tipo = ?
          LIMIT 1
        `,
        )
        .bind(id, empresaId, expectedType)
        .first<{ id: number }>()
    : await db
        .prepare(
          `
          SELECT id
          FROM ${table}
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL
            AND ativo = 1
          LIMIT 1
        `,
        )
        .bind(id, empresaId)
        .first<{ id: number }>();

  if (!row) {
    throw new ApiError(`${field} nao pertence a empresa`, 400, 'CONTROLE_VOOS_INVALID_CATALOG');
  }
}

// `aeronaves` e uma tabela pre-existente (routes/aeronaves.ts), fora do
// schema cv_* do Controle de Voos, com colunas proprias (`status` em vez de
// `ativo`) — nao pode reusar assertCatalogItem, que assume o padrao comum
// dos catalogos cv_* (`ativo = 1`). Confirmado por erro real em staging
// (SQLITE_ERROR: no such column: ativo) antes desta correcao.
async function assertAeronaveBelongsToEmpresa(
  db: D1Database,
  id: number | null | undefined,
  empresaId: number,
): Promise<void> {
  if (id === null || id === undefined) return;
  // Mesma definicao de "ativa" ja usada por GET /api/aeronaves?somente_ativas=1
  // (routes/aeronaves.ts) e pelo frontend (isAeronaveAtiva em EvdPage.tsx):
  // status NULL/vazio conta como ATIVO; só os códigos de indisponibilidade
  // abaixo excluem. Sem isso, uma aeronave inativa (fora de operação) podia
  // ser vinculada a um voo novo.
  const row = await db
    .prepare(
      `
      SELECT id FROM aeronaves
      WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
        AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) NOT IN ('I', 'INATIVO', 'INDISPONIVEL', 'INDISPONÍVEL')
      LIMIT 1
    `,
    )
    .bind(id, empresaId)
    .first<{ id: number }>();
  if (!row) {
    throw new ApiError('aeronave_id nao pertence a empresa', 400, 'CONTROLE_VOOS_INVALID_CATALOG');
  }
}

async function assertCatalogsForInput(
  db: D1Database,
  input: FlightInput,
  empresaId: number,
): Promise<void> {
  await assertAeronaveBelongsToEmpresa(db, input.aeronave_id, empresaId);
  await assertCatalogItem(db, 'cv_aeroportos', input.origem_id, empresaId, 'origem_id');
  await assertCatalogItem(db, 'cv_aeroportos', input.destino_id, empresaId, 'destino_id');
  await assertCatalogItem(
    db,
    'cv_aeroportos',
    input.alternado_destino_id,
    empresaId,
    'alternado_destino_id',
  );
  await assertCatalogItem(db, 'cv_tipos_voo', input.tipo_voo_id, empresaId, 'tipo_voo_id');
  await assertCatalogItem(
    db,
    'cv_naturezas_voo',
    input.natureza_voo_id,
    empresaId,
    'natureza_voo_id',
  );
  await assertCatalogItem(
    db,
    'cv_motivos_operacionais',
    input.cancelado_motivo_id,
    empresaId,
    'cancelado_motivo_id',
    input.status === 'cancelado' ? 'cancelamento' : undefined,
  );
}

function assertCancellationReason(input: Pick<FlightInput, 'status' | 'cancelado_motivo_id'>) {
  if (input.status === 'cancelado' && !input.cancelado_motivo_id) {
    throw new ApiError(
      'Motivo operacional obrigatorio para cancelamento',
      400,
      'CONTROLE_VOOS_CANCEL_REASON_REQUIRED',
    );
  }
}

function buildMergedFlight(existing: FlightRow, input: FlightInput): FlightInput {
  return {
    prefixo: input.prefixo ?? existing.prefixo,
    data_programacao: input.data_programacao ?? existing.data_programacao,
    origem_id: input.origem_id ?? existing.origem_id,
    destino_id: input.destino_id ?? existing.destino_id,
    tipo_voo_id: input.tipo_voo_id ?? existing.tipo_voo_id,
    natureza_voo_id: input.natureza_voo_id ?? existing.natureza_voo_id,
    aeronave_id: input.aeronave_id !== undefined ? input.aeronave_id : existing.aeronave_id,
    horario_previsto_partida: input.horario_previsto_partida ?? existing.horario_previsto_partida,
    horario_previsto_chegada: input.horario_previsto_chegada ?? existing.horario_previsto_chegada,
    horario_real_partida:
      input.horario_real_partida !== undefined
        ? input.horario_real_partida
        : existing.horario_real_partida,
    horario_real_chegada:
      input.horario_real_chegada !== undefined
        ? input.horario_real_chegada
        : existing.horario_real_chegada,
    status: input.status ?? existing.status,
    observacoes: input.observacoes !== undefined ? input.observacoes : existing.observacoes,
    cancelado_motivo_id:
      input.cancelado_motivo_id !== undefined
        ? input.cancelado_motivo_id
        : existing.cancelado_motivo_id,
    alternado_destino_id:
      input.alternado_destino_id !== undefined
        ? input.alternado_destino_id
        : existing.alternado_destino_id,
  };
}

function catalogKey(rawName: string): keyof typeof catalogos | null {
  const name = rawName.trim().toLowerCase().replace(/_/g, '-');
  if (name === 'aeroportos') return 'aeroportos';
  if (name === 'tipos' || name === 'tipos-voo') return 'tipos';
  if (name === 'naturezas' || name === 'naturezas-voo') return 'naturezas';
  if (name === 'motivos' || name === 'motivos-operacionais') return 'motivos';
  return null;
}

async function queryCount(db: D1Database, sql: string, ...values: unknown[]): Promise<number> {
  const row = await db
    .prepare(sql)
    .bind(...values)
    .first<{ total: number }>();
  return Number(row?.total || 0);
}

async function buildSigvoosRefreshPreview(
  db: D1Database,
  empresaId: number,
): Promise<{
  counts: SigvoosRefreshPreviewCounts;
  lastImportedAt: string | null;
}> {
  const [
    stagingTotal,
    stagingPending,
    stagingProcessed,
    stagingConflict,
    openConflicts,
    importedFlights,
    importedStages,
    importedCrew,
    lastImported,
  ] = await Promise.all([
    queryCount(
      db,
      'SELECT COUNT(*) AS total FROM cv_sigvoos_staging WHERE empresa_id = ? AND deleted_at IS NULL',
      empresaId,
    ),
    queryCount(
      db,
      "SELECT COUNT(*) AS total FROM cv_sigvoos_staging WHERE empresa_id = ? AND import_status = 'PENDING' AND deleted_at IS NULL",
      empresaId,
    ),
    queryCount(
      db,
      "SELECT COUNT(*) AS total FROM cv_sigvoos_staging WHERE empresa_id = ? AND import_status = 'PROCESSED' AND deleted_at IS NULL",
      empresaId,
    ),
    queryCount(
      db,
      "SELECT COUNT(*) AS total FROM cv_sigvoos_staging WHERE empresa_id = ? AND import_status = 'CONFLICT' AND deleted_at IS NULL",
      empresaId,
    ),
    queryCount(
      db,
      "SELECT COUNT(*) AS total FROM cv_conflitos_integracao WHERE empresa_id = ? AND status = 'ABERTO' AND deleted_at IS NULL",
      empresaId,
    ),
    queryCount(
      db,
      "SELECT COUNT(*) AS total FROM cv_voos WHERE empresa_id = ? AND origem_importacao = 'SIGVOOS' AND deleted_at IS NULL",
      empresaId,
    ),
    queryCount(
      db,
      "SELECT COUNT(*) AS total FROM cv_voo_etapas WHERE empresa_id = ? AND origem_dados = 'SIGVOOS' AND deleted_at IS NULL",
      empresaId,
    ),
    queryCount(
      db,
      'SELECT COUNT(*) AS total FROM cv_voo_tripulantes WHERE empresa_id = ? AND sigvoos_staff_id IS NOT NULL AND deleted_at IS NULL',
      empresaId,
    ),
    db
      .prepare(
        `
        SELECT MAX(sigvoos_importado_em) AS lastImportedAt
        FROM cv_voos
        WHERE empresa_id = ?
          AND deleted_at IS NULL
      `,
      )
      .bind(empresaId)
      .first<{ lastImportedAt: string | null }>(),
  ]);

  return {
    counts: {
      stagingTotal,
      stagingPending,
      stagingProcessed,
      stagingConflict,
      openConflicts,
      importedFlights,
      importedStages,
      importedCrew,
    },
    lastImportedAt: lastImported?.lastImportedAt || null,
  };
}

controleVoos.post(
  '/sigvoos/sync-preview',
  auth(),
  requireControleVoosSigvoosPreview(),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      throw new ApiError('Empresa nao identificada', 401, 'CONTROLE_VOOS_SIGVOOS_TENANT_REQUIRED');
    }

    const payload = await parseOptionalJsonPayload(c);
    assertNoTenantOverride(payload);

    const enabled = c.env.CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED === 'true';
    if (!enabled) {
      return c.json({
        success: true,
        data: {
          mode: 'preview',
          enabled: false,
          tenantScoped: true,
          writesEnabled: false,
          realApiCalled: false,
          provider: 'SIGVOOS',
          empresaId,
          status: 'FEATURE_DISABLED',
          message: 'Preview runtime SIGVOOS desativado por feature flag.',
          counts: {
            stagingTotal: 0,
            stagingPending: 0,
            stagingProcessed: 0,
            stagingConflict: 0,
            openConflicts: 0,
            importedFlights: 0,
            importedStages: 0,
            importedCrew: 0,
          },
          lastImportedAt: null,
        },
      });
    }

    const preview = await buildSigvoosRefreshPreview(c.env.DB, empresaId);

    return c.json({
      success: true,
      data: {
        mode: 'preview',
        enabled,
        tenantScoped: true,
        writesEnabled: false,
        realApiCalled: false,
        provider: 'SIGVOOS',
        empresaId,
        status: 'READY',
        message: 'Previa SIGVOOS disponivel sem chamada externa e sem gravacao.',
        ...preview,
      },
    });
  },
);

controleVoos.post(
  '/sigvoos/real-preview',
  auth(),
  requireControleVoosSigvoosPreview(),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      throw new ApiError('Empresa nao identificada', 401, 'CONTROLE_VOOS_SIGVOOS_TENANT_REQUIRED');
    }

    const payload = await parseOptionalJsonPayload(c);
    assertNoTenantOverride(payload);

    const enabled = c.env.CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED === 'true';
    if (!enabled) {
      return c.json({
        success: true,
        data: {
          mode: 'real-preview',
          enabled: false,
          tenantScoped: true,
          writesEnabled: false,
          realApiCalled: false,
          provider: 'SIGVOOS',
          empresaId,
          status: 'FEATURE_DISABLED',
          message: 'Preview real SIGVOOS desativado por feature flag.',
          summary: {
            recordsReceived: 0,
            candidateFlights: 0,
            withFlightReportId: 0,
            withoutFlightReportId: 0,
            crewWithStaffId: 0,
            crewWithOnlyInscription: 0,
            potentialConflictsEstimated: 0,
            missingFields: {},
            sensitiveFieldsDetected: [],
            observedTopLevelFields: [],
            sampleShape: [],
            contractErrors: [],
          },
        },
      });
    }

    try {
      const request = parseSigvoosRealPreviewRequest(payload);
      const preview = await runSigvoosRealApiPreview(c.env.DB, empresaId, c.env, request);
      return c.json({ success: true, data: preview });
    } catch (error) {
      const safePreviewError = error as { name?: string; code?: unknown; status?: unknown };
      if (
        error instanceof SigvoosRealPreviewError ||
        (safePreviewError.name === 'SigvoosRealPreviewError' &&
          typeof safePreviewError.code === 'string')
      ) {
        const status = typeof safePreviewError.status === 'number' ? safePreviewError.status : 502;
        throw new ApiError(
          'Preview real SIGVOOS indisponivel',
          status,
          String(safePreviewError.code),
        );
      }
      throw new ApiError(
        'Preview real SIGVOOS indisponivel',
        502,
        'CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_FAILED',
      );
    }
  },
);

controleVoos.get(
  '/sigvoos/shadow-compare',
  auth(),
  requireControleVoosSigvoosPreview(),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      throw new ApiError('Empresa nao identificada', 401, 'CONTROLE_VOOS_SIGVOOS_TENANT_REQUIRED');
    }

    if (c.env.ENVIRONMENT !== 'staging' && c.env.ENVIRONMENT !== 'production') {
      throw new ApiError(
        'Shadow compare SIGVOOS indisponivel',
        404,
        'CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_STAGING_ONLY',
      );
    }

    const enabled = c.env.CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_ENABLED === 'true';
    if (!enabled) {
      throw new ApiError(
        'Shadow compare SIGVOOS indisponivel',
        404,
        'CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_DISABLED',
      );
    }

    try {
      const window = parseSigvoosShadowCompareWindow({
        from: c.req.query('from'),
        to: c.req.query('to'),
      });
      const rawRole = (c.get as (key: string) => unknown)('userRole');
      const role = typeof rawRole === 'string' ? rawRole : null;
      const report = await buildSigvoosShadowCompareReport(c.env.DB, empresaId, window, { role });
      return c.json({ success: true, data: report });
    } catch (error) {
      const safeError = error as { name?: string; code?: unknown; status?: unknown };
      if (
        error instanceof SigvoosShadowCompareError ||
        (safeError.name === 'SigvoosShadowCompareError' && typeof safeError.code === 'string')
      ) {
        const status = typeof safeError.status === 'number' ? safeError.status : 400;
        throw new ApiError('Shadow compare SIGVOOS indisponivel', status, String(safeError.code));
      }
      throw new ApiError(
        'Shadow compare SIGVOOS indisponivel',
        502,
        'CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_FAILED',
      );
    }
  },
);

controleVoos.get('/jornadas', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const filters = parseOperationalReadFilters(c);

  const result = await listControleVoosJornadas(c.env.DB, empresaId, {
    dataInicio: filters.dataInicio,
    dataFim: filters.dataFim,
  });

  return c.json({
    success: true,
    data: {
      uso_operacional_interno: true,
      nao_regulado: true,
      fonte: 'controle_voos',
      periodo: result.periodo,
      total: result.total,
      items: result.items,
    },
  });
});

controleVoos.get('/voos', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const page = Math.max(parseInt(c.req.query('page') || '1', 10) || 1, 1);
  const requestedLimit =
    parseInt(c.req.query('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
  const offset = (page - 1) * limit;
  const filters = ['empresa_id = ?', 'deleted_at IS NULL'];
  const values: unknown[] = [empresaId];

  const status = c.req.query('status');
  if (status) {
    filters.push('status = ?');
    values.push(normalizeStatus(status));
  }

  const dataInicio = c.req.query('data_inicio');
  if (dataInicio) {
    filters.push('data_programacao >= ?');
    values.push(dataInicio);
  }

  const dataFim = c.req.query('data_fim');
  if (dataFim) {
    filters.push('data_programacao <= ?');
    values.push(dataFim);
  }

  const where = filters.join(' AND ');
  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM cv_voos WHERE ${where}`)
    .bind(...values)
    .first<{ total: number }>();

  const { results } = await c.env.DB.prepare(
    `
    SELECT ${FLIGHT_SELECT}
    FROM cv_voos
    WHERE ${where}
    ORDER BY data_programacao DESC, horario_previsto_partida DESC, id DESC
    LIMIT ? OFFSET ?
  `,
  )
    .bind(...values, limit, offset)
    .all<FlightRow>();

  const total = totalRow?.total || 0;
  return c.json({
    success: true,
    data: results || [],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

controleVoos.post('/voos', auth(), requireControleVoosWrite(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = getActorId(c);
  const payload = await parseJsonPayload(c);
  assertPayloadFields(payload, allowedFields);
  const input = normalizeFlightInput(payload, true);

  assertFlightTimes(input);
  assertCancellationReason(input);
  await assertCatalogsForInput(c.env.DB, input, empresaId);

  const result = await c.env.DB.prepare(
    `
    INSERT INTO cv_voos (
      empresa_id, prefixo, data_programacao, origem_id, destino_id,
      tipo_voo_id, natureza_voo_id, aeronave_id,
      horario_previsto_partida, horario_previsto_chegada,
      horario_real_partida, horario_real_chegada,
      status, observacoes, cancelado_motivo_id, alternado_destino_id,
      created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `,
  )
    .bind(
      empresaId,
      input.prefixo,
      input.data_programacao,
      input.origem_id,
      input.destino_id,
      input.tipo_voo_id,
      input.natureza_voo_id,
      input.aeronave_id || null,
      input.horario_previsto_partida,
      input.horario_previsto_chegada,
      input.horario_real_partida || null,
      input.horario_real_chegada || null,
      input.status || 'planejado',
      input.observacoes || null,
      input.cancelado_motivo_id || null,
      input.alternado_destino_id || null,
      userId,
      userId,
    )
    .run();

  const newId = Number(result.meta.last_row_id);
  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: newId,
    tipoEvento: 'sistema',
    statusNovo: input.status || 'planejado',
    descricao: 'Voo criado',
    metadata: { fields: Object.keys(payload).sort() },
    usuarioId: userId,
  });

  await maybeRecordSystemAudit(c, 'cv_voos', 'INSERT', newId, null, input);
  const created = await getFlightOrThrow(c.env.DB, String(newId), empresaId);

  return c.json({ success: true, data: created }, 201);
});

controleVoos.get('/voos/:id', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const flight = await getFlightOrThrow(c.env.DB, c.req.param('id'), empresaId);
  return c.json({ success: true, data: flight });
});

controleVoos.patch('/voos/:id', auth(), requireControleVoosWrite(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = getActorId(c);
  const id = c.req.param('id');
  const existing = await getFlightOrThrow(c.env.DB, id, empresaId);
  const payload = await parseJsonPayload(c);
  assertPayloadFields(payload, allowedFieldsWithVersion);
  const expectedVersion = requireExpectedFlightVersion(payload);
  assertFlightVersion(existing, expectedVersion);
  if (Object.keys(payload).filter((field) => field !== 'versao').length === 0) {
    throw new ApiError('Nenhum campo para atualizar', 400, 'CONTROLE_VOOS_EMPTY_PATCH');
  }

  const input = normalizeFlightInput(payload, false);
  const merged = buildMergedFlight(existing, input);
  assertFlightTimes(merged);
  assertCancellationReason(merged);
  if (input.status) assertStatusTransition(existing.status, input.status);
  await assertCatalogsForInput(c.env.DB, merged, empresaId);

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const field of allowedPatchFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      fields.push(`${field} = ?`);
      values.push(input[field as keyof FlightInput] ?? null);
    }
  }

  fields.push('versao = versao + 1', 'updated_by = ?', 'updated_at = datetime("now")');
  values.push(userId, id, empresaId, existing.versao);

  const eventoTipo = input.status && input.status !== existing.status ? 'status' : 'observacao';
  const eventoStatusNovo = merged.status || existing.status;
  const [updateResult] = await c.env.DB.batch([
    c.env.DB.prepare(
      `
      UPDATE cv_voos
      SET ${fields.join(', ')}
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
        AND versao = ?
    `,
    ).bind(...values),
    c.env.DB.prepare(
      `
      INSERT INTO cv_voo_eventos (
        empresa_id, voo_id, tipo_evento, status_anterior, status_novo,
        descricao, motivo_id, metadata_json, usuario_id, created_by, updated_by,
        created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
      WHERE (SELECT changes()) > 0
    `,
    ).bind(
      empresaId,
      existing.id,
      eventoTipo,
      existing.status,
      eventoStatusNovo,
      'Voo atualizado',
      merged.cancelado_motivo_id || null,
      JSON.stringify({
        fields: Object.keys(payload)
          .filter((field) => field !== 'versao')
          .sort(),
      }),
      userId,
      userId,
      userId,
    ),
  ]);

  assertFlightCasApplied(updateResult);

  await maybeRecordSystemAudit(c, 'cv_voos', 'UPDATE', id, existing, input);
  const updated = await getFlightOrThrow(c.env.DB, id, empresaId);
  return c.json({ success: true, data: updated });
});

controleVoos.post('/voos/:id/status', auth(), requireControleVoosWrite(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = getActorId(c);
  const id = c.req.param('id');
  const existing = await getFlightOrThrow(c.env.DB, id, empresaId);
  const payload = await parseJsonPayload(c);
  const allowedStatusPayloadFields = new Set([
    'status',
    'motivo_id',
    'cancelado_motivo_id',
    'descricao',
    'versao',
  ]);
  assertPayloadFields(payload, allowedStatusPayloadFields);
  const expectedVersion = requireExpectedFlightVersion(payload);
  assertFlightVersion(existing, expectedVersion);

  const status = normalizeStatus(payload.status);
  const motivoId = parseOptionalPositiveInteger(
    payload.cancelado_motivo_id ?? payload.motivo_id,
    'motivo_id',
  );
  const descricao = normalizeString(payload.descricao, 'descricao');

  assertStatusTransition(existing.status, status);
  if (status === 'cancelado' && !motivoId) {
    throw new ApiError(
      'Motivo operacional obrigatorio para cancelamento',
      400,
      'CONTROLE_VOOS_CANCEL_REASON_REQUIRED',
    );
  }
  await assertCatalogItem(
    c.env.DB,
    'cv_motivos_operacionais',
    motivoId,
    empresaId,
    'motivo_id',
    status === 'cancelado' ? 'cancelamento' : undefined,
  );

  const [updateResult] = await c.env.DB.batch([
    c.env.DB.prepare(
      `
      UPDATE cv_voos
      SET status = ?,
          cancelado_motivo_id = CASE WHEN ? IS NOT NULL THEN ? ELSE cancelado_motivo_id END,
          versao = versao + 1,
          updated_by = ?,
          updated_at = datetime('now')
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
        AND versao = ?
    `,
    ).bind(status, motivoId, motivoId, userId, id, empresaId, existing.versao),
    c.env.DB.prepare(
      `
      INSERT INTO cv_voo_eventos (
        empresa_id, voo_id, tipo_evento, status_anterior, status_novo,
        descricao, motivo_id, usuario_id, created_by, updated_by,
        created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
      WHERE (SELECT changes()) > 0
    `,
    ).bind(
      empresaId,
      existing.id,
      'status',
      existing.status,
      status,
      descricao || 'Status atualizado',
      motivoId,
      userId,
      userId,
      userId,
    ),
  ]);

  assertFlightCasApplied(updateResult);

  await maybeRecordSystemAudit(
    c,
    'cv_voos',
    'UPDATE',
    id,
    { status: existing.status, cancelado_motivo_id: existing.cancelado_motivo_id },
    { status, motivo_id: motivoId },
  );

  const updated = await getFlightOrThrow(c.env.DB, id, empresaId);
  return c.json({ success: true, data: updated });
});

controleVoos.get('/voos/:id/rdv', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const vooId = c.req.param('id');
  const flight = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, flight.id, RDV_CAPABILITIES.visualizarProprio);
  const rdv = await getActiveRdvByFlight(c.env.DB, flight.id, empresaId);
  return c.json({ success: true, data: rdv });
});

// Escrita do rascunho exige capability real: Coordenação com
// `visualizar_todos` (via assertRdvSelfScope) OU piloto com
// `editar_rascunho_proprio` + vínculo de tripulação. O role genérico
// `editor`/`student` sozinho nunca libera a escrita.
controleVoos.put('/voos/:id/rdv', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const flight = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(
    c,
    c.env.DB,
    empresaId,
    flight.id,
    RDV_CAPABILITIES.editarRascunhoProprio,
  );
  const payload = await parseJsonPayload(c);
  assertPayloadFields(payload, new Set([...allowedRdvFields, 'versao']));
  const existing = await getActiveRdvByFlight(c.env.DB, flight.id, empresaId);
  const input = normalizeRdvInput(payload, !existing);
  const merged = existing ? buildMergedRdv(existing, input) : input;

  assertRdvRules(merged);

  if (existing?.status === 'preenchimento_finalizado') {
    throw new ApiError('RDV com preenchimento finalizado', 409, 'CONTROLE_VOOS_RDV_LOCKED');
  }

  if (!existing) {
    try {
      const createResult = await c.env.DB.prepare(
        `
          INSERT INTO cv_rdv_operacional (
            empresa_id, voo_id, numero, data_voo,
            horario_decolagem_real, horario_pouso_real,
            horas_voadas, numero_pousos, ciclos,
            combustivel_decolagem, combustivel_pouso, combustivel_consumo,
            pob, carga_kg, ocorrencias, divergencias,
            status, responsavel_preenchimento_id, preenchido_em,
            versao, created_by, updated_by, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            'rascunho', ?, datetime('now'),
            1, ?, ?, datetime('now'), datetime('now')
          )
        `,
      )
        .bind(
          empresaId,
          flight.id,
          input.numero,
          input.data_voo,
          input.horario_decolagem_real || null,
          input.horario_pouso_real || null,
          input.horas_voadas ?? null,
          input.numero_pousos ?? null,
          input.ciclos ?? null,
          input.combustivel_decolagem ?? null,
          input.combustivel_pouso ?? null,
          input.combustivel_consumo ?? null,
          input.pob ?? null,
          input.carga_kg ?? null,
          input.ocorrencias || null,
          input.divergencias || null,
          userId,
          userId,
          userId,
        )
        .run();

      const created = await getRdvOrThrow(c.env.DB, Number(createResult.meta.last_row_id), empresaId);

      await recordFlightEvent({
        db: c.env.DB,
        empresaId,
        vooId: flight.id,
        tipoEvento: 'rdv',
        statusAnterior: flight.status,
        statusNovo: flight.status,
        descricao: 'RDV operacional criado',
        metadata: { action: 'create', rdv_id: created.id, fields: Object.keys(payload).sort(), versaoNova: 1 },
        usuarioId: userId,
      });

      await maybeRecordSystemAudit(c, 'cv_rdv_operacional', 'INSERT', created.id, null, { ...input, versaoNova: 1 });
      return c.json({ success: true, data: created }, 201);
    } catch (err: unknown) {
      const mapped = mapRdvOperacionalUniqueConstraintError(err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  const expectedVersion = requireExpectedRdvVersion(payload);
  
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const field of allowedRdvFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      fields.push(`${field} = ?`);
      values.push(input[field as keyof RdvInput] ?? null);
    }
  }

  fields.push(
    'status = ?',
    'responsavel_preenchimento_id = ?',
    'preenchido_em = datetime("now")',
    'versao = versao + 1',
    'updated_by = ?',
    'updated_at = datetime("now")',
  );
  values.push('rascunho', userId, userId);

  const stmtUpdate = buildRdvVersionGuardedUpdate(c.env.DB, {
    table: 'cv_rdv_operacional',
    setSql: fields.join(', '),
    setBindValues: values,
    whereSql: 'id = ? AND empresa_id = ? AND deleted_at IS NULL',
    whereBindValues: [existing.id, empresaId],
    guard: { rdvId: existing.id, empresaId, expectedVersion },
  });

  const stmtEvent = c.env.DB.prepare(
    `
      INSERT INTO cv_voo_eventos (
        empresa_id, voo_id, tipo_evento, status_anterior, status_novo,
        descricao, motivo_id, metadata_json, usuario_id, created_by, updated_by,
        created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, datetime('now'), datetime('now')
      WHERE (SELECT changes()) > 0
    `,
  ).bind(
    empresaId,
    flight.id,
    'rdv',
    flight.status,
    flight.status,
    'RDV operacional atualizado',
    JSON.stringify({
      action: 'update',
      rdv_id: existing.id,
      expectedVersion,
      versaoAnterior: existing.versao,
      versaoNova: expectedVersion + 1,
      fields: Object.keys(payload).sort(),
    }),
    userId,
    userId,
    userId,
  );

  let batchResults;
  try {
    batchResults = await c.env.DB.batch([stmtUpdate, stmtEvent]);
  } catch (err: unknown) {
    const mapped = mapRdvOperacionalUniqueConstraintError(err);
    if (mapped) throw mapped;
    throw err;
  }
  assertCasApplied(batchResults[0]);

  await maybeRecordSystemAudit(
    c,
    'cv_rdv_operacional',
    'UPDATE',
    existing.id,
    { ...existing, versaoAnterior: existing.versao },
    { ...input, expectedVersion, versaoNova: expectedVersion + 1 }
  );

  const updated = await getRdvOrThrow(c.env.DB, existing.id, empresaId);
  return c.json({ success: true, data: updated });
});

controleVoos.post('/voos/:id/rdv/finalizar-preenchimento', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const flight = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  // Confirmação do comandante: exige capability própria + vínculo de
  // tripulação (ou Coordenação com visualizar_todos). Não usa bypass por role.
  await assertRdvSelfScope(
    c,
    c.env.DB,
    empresaId,
    flight.id,
    RDV_CAPABILITIES.editarRascunhoProprio,
  );
  const existing = await getActiveRdvByFlight(c.env.DB, flight.id, empresaId);

  if (!existing) {
    throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');
  }
  if (existing.status === 'preenchimento_finalizado') {
    throw new ApiError('RDV com preenchimento finalizado', 409, 'CONTROLE_VOOS_RDV_LOCKED');
  }

  await c.env.DB.prepare(
    `
    UPDATE cv_rdv_operacional
    SET status = 'preenchimento_finalizado',
        responsavel_preenchimento_id = COALESCE(responsavel_preenchimento_id, ?),
        preenchido_em = COALESCE(preenchido_em, datetime('now')),
        finalizado_operacionalmente_por = ?,
        finalizado_operacionalmente_em = datetime('now'),
        updated_by = ?,
        updated_at = datetime('now')
    WHERE id = ?
      AND empresa_id = ?
      AND deleted_at IS NULL
  `,
  )
    .bind(userId, userId, userId, existing.id, empresaId)
    .run();

  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: flight.id,
    tipoEvento: 'rdv',
    statusAnterior: flight.status,
    statusNovo: flight.status,
    descricao: 'RDV operacional com preenchimento finalizado',
    metadata: { action: 'finalize', rdv_id: existing.id },
    usuarioId: userId,
  });

  await maybeRecordSystemAudit(
    c,
    'cv_rdv_operacional',
    'UPDATE',
    existing.id,
    {
      status: existing.status,
      finalizado_operacionalmente_em: existing.finalizado_operacionalmente_em,
    },
    {
      status: 'preenchimento_finalizado',
      finalizado_operacionalmente_por: userId,
    },
  );

  // Confirmação/aprovação do comandante: o piloto que finaliza o
  // preenchimento operacional está confirmando os dados como responsável
  // pelo voo. Registrado como um evento de aprovação distinto (tipo
  // COMANDANTE) — auditável (usuário, funcionário, versão, data,
  // observação, status) e explicitamente NÃO chamado de assinatura digital.
  const funcionarioId = await getFuncionarioIdForUser(c.env.DB, userId);
  await c.env.DB.prepare(
    `
      INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, funcionario_id, created_at)
      VALUES (?, ?, ?, 'COMANDANTE', 'APROVADO', ?, ?, datetime('now'))
    `,
  )
    .bind(empresaId, existing.id, existing.versao, userId, funcionarioId)
    .run();

  const updated = await getRdvOrThrow(c.env.DB, existing.id, empresaId);
  return c.json({ success: true, data: updated });
});

controleVoos.get('/dashboard', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const filters = parseOperationalReadFilters(c);
  const scope = buildFlightScope('v', empresaId, filters);

  const totalsRow = await c.env.DB.prepare(
    `
      SELECT
        COUNT(*) AS total_voos,
        SUM(CASE WHEN v.status = 'planejado' THEN 1 ELSE 0 END) AS voos_planejados,
        SUM(CASE WHEN v.status = 'liberado_operacionalmente' THEN 1 ELSE 0 END) AS voos_liberados_operacionalmente,
        SUM(CASE WHEN v.status = 'em_andamento' THEN 1 ELSE 0 END) AS voos_em_andamento,
        SUM(CASE WHEN v.status = 'pousado' THEN 1 ELSE 0 END) AS voos_pousados,
        SUM(CASE WHEN v.status = 'concluido_operacionalmente' THEN 1 ELSE 0 END) AS voos_concluidos_operacionalmente,
        SUM(CASE WHEN v.status = 'cancelado' THEN 1 ELSE 0 END) AS voos_cancelados,
        SUM(CASE WHEN v.status = 'alternado_divergido' THEN 1 ELSE 0 END) AS voos_alternados_divergidos,
        SUM(CASE WHEN r.status = 'rascunho' THEN 1 ELSE 0 END) AS rdvs_rascunho,
        SUM(CASE WHEN r.status = 'preenchimento_finalizado' THEN 1 ELSE 0 END) AS rdvs_preenchimento_finalizado,
        SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END) AS voos_sem_rdv,
        SUM(
          CASE
            WHEN NOT EXISTS (
              SELECT 1
              FROM cv_voo_tripulantes t
              WHERE t.voo_id = v.id
                AND t.empresa_id = v.empresa_id
                AND t.deleted_at IS NULL
            ) THEN 1
            ELSE 0
          END
        ) AS voos_sem_tripulacao,
        SUM(CASE WHEN v.aeronave_id IS NULL THEN 1 ELSE 0 END) AS voos_sem_aeronave,
        SUM(
          CASE
            WHEN v.status = 'concluido_operacionalmente' AND r.id IS NULL THEN 1
            ELSE 0
          END
        ) AS voos_concluidos_sem_rdv
      FROM cv_voos v
      LEFT JOIN cv_rdv_operacional r
        ON r.voo_id = v.id
       AND r.empresa_id = v.empresa_id
       AND r.deleted_at IS NULL
       AND r.status <> 'cancelado'
      WHERE ${scope.where}
    `,
  )
    .bind(...scope.values)
    .first<Record<string, number | null>>();

  const { results: nextFlights } = await c.env.DB.prepare(
    `
      SELECT ${FLIGHT_SELECT}
      FROM cv_voos v
      WHERE ${scope.where}
      ORDER BY v.data_programacao ASC, v.horario_previsto_partida ASC, v.id ASC
      LIMIT 10
    `,
  )
    .bind(...scope.values)
    .all<FlightRow>();

  const totals = {
    voos: Number(totalsRow?.total_voos || 0),
    voos_planejados: Number(totalsRow?.voos_planejados || 0),
    voos_liberados_operacionalmente: Number(totalsRow?.voos_liberados_operacionalmente || 0),
    voos_em_andamento: Number(totalsRow?.voos_em_andamento || 0),
    voos_pousados: Number(totalsRow?.voos_pousados || 0),
    voos_concluidos_operacionalmente: Number(totalsRow?.voos_concluidos_operacionalmente || 0),
    voos_cancelados: Number(totalsRow?.voos_cancelados || 0),
    voos_alternados_divergidos: Number(totalsRow?.voos_alternados_divergidos || 0),
    rdvs_rascunho: Number(totalsRow?.rdvs_rascunho || 0),
    rdvs_preenchimento_finalizado: Number(totalsRow?.rdvs_preenchimento_finalizado || 0),
    voos_sem_rdv: Number(totalsRow?.voos_sem_rdv || 0),
  };

  return c.json({
    success: true,
    data: {
      uso_operacional_interno: true,
      nao_regulado: true,
      periodo: {
        data_inicio: filters.dataInicio,
        data_fim: filters.dataFim,
      },
      filtros: {
        status: filters.status,
        aeronave_id: filters.aeronaveId,
        origem_id: filters.origemId,
        destino_id: filters.destinoId,
      },
      totais: totals,
      voos_por_status: {
        planejado: totals.voos_planejados,
        liberado_operacionalmente: totals.voos_liberados_operacionalmente,
        em_andamento: totals.voos_em_andamento,
        pousado: totals.voos_pousados,
        concluido_operacionalmente: totals.voos_concluidos_operacionalmente,
        cancelado: totals.voos_cancelados,
        alternado_divergido: totals.voos_alternados_divergidos,
      },
      proximos_voos: nextFlights || [],
      alertas_operacionais: {
        voos_sem_tripulacao: Number(totalsRow?.voos_sem_tripulacao || 0),
        voos_sem_aeronave: Number(totalsRow?.voos_sem_aeronave || 0),
        voos_concluidos_sem_rdv: Number(totalsRow?.voos_concluidos_sem_rdv || 0),
      },
    },
  });
});

controleVoos.get('/relatorios/resumo-operacional', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const filters = parseOperationalReadFilters(c, { requireRange: true });
  const scope = buildFlightScope('v', empresaId, filters);

  const overallRow = await c.env.DB.prepare(
    `
      SELECT
        COUNT(*) AS total_voos,
        SUM(CASE WHEN v.status = 'planejado' THEN 1 ELSE 0 END) AS planejado,
        SUM(CASE WHEN v.status = 'liberado_operacionalmente' THEN 1 ELSE 0 END) AS liberado_operacionalmente,
        SUM(CASE WHEN v.status = 'em_andamento' THEN 1 ELSE 0 END) AS em_andamento,
        SUM(CASE WHEN v.status = 'pousado' THEN 1 ELSE 0 END) AS pousado,
        SUM(CASE WHEN v.status = 'concluido_operacionalmente' THEN 1 ELSE 0 END) AS concluido_operacionalmente,
        SUM(CASE WHEN v.status = 'cancelado' THEN 1 ELSE 0 END) AS cancelado,
        SUM(CASE WHEN v.status = 'alternado_divergido' THEN 1 ELSE 0 END) AS alternado_divergido,
        SUM(CASE WHEN r.status = 'rascunho' THEN 1 ELSE 0 END) AS rdvs_rascunho,
        SUM(CASE WHEN r.status = 'preenchimento_finalizado' THEN 1 ELSE 0 END) AS rdvs_preenchimento_finalizado,
        SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END) AS voos_sem_rdv,
        COALESCE(SUM(r.horas_voadas), 0) AS horas_voadas,
        COALESCE(SUM(r.numero_pousos), 0) AS numero_pousos,
        COALESCE(SUM(r.ciclos), 0) AS ciclos,
        COALESCE(SUM(r.combustivel_consumo), 0) AS combustivel_consumo,
        SUM(
          CASE
            WHEN v.horario_real_partida IS NOT NULL
             AND v.horario_previsto_partida IS NOT NULL
             AND v.horario_real_partida > v.horario_previsto_partida THEN 1
            ELSE 0
          END
        ) AS voos_com_atraso_partida,
        SUM(
          CASE
            WHEN v.horario_real_chegada IS NOT NULL
             AND v.horario_previsto_chegada IS NOT NULL
             AND v.horario_real_chegada > v.horario_previsto_chegada THEN 1
            ELSE 0
          END
        ) AS voos_com_atraso_chegada,
        SUM(
          CASE
            WHEN TRIM(COALESCE(r.divergencias, '')) <> '' THEN 1
            ELSE 0
          END
        ) AS rdvs_com_divergencias
      FROM cv_voos v
      LEFT JOIN cv_rdv_operacional r
        ON r.voo_id = v.id
       AND r.empresa_id = v.empresa_id
       AND r.deleted_at IS NULL
       AND r.status <> 'cancelado'
      WHERE ${scope.where}
    `,
  )
    .bind(...scope.values)
    .first<Record<string, number | null>>();

  const { results: perDay } = await c.env.DB.prepare(
    `
      SELECT
        v.data_programacao AS data,
        COUNT(*) AS total_voos,
        SUM(CASE WHEN v.status = 'planejado' THEN 1 ELSE 0 END) AS planejado,
        SUM(CASE WHEN v.status = 'liberado_operacionalmente' THEN 1 ELSE 0 END) AS liberado_operacionalmente,
        SUM(CASE WHEN v.status = 'em_andamento' THEN 1 ELSE 0 END) AS em_andamento,
        SUM(CASE WHEN v.status = 'pousado' THEN 1 ELSE 0 END) AS pousado,
        SUM(CASE WHEN v.status = 'concluido_operacionalmente' THEN 1 ELSE 0 END) AS concluido_operacionalmente,
        SUM(CASE WHEN v.status = 'cancelado' THEN 1 ELSE 0 END) AS cancelado,
        SUM(CASE WHEN v.status = 'alternado_divergido' THEN 1 ELSE 0 END) AS alternado_divergido,
        SUM(CASE WHEN r.status = 'rascunho' THEN 1 ELSE 0 END) AS rdvs_rascunho,
        SUM(CASE WHEN r.status = 'preenchimento_finalizado' THEN 1 ELSE 0 END) AS rdvs_preenchimento_finalizado,
        SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END) AS voos_sem_rdv,
        COALESCE(SUM(r.horas_voadas), 0) AS horas_voadas,
        COALESCE(SUM(r.numero_pousos), 0) AS numero_pousos,
        COALESCE(SUM(r.ciclos), 0) AS ciclos,
        COALESCE(SUM(r.combustivel_consumo), 0) AS combustivel_consumo,
        SUM(
          CASE
            WHEN v.horario_real_partida IS NOT NULL
             AND v.horario_previsto_partida IS NOT NULL
             AND v.horario_real_partida > v.horario_previsto_partida THEN 1
            ELSE 0
          END
        ) AS voos_com_atraso_partida,
        SUM(
          CASE
            WHEN v.horario_real_chegada IS NOT NULL
             AND v.horario_previsto_chegada IS NOT NULL
             AND v.horario_real_chegada > v.horario_previsto_chegada THEN 1
            ELSE 0
          END
        ) AS voos_com_atraso_chegada,
        SUM(
          CASE
            WHEN TRIM(COALESCE(r.divergencias, '')) <> '' THEN 1
            ELSE 0
          END
        ) AS rdvs_com_divergencias
      FROM cv_voos v
      LEFT JOIN cv_rdv_operacional r
        ON r.voo_id = v.id
       AND r.empresa_id = v.empresa_id
       AND r.deleted_at IS NULL
       AND r.status <> 'cancelado'
      WHERE ${scope.where}
      GROUP BY v.data_programacao
      ORDER BY v.data_programacao ASC
    `,
  )
    .bind(...scope.values)
    .all<Record<string, number | string | null>>();

  const { results: cancelamentos } = await c.env.DB.prepare(
    `
      SELECT
        m.id AS motivo_id,
        m.nome AS motivo_nome,
        COUNT(*) AS total
      FROM cv_voos v
      LEFT JOIN cv_motivos_operacionais m
        ON m.id = v.cancelado_motivo_id
       AND m.empresa_id = v.empresa_id
       AND m.deleted_at IS NULL
      WHERE ${scope.where}
        AND v.status = 'cancelado'
      GROUP BY m.id, m.nome
      ORDER BY total DESC, motivo_nome ASC
    `,
  )
    .bind(...scope.values)
    .all<{ motivo_id: number | null; motivo_nome: string | null; total: number }>();

  return c.json({
    success: true,
    data: {
      uso_operacional_interno: true,
      nao_regulado: true,
      relatorio_interno: true,
      periodo: {
        data_inicio: filters.dataInicio,
        data_fim: filters.dataFim,
      },
      filtros: {
        status: filters.status,
        aeronave_id: filters.aeronaveId,
        origem_id: filters.origemId,
        destino_id: filters.destinoId,
      },
      totais: {
        voos: Number(overallRow?.total_voos || 0),
        horas_voadas: Number(overallRow?.horas_voadas || 0),
        numero_pousos: Number(overallRow?.numero_pousos || 0),
        ciclos: Number(overallRow?.ciclos || 0),
        combustivel_consumo: Number(overallRow?.combustivel_consumo || 0),
        voos_sem_rdv: Number(overallRow?.voos_sem_rdv || 0),
        rdvs_rascunho: Number(overallRow?.rdvs_rascunho || 0),
        rdvs_preenchimento_finalizado: Number(overallRow?.rdvs_preenchimento_finalizado || 0),
      },
      totais_por_status: {
        planejado: Number(overallRow?.planejado || 0),
        liberado_operacionalmente: Number(overallRow?.liberado_operacionalmente || 0),
        em_andamento: Number(overallRow?.em_andamento || 0),
        pousado: Number(overallRow?.pousado || 0),
        concluido_operacionalmente: Number(overallRow?.concluido_operacionalmente || 0),
        cancelado: Number(overallRow?.cancelado || 0),
        alternado_divergido: Number(overallRow?.alternado_divergido || 0),
      },
      cancelamentos_por_motivo: (cancelamentos || []).map((row) => ({
        motivo_id: row.motivo_id,
        motivo_nome: row.motivo_nome,
        total: Number(row.total || 0),
      })),
      atrasos_ou_divergencias: {
        voos_com_atraso_partida: Number(overallRow?.voos_com_atraso_partida || 0),
        voos_com_atraso_chegada: Number(overallRow?.voos_com_atraso_chegada || 0),
        voos_alternados_divergidos: Number(overallRow?.alternado_divergido || 0),
        rdvs_com_divergencias: Number(overallRow?.rdvs_com_divergencias || 0),
      },
      agregados_por_dia: (perDay || []).map((row) => ({
        data: row.data,
        totais: {
          voos: Number(row.total_voos || 0),
          horas_voadas: Number(row.horas_voadas || 0),
          numero_pousos: Number(row.numero_pousos || 0),
          ciclos: Number(row.ciclos || 0),
          combustivel_consumo: Number(row.combustivel_consumo || 0),
          voos_sem_rdv: Number(row.voos_sem_rdv || 0),
          rdvs_rascunho: Number(row.rdvs_rascunho || 0),
          rdvs_preenchimento_finalizado: Number(row.rdvs_preenchimento_finalizado || 0),
        },
        totais_por_status: {
          planejado: Number(row.planejado || 0),
          liberado_operacionalmente: Number(row.liberado_operacionalmente || 0),
          em_andamento: Number(row.em_andamento || 0),
          pousado: Number(row.pousado || 0),
          concluido_operacionalmente: Number(row.concluido_operacionalmente || 0),
          cancelado: Number(row.cancelado || 0),
          alternado_divergido: Number(row.alternado_divergido || 0),
        },
        atrasos_ou_divergencias: {
          voos_com_atraso_partida: Number(row.voos_com_atraso_partida || 0),
          voos_com_atraso_chegada: Number(row.voos_com_atraso_chegada || 0),
          rdvs_com_divergencias: Number(row.rdvs_com_divergencias || 0),
        },
      })),
    },
  });
});

controleVoos.get('/catalogos/:nome', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const key = catalogKey(c.req.param('nome'));
  if (!key) {
    throw new ApiError('Catalogo nao encontrado', 404, 'CONTROLE_VOOS_CATALOG_NOT_FOUND');
  }

  const config = catalogos[key];
  const filters = ['empresa_id = ?', 'deleted_at IS NULL'];
  const values: unknown[] = [empresaId];

  const ativo = c.req.query('ativo');
  if (ativo !== undefined) {
    filters.push('ativo = ?');
    values.push(['1', 'true', 'sim'].includes(ativo.trim().toLowerCase()) ? 1 : 0);
  } else {
    filters.push('ativo = 1');
  }

  if (key === 'motivos') {
    const tipo = c.req.query('tipo');
    if (tipo) {
      filters.push('tipo = ?');
      values.push(tipo.trim());
    }
  }

  const { results } = await c.env.DB.prepare(
    `
    SELECT ${config.fields}
    FROM ${config.table}
    WHERE ${filters.join(' AND ')}
    ORDER BY ${config.orderBy}
  `,
  )
    .bind(...values)
    .all();

  return c.json({
    success: true,
    data: results || [],
    meta: { catalogo: key, count: (results || []).length },
  });
});

export default controleVoos;
