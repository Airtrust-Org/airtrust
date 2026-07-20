import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { checkPermission, getEmpresaId } from '../middleware/tenant';
import type { Env } from '../types';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../utils/auditoria';
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
  gerarRelatorioPetrobrasPdf,
  computeIntegrityHash,
  type RelatorioPetrobrasData,
  type RelatorioPetrobrasEtapa,
} from '../services/controle-voos/rdv-pdf';

type FlightStatus =
  | 'planejado'
  | 'liberado_operacionalmente'
  | 'em_andamento'
  | 'pousado'
  | 'concluido_operacionalmente'
  | 'cancelado'
  | 'alternado_divergido';

type FlightRow = {
  id: number;
  empresa_id: number;
  prefixo: string;
  data_programacao: string;
  origem_id: number;
  destino_id: number;
  tipo_voo_id: number;
  natureza_voo_id: number;
  aeronave_id: number | null;
  horario_previsto_partida: string;
  horario_previsto_chegada: string;
  horario_real_partida: string | null;
  horario_real_chegada: string | null;
  status: FlightStatus;
  observacoes: string | null;
  cancelado_motivo_id: number | null;
  alternado_destino_id: number | null;
  created_at: string;
  updated_at: string;
};

type RdvStatus = 'rascunho' | 'preenchimento_finalizado' | 'cancelado';

// Fluxo de revisão/aprovação da Coordenação (eixo ortogonal ao `status`
// operacional acima, que continua controlando apenas o lock de campos).
type RdvWorkflowStatus =
  | 'rascunho'
  | 'enviado'
  | 'em_revisao'
  | 'aprovado_coordenacao'
  | 'finalizado'
  | 'cancelado';

type RdvRow = {
  id: number;
  empresa_id: number;
  voo_id: number;
  numero: string;
  data_voo: string;
  horario_decolagem_real: string | null;
  horario_pouso_real: string | null;
  horas_voadas: number | null;
  numero_pousos: number | null;
  ciclos: number | null;
  combustivel_decolagem: number | null;
  combustivel_pouso: number | null;
  combustivel_consumo: number | null;
  pob: number | null;
  carga_kg: number | null;
  ocorrencias: string | null;
  divergencias: string | null;
  status: RdvStatus;
  responsavel_preenchimento_id: number | null;
  preenchido_em: string | null;
  finalizado_operacionalmente_por: number | null;
  finalizado_operacionalmente_em: string | null;
  workflow_status: RdvWorkflowStatus;
  versao: number;
  enviado_por: number | null;
  enviado_em: string | null;
  revisao_iniciada_por: number | null;
  revisao_iniciada_em: string | null;
  aprovado_coordenacao_por: number | null;
  aprovado_coordenacao_em: string | null;
  finalizado_workflow_em: string | null;
  reaberto_por: number | null;
  reaberto_em: string | null;
  motivo_devolucao: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  updated_at: string;
};

type FlightInput = Partial<{
  prefixo: string;
  data_programacao: string;
  origem_id: number;
  destino_id: number;
  tipo_voo_id: number;
  natureza_voo_id: number;
  aeronave_id: number | null;
  horario_previsto_partida: string;
  horario_previsto_chegada: string;
  horario_real_partida: string | null;
  horario_real_chegada: string | null;
  status: FlightStatus;
  observacoes: string | null;
  cancelado_motivo_id: number | null;
  alternado_destino_id: number | null;
}>;

type RdvInput = Partial<{
  numero: string;
  data_voo: string;
  horario_decolagem_real: string | null;
  horario_pouso_real: string | null;
  horas_voadas: number | null;
  numero_pousos: number | null;
  ciclos: number | null;
  combustivel_decolagem: number | null;
  combustivel_pouso: number | null;
  combustivel_consumo: number | null;
  pob: number | null;
  carga_kg: number | null;
  ocorrencias: string | null;
  divergencias: string | null;
}>;

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

const FLIGHT_SELECT = `
  id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
  tipo_voo_id, natureza_voo_id, aeronave_id,
  horario_previsto_partida, horario_previsto_chegada,
  horario_real_partida, horario_real_chegada,
  status, observacoes, cancelado_motivo_id, alternado_destino_id,
  created_at, updated_at
`;

const RDV_SELECT = `
  id, empresa_id, voo_id, numero, data_voo,
  horario_decolagem_real, horario_pouso_real,
  horas_voadas, numero_pousos, ciclos,
  combustivel_decolagem, combustivel_pouso, combustivel_consumo,
  pob, carga_kg, ocorrencias, divergencias,
  status, responsavel_preenchimento_id, preenchido_em,
  finalizado_operacionalmente_por, finalizado_operacionalmente_em,
  workflow_status, versao, enviado_por, enviado_em,
  revisao_iniciada_por, revisao_iniciada_em,
  aprovado_coordenacao_por, aprovado_coordenacao_em,
  finalizado_workflow_em, reaberto_por, reaberto_em,
  motivo_devolucao, motivo_cancelamento,
  created_at, updated_at
`;

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

const allowedRdvFields = new Set([
  'numero',
  'data_voo',
  'horario_decolagem_real',
  'horario_pouso_real',
  'horas_voadas',
  'numero_pousos',
  'ciclos',
  'combustivel_decolagem',
  'combustivel_pouso',
  'combustivel_consumo',
  'pob',
  'carga_kg',
  'ocorrencias',
  'divergencias',
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

// Fluxo RDV -> Coordenação. "devolver" e "reabrir" retornam para um estado
// editável (rascunho / em_revisao) preservando o motivo em cv_rdv_aprovacoes
// e cv_rdv_operacional.motivo_devolucao, em vez de manter um estado
// "devolvido" parado — isso reaproveita o lock operacional já existente
// (status = 'rascunho' libera edição; 'preenchimento_finalizado' bloqueia).
const rdvWorkflowTransitions: Record<RdvWorkflowStatus, RdvWorkflowStatus[]> = {
  rascunho: ['enviado', 'cancelado'],
  enviado: ['em_revisao', 'cancelado'],
  em_revisao: ['rascunho', 'aprovado_coordenacao', 'cancelado'],
  aprovado_coordenacao: ['finalizado'],
  finalizado: ['em_revisao'],
  cancelado: [],
};

function assertRdvWorkflowTransition(from: RdvWorkflowStatus, to: RdvWorkflowStatus): void {
  if (from === to) return;
  if (!rdvWorkflowTransitions[from].includes(to)) {
    throw new ApiError(
      `Transicao de fluxo do RDV nao permitida: ${from} -> ${to}`,
      409,
      'CONTROLE_VOOS_RDV_INVALID_WORKFLOW_TRANSITION',
    );
  }
}

function assertRdvVersion(existing: RdvRow, expectedVersion: unknown): void {
  const parsed = typeof expectedVersion === 'number' ? expectedVersion : Number(expectedVersion);
  if (!Number.isInteger(parsed) || parsed !== existing.versao) {
    throw new ApiError(
      'Versao do RDV desatualizada. Recarregue os dados antes de continuar.',
      409,
      'CONTROLE_VOOS_RDV_VERSION_CONFLICT',
    );
  }
}

function requireNonEmptyText(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new ApiError(`${field} e obrigatorio`, 400, 'CONTROLE_VOOS_RDV_JUSTIFICATIVA_OBRIGATORIA');
  }
  return text;
}

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

function getEmpresaIdSafe(c: Context<{ Bindings: Env }>): number {
  try {
    return getEmpresaId(c);
  } catch {
    const raw = (c.get as (key: string) => unknown)('empresaId');
    const parsed = typeof raw === 'string' ? Number(raw) : Number(raw || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

function getActorId(c: Context<{ Bindings: Env }>): string | number | null {
  const raw = (c.get as (key: string) => unknown)('userId');
  if (typeof raw === 'string' || typeof raw === 'number') return raw;
  return null;
}

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

// --------------------------------------------------------------------------
// Capabilities do RDV (voos.rdv.*) — integradas sobre a hierarquia de roles
// já existente (`checkPermission`), sem elevar globalmente o perfil
// student/aluno: acesso próprio depende sempre de vínculo de tripulação.
// --------------------------------------------------------------------------
const RDV_CAPABILITIES = {
  visualizarProprio: 'voos.rdv.visualizar_proprio',
  criarProprio: 'voos.rdv.criar_proprio',
  editarRascunhoProprio: 'voos.rdv.editar_rascunho_proprio',
  enviar: 'voos.rdv.enviar',
  visualizarTodos: 'voos.rdv.visualizar_todos',
  revisar: 'voos.rdv.revisar',
  corrigir: 'voos.rdv.corrigir',
  devolver: 'voos.rdv.devolver',
  aprovarCoordenacao: 'voos.rdv.aprovar_coordenacao',
  aprovarComercial: 'voos.rdv.aprovar_comercial',
  reabrir: 'voos.rdv.reabrir',
  exportarPetrobras: 'voos.rdv.exportar_petrobras',
  cancelar: 'voos.rdv.cancelar',
} as const;

function requireRdvCoordenacao(capability: string): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (!checkPermission(c, 'manager')) {
      throw new ApiError(
        `Permissao insuficiente (${capability})`,
        403,
        'CONTROLE_VOOS_RDV_RBAC_FORBIDDEN',
      );
    }
    await next();
  };
}

function requireRdvPilotOrCoordenacao(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (!checkPermission(c, 'student')) {
      throw new ApiError(
        `Permissao insuficiente (${RDV_CAPABILITIES.visualizarProprio})`,
        403,
        'CONTROLE_VOOS_RDV_RBAC_FORBIDDEN',
      );
    }
    await next();
  };
}

async function getFuncionarioIdForUser(db: D1Database, userId: number | string | null): Promise<number | null> {
  if (userId === null || userId === undefined || userId === '') return null;
  const row = await db
    .prepare('SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(userId)
    .first<{ funcionario_id: number | null }>();
  return row?.funcionario_id ?? null;
}

async function isCrewOnFlight(
  db: D1Database,
  empresaId: number,
  vooId: number,
  funcionarioId: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `
      SELECT id FROM cv_voo_tripulantes
      WHERE voo_id = ? AND empresa_id = ? AND funcionario_id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(vooId, empresaId, funcionarioId)
    .first();
  return !!row;
}

// Coordenação (>= manager) enxerga tudo; piloto só o próprio voo (vínculo de
// tripulação). Nunca confia em empresa_id/escopo vindo do payload do cliente.
async function assertRdvSelfScope(
  c: Context<{ Bindings: Env }>,
  db: D1Database,
  empresaId: number,
  vooId: number,
  capability: string,
): Promise<void> {
  if (checkPermission(c, 'manager')) return;

  const userId = getActorId(c);
  const funcionarioId = await getFuncionarioIdForUser(db, userId);
  if (!funcionarioId) {
    throw new ApiError(
      `Usuario sem vinculo de funcionario (${capability})`,
      403,
      'CONTROLE_VOOS_RDV_NO_FUNCIONARIO_LINK',
    );
  }

  const isCrew = await isCrewOnFlight(db, empresaId, vooId, funcionarioId);
  if (!isCrew) {
    throw new ApiError(
      `Acesso restrito a tripulantes do voo (${capability})`,
      403,
      'CONTROLE_VOOS_RDV_NOT_CREW',
    );
  }
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

function assertTimeOrder(start: string | null | undefined, end: string | null | undefined, code: string) {
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

async function parseOptionalJsonPayload(c: Context<{ Bindings: Env }>): Promise<Record<string, unknown>> {
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
  if ('empresaId' in payload || 'empresa_id' in payload || 'tenantId' in payload || 'tenant_id' in payload) {
    throw new ApiError(
      'Tenant arbitrario nao permitido neste gatilho',
      400,
      'CONTROLE_VOOS_SIGVOOS_TENANT_OVERRIDE_FORBIDDEN',
    );
  }
}

function parseDateOnlyParam(value: string | null | undefined, field: string, required = false): string | null {
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
      throw new ApiError(
        'Periodo obrigatorio',
        400,
        'CONTROLE_VOOS_INVALID_PERIOD',
      );
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

function normalizeFlightInput(payload: Record<string, unknown>, requireBaseFields: boolean): FlightInput {
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
      normalizeString(payload.horario_previsto_partida, 'horario_previsto_partida', requireBaseFields) ||
      undefined;
  }
  if (payload.horario_previsto_chegada !== undefined || requireBaseFields) {
    input.horario_previsto_chegada =
      normalizeString(payload.horario_previsto_chegada, 'horario_previsto_chegada', requireBaseFields) ||
      undefined;
  }
  if (payload.horario_real_partida !== undefined) {
    input.horario_real_partida = normalizeString(payload.horario_real_partida, 'horario_real_partida');
  }
  if (payload.horario_real_chegada !== undefined) {
    input.horario_real_chegada = normalizeString(payload.horario_real_chegada, 'horario_real_chegada');
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
    throw new ApiError('Transicao de status nao permitida', 409, 'CONTROLE_VOOS_INVALID_TRANSITION');
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

async function assertCatalogsForInput(
  db: D1Database,
  input: FlightInput,
  empresaId: number,
): Promise<void> {
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

async function getFlightOrThrow(db: D1Database, id: string, empresaId: number): Promise<FlightRow> {
  const row = await db
    .prepare(
      `
      SELECT ${FLIGHT_SELECT}
      FROM cv_voos
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(id, empresaId)
    .first<FlightRow>();

  if (!row) {
    throw new ApiError('Voo nao encontrado', 404, 'CONTROLE_VOOS_NOT_FOUND');
  }
  return row;
}

async function getActiveRdvByFlight(
  db: D1Database,
  vooId: number | string,
  empresaId: number,
): Promise<RdvRow | null> {
  return db
    .prepare(
      `
      SELECT ${RDV_SELECT}
      FROM cv_rdv_operacional
      WHERE voo_id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
        AND status <> 'cancelado'
      ORDER BY id DESC
      LIMIT 1
    `,
    )
    .bind(vooId, empresaId)
    .first<RdvRow>();
}

async function getRdvOrThrow(db: D1Database, id: number | string, empresaId: number): Promise<RdvRow> {
  const row = await db
    .prepare(
      `
      SELECT ${RDV_SELECT}
      FROM cv_rdv_operacional
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(id, empresaId)
    .first<RdvRow>();

  if (!row) {
    throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');
  }
  return row;
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
    horario_previsto_partida:
      input.horario_previsto_partida ?? existing.horario_previsto_partida,
    horario_previsto_chegada:
      input.horario_previsto_chegada ?? existing.horario_previsto_chegada,
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

function buildMergedRdv(existing: RdvRow, input: RdvInput): RdvInput {
  return {
    numero: input.numero ?? existing.numero,
    data_voo: input.data_voo ?? existing.data_voo,
    horario_decolagem_real:
      input.horario_decolagem_real !== undefined
        ? input.horario_decolagem_real
        : existing.horario_decolagem_real,
    horario_pouso_real:
      input.horario_pouso_real !== undefined
        ? input.horario_pouso_real
        : existing.horario_pouso_real,
    horas_voadas: input.horas_voadas !== undefined ? input.horas_voadas : existing.horas_voadas,
    numero_pousos:
      input.numero_pousos !== undefined ? input.numero_pousos : existing.numero_pousos,
    ciclos: input.ciclos !== undefined ? input.ciclos : existing.ciclos,
    combustivel_decolagem:
      input.combustivel_decolagem !== undefined
        ? input.combustivel_decolagem
        : existing.combustivel_decolagem,
    combustivel_pouso:
      input.combustivel_pouso !== undefined
        ? input.combustivel_pouso
        : existing.combustivel_pouso,
    combustivel_consumo:
      input.combustivel_consumo !== undefined
        ? input.combustivel_consumo
        : existing.combustivel_consumo,
    pob: input.pob !== undefined ? input.pob : existing.pob,
    carga_kg: input.carga_kg !== undefined ? input.carga_kg : existing.carga_kg,
    ocorrencias: input.ocorrencias !== undefined ? input.ocorrencias : existing.ocorrencias,
    divergencias: input.divergencias !== undefined ? input.divergencias : existing.divergencias,
  };
}

// --------------------------------------------------------------------------
// Motor de alertas do RDV. Conjunto inicial e propositalmente enxuto: regras
// estruturais e auto-contidas em Controle de Voos (não cruza com o domínio
// de Qualificações/ASO nesta entrega — ver documentação para o backlog).
// --------------------------------------------------------------------------
type RdvAlertRule = {
  regra: string;
  tipo: string;
  severidade: 'INFORMATIVO' | 'ATENCAO' | 'IMPEDE_ENVIO' | 'IMPEDE_APROVACAO';
  mensagem: string;
  etapaId?: number | null;
};

async function computeRdvAlertRules(
  db: D1Database,
  empresaId: number,
  voo: FlightRow,
  rdv: RdvRow,
): Promise<RdvAlertRule[]> {
  const rules: RdvAlertRule[] = [];

  const camposObrigatoriosAusentes: string[] = [];
  if (!rdv.numero) camposObrigatoriosAusentes.push('numero');
  if (!rdv.data_voo) camposObrigatoriosAusentes.push('data_voo');
  if (!rdv.horario_decolagem_real) camposObrigatoriosAusentes.push('horario_decolagem_real');
  if (!rdv.horario_pouso_real) camposObrigatoriosAusentes.push('horario_pouso_real');
  if (rdv.combustivel_decolagem === null) camposObrigatoriosAusentes.push('combustivel_decolagem');
  if (rdv.combustivel_pouso === null) camposObrigatoriosAusentes.push('combustivel_pouso');
  if (camposObrigatoriosAusentes.length > 0) {
    rules.push({
      regra: 'CAMPOS_OBRIGATORIOS_AUSENTES',
      tipo: 'preenchimento',
      severidade: 'IMPEDE_ENVIO',
      mensagem: `Campos obrigatorios ausentes: ${camposObrigatoriosAusentes.join(', ')}`,
    });
  }

  const tripulantes = await db
    .prepare(
      `SELECT id, funcao FROM cv_voo_tripulantes WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(voo.id, empresaId)
    .all<{ id: number; funcao: string }>();
  const crew = tripulantes.results || [];

  if (crew.length === 0) {
    rules.push({
      regra: 'TRIPULACAO_AUSENTE',
      tipo: 'tripulacao',
      severidade: 'IMPEDE_ENVIO',
      mensagem: 'Nenhum tripulante cadastrado para este voo',
    });
  }

  const comandantes = crew.filter((t) => t.funcao === 'PIC').length;
  if (comandantes > 1) {
    rules.push({
      regra: 'COMANDANTE_DUPLICADO',
      tipo: 'tripulacao',
      severidade: 'IMPEDE_ENVIO',
      mensagem: `Mais de um comandante (PIC) cadastrado (${comandantes})`,
    });
  }

  const etapas = await db
    .prepare(
      `
      SELECT id, numero_etapa, horario_decolagem, horario_pouso
      FROM cv_voo_etapas
      WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
      ORDER BY numero_etapa ASC
    `,
    )
    .bind(voo.id, empresaId)
    .all<{ id: number; numero_etapa: number; horario_decolagem: string | null; horario_pouso: string | null }>();
  const legs = etapas.results || [];

  if (legs.length === 0) {
    rules.push({
      regra: 'TRECHOS_AUSENTES',
      tipo: 'trechos',
      severidade: 'ATENCAO',
      mensagem: 'Nenhum trecho cadastrado para este voo',
    });
  }

  for (let i = 1; i < legs.length; i += 1) {
    const previous = legs[i - 1];
    const current = legs[i];
    if (
      previous.horario_pouso &&
      current.horario_decolagem &&
      current.horario_decolagem < previous.horario_pouso
    ) {
      rules.push({
        regra: 'TRECHOS_SOBREPOSTOS',
        tipo: 'trechos',
        severidade: 'IMPEDE_ENVIO',
        mensagem: `Trecho ${current.numero_etapa} inicia antes do pouso do trecho ${previous.numero_etapa}`,
        etapaId: current.id,
      });
    }
  }

  if (legs.length > 0) {
    const abastecimentosSemTrecho = await db
      .prepare(
        `
        SELECT COUNT(*) AS total FROM cv_voo_abastecimentos
        WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL AND etapa_id IS NULL
      `,
      )
      .bind(voo.id, empresaId)
      .first<{ total: number }>();
    if ((abastecimentosSemTrecho?.total ?? 0) > 0) {
      rules.push({
        regra: 'ABASTECIMENTO_SEM_TRECHO',
        tipo: 'abastecimento',
        severidade: 'ATENCAO',
        mensagem: 'Existe abastecimento sem trecho vinculado',
      });
    }
  }

  return rules;
}

// Recalcula os alertas e sincroniza com cv_rdv_alertas: resolve automaticamente
// regras que deixaram de se aplicar e insere as novas ainda não registradas.
// Nunca duplica uma regra já aberta.
async function syncRdvAlerts(
  db: D1Database,
  empresaId: number,
  voo: FlightRow,
  rdv: RdvRow,
): Promise<Array<RdvAlertRule & { id: number }>> {
  const fresh = await computeRdvAlertRules(db, empresaId, voo, rdv);
  const freshRegras = new Set(fresh.map((r) => r.regra));

  const existingOpen = await db
    .prepare(
      `SELECT id, regra FROM cv_rdv_alertas WHERE rdv_id = ? AND empresa_id = ? AND resolvido = 0 AND deleted_at IS NULL`,
    )
    .bind(rdv.id, empresaId)
    .all<{ id: number; regra: string }>();
  const openRows = existingOpen.results || [];
  const openRegras = new Set(openRows.map((r) => r.regra));

  for (const row of openRows) {
    if (!freshRegras.has(row.regra)) {
      await db
        .prepare(
          `
          UPDATE cv_rdv_alertas
          SET resolvido = 1, resolvido_em = datetime('now'),
              justificativa_resolucao = 'Regra nao mais aplicavel (recalculo automatico)',
              updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ?
        `,
        )
        .bind(row.id, empresaId)
        .run();
    }
  }

  const created: Array<RdvAlertRule & { id: number }> = [];
  for (const rule of fresh) {
    if (openRegras.has(rule.regra)) continue;
    const result = await db
      .prepare(
        `
        INSERT INTO cv_rdv_alertas (
          empresa_id, rdv_id, etapa_id, tipo, severidade, mensagem, regra,
          impeditivo_envio, impeditivo_aprovacao, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      )
      .bind(
        empresaId,
        rdv.id,
        rule.etapaId ?? null,
        rule.tipo,
        rule.severidade,
        rule.mensagem,
        rule.regra,
        rule.severidade === 'IMPEDE_ENVIO' ? 1 : 0,
        rule.severidade === 'IMPEDE_APROVACAO' ? 1 : 0,
      )
      .run();
    created.push({ ...rule, id: Number(result.meta.last_row_id) });
  }

  const stillOpen = await db
    .prepare(
      `
      SELECT id, tipo, severidade, mensagem, regra, impeditivo_envio, impeditivo_aprovacao
      FROM cv_rdv_alertas
      WHERE rdv_id = ? AND empresa_id = ? AND resolvido = 0 AND deleted_at IS NULL
      ORDER BY severidade DESC, created_at ASC
    `,
    )
    .bind(rdv.id, empresaId)
    .all<{
      id: number;
      tipo: string;
      severidade: RdvAlertRule['severidade'];
      mensagem: string;
      regra: string;
      impeditivo_envio: number;
      impeditivo_aprovacao: number;
    }>();

  return (stillOpen.results || []).map((r) => ({
    id: r.id,
    tipo: r.tipo,
    severidade: r.severidade,
    mensagem: r.mensagem,
    regra: r.regra,
  }));
}

const RDV_DIFF_FIELDS = Array.from(allowedRdvFields);

// Registra diferenças campo-a-campo entre duas versões do RDV, com
// justificativa obrigatória. Alimenta a tela de "diferenças" da Coordenação
// (complementa, não substitui, a auditoria genérica em `auditoria`).
async function recordRdvFieldRevisions(params: {
  db: D1Database;
  empresaId: number;
  rdvId: number;
  versao: number;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  usuarioId: number | string | null;
  justificativa: string;
  estadoAnterior: string;
  estadoNovo: string;
}): Promise<number> {
  const { db, empresaId, rdvId, versao, before, after, usuarioId, justificativa, estadoAnterior, estadoNovo } = params;
  let changed = 0;

  for (const field of RDV_DIFF_FIELDS) {
    const previousValue = before[field] ?? null;
    const nextValue = after[field] ?? null;
    if (String(previousValue ?? '') === String(nextValue ?? '')) continue;

    changed += 1;
    await db
      .prepare(
        `
        INSERT INTO cv_rdv_revisoes (
          empresa_id, rdv_id, versao, entidade, registro_id, campo,
          valor_anterior, valor_novo, usuario_id, justificativa,
          estado_anterior, estado_novo, created_at
        ) VALUES (?, ?, ?, 'rdv', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      )
      .bind(
        empresaId,
        rdvId,
        versao,
        rdvId,
        field,
        previousValue === null ? null : String(previousValue),
        nextValue === null ? null : String(nextValue),
        usuarioId,
        justificativa,
        estadoAnterior,
        estadoNovo,
      )
      .run();
  }

  return changed;
}

async function recordFlightEvent(params: {
  db: D1Database;
  empresaId: number;
  vooId: number;
  tipoEvento: 'status' | 'horario' | 'tripulacao' | 'rdv' | 'ocorrencia' | 'observacao' | 'sistema';
  statusAnterior?: FlightStatus | null;
  statusNovo?: FlightStatus | null;
  descricao?: string | null;
  motivoId?: number | null;
  metadata?: Record<string, unknown>;
  usuarioId?: number | string | null;
}) {
  await params.db
    .prepare(
      `
      INSERT INTO cv_voo_eventos (
        empresa_id, voo_id, tipo_evento, status_anterior, status_novo,
        descricao, motivo_id, metadata_json, usuario_id, created_by, updated_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `,
    )
    .bind(
      params.empresaId,
      params.vooId,
      params.tipoEvento,
      params.statusAnterior || null,
      params.statusNovo || null,
      params.descricao || null,
      params.motivoId || null,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.usuarioId || null,
      params.usuarioId || null,
      params.usuarioId || null,
    )
    .run();
}

async function maybeRecordSystemAudit(
  c: Context<{ Bindings: Env }>,
  table: string,
  action: 'INSERT' | 'UPDATE',
  recordId: string | number,
  beforeData: unknown,
  afterData: unknown,
) {
  await registrarAuditoria({
    db: c.env.DB,
    tabela: table,
    acao: action,
    registro_id: recordId,
    dados_anteriores: beforeData,
    dados_novos: afterData,
    ...extrairUsuarioAuditoria(c),
  });
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
  const row = await db.prepare(sql).bind(...values).first<{ total: number }>();
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
    queryCount(db, 'SELECT COUNT(*) AS total FROM cv_sigvoos_staging WHERE empresa_id = ? AND deleted_at IS NULL', empresaId),
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

controleVoos.post('/sigvoos/sync-preview', auth(), requireControleVoosSigvoosPreview(), async (c) => {
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
});

controleVoos.post('/sigvoos/real-preview', auth(), requireControleVoosSigvoosPreview(), async (c) => {
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
      (safePreviewError.name === 'SigvoosRealPreviewError' && typeof safePreviewError.code === 'string')
    ) {
      const status = typeof safePreviewError.status === 'number' ? safePreviewError.status : 502;
      throw new ApiError('Preview real SIGVOOS indisponivel', status, String(safePreviewError.code));
    }
    throw new ApiError(
      'Preview real SIGVOOS indisponivel',
      502,
      'CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_FAILED',
    );
  }
});

controleVoos.get('/sigvoos/shadow-compare', auth(), requireControleVoosSigvoosPreview(), async (c) => {
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
    throw new ApiError('Shadow compare SIGVOOS indisponivel', 404, 'CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_DISABLED');
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
});

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
  const requestedLimit = parseInt(c.req.query('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
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
  assertPayloadFields(payload, allowedFields);
  if (Object.keys(payload).length === 0) {
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

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      fields.push(`${field} = ?`);
      values.push(input[field as keyof FlightInput] ?? null);
    }
  }

  fields.push('updated_by = ?', 'updated_at = datetime("now")');
  values.push(userId, id, empresaId);

  await c.env.DB.prepare(
    `
    UPDATE cv_voos
    SET ${fields.join(', ')}
    WHERE id = ?
      AND empresa_id = ?
      AND deleted_at IS NULL
  `,
  )
    .bind(...values)
    .run();

  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: existing.id,
    tipoEvento: input.status && input.status !== existing.status ? 'status' : 'observacao',
    statusAnterior: existing.status,
    statusNovo: merged.status || existing.status,
    descricao: 'Voo atualizado',
    motivoId: merged.cancelado_motivo_id || null,
    metadata: { fields: Object.keys(payload).sort() },
    usuarioId: userId,
  });

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
  const allowedStatusPayloadFields = new Set(['status', 'motivo_id', 'cancelado_motivo_id', 'descricao']);
  assertPayloadFields(payload, allowedStatusPayloadFields);

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

  await c.env.DB.prepare(
    `
    UPDATE cv_voos
    SET status = ?,
        cancelado_motivo_id = CASE WHEN ? IS NOT NULL THEN ? ELSE cancelado_motivo_id END,
        updated_by = ?,
        updated_at = datetime('now')
    WHERE id = ?
      AND empresa_id = ?
      AND deleted_at IS NULL
  `,
  )
    .bind(status, motivoId, motivoId, userId, id, empresaId)
    .run();

  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: existing.id,
    tipoEvento: 'status',
    statusAnterior: existing.status,
    statusNovo: status,
    descricao: descricao || 'Status atualizado',
    motivoId,
    usuarioId: userId,
  });

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
  const rdv = await getActiveRdvByFlight(c.env.DB, flight.id, empresaId);
  return c.json({ success: true, data: rdv });
});

// Escrita liberada para editor+ (equipe operacional, comportamento
// pré-existente e inalterado) OU para o próprio piloto (role >= student)
// desde que seja tripulante do voo — extensão aditiva para o fluxo do RDV.
controleVoos.put('/voos/:id/rdv', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const flight = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  if (!checkPermission(c, 'editor')) {
    await assertRdvSelfScope(c, c.env.DB, empresaId, flight.id, RDV_CAPABILITIES.editarRascunhoProprio);
  }
  const payload = await parseJsonPayload(c);
  assertPayloadFields(payload, allowedRdvFields);
  const existing = await getActiveRdvByFlight(c.env.DB, flight.id, empresaId);
  const input = normalizeRdvInput(payload, !existing);
  const merged = existing ? buildMergedRdv(existing, input) : input;

  assertRdvRules(merged);

  if (existing?.status === 'preenchimento_finalizado') {
    throw new ApiError('RDV com preenchimento finalizado', 409, 'CONTROLE_VOOS_RDV_LOCKED');
  }

  if (!existing) {
    const createResult = await c.env.DB
      .prepare(
        `
        INSERT INTO cv_rdv_operacional (
          empresa_id, voo_id, numero, data_voo,
          horario_decolagem_real, horario_pouso_real,
          horas_voadas, numero_pousos, ciclos,
          combustivel_decolagem, combustivel_pouso, combustivel_consumo,
          pob, carga_kg, ocorrencias, divergencias,
          status, responsavel_preenchimento_id, preenchido_em,
          created_by, updated_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          'rascunho', ?, datetime('now'),
          ?, ?, datetime('now'), datetime('now')
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
      metadata: { action: 'create', rdv_id: created.id, fields: Object.keys(payload).sort() },
      usuarioId: userId,
    });

    await maybeRecordSystemAudit(c, 'cv_rdv_operacional', 'INSERT', created.id, null, input);
    return c.json({ success: true, data: created }, 201);
  }

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
    'updated_by = ?',
    'updated_at = datetime("now")',
  );
  values.push('rascunho', userId, userId, existing.id, empresaId);

  await c.env.DB.prepare(
    `
    UPDATE cv_rdv_operacional
    SET ${fields.join(', ')}
    WHERE id = ?
      AND empresa_id = ?
      AND deleted_at IS NULL
  `,
  )
    .bind(...values)
    .run();

  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: flight.id,
    tipoEvento: 'rdv',
    statusAnterior: flight.status,
    statusNovo: flight.status,
    descricao: 'RDV operacional atualizado',
    metadata: { action: 'update', rdv_id: existing.id, fields: Object.keys(payload).sort() },
    usuarioId: userId,
  });

  await maybeRecordSystemAudit(c, 'cv_rdv_operacional', 'UPDATE', existing.id, existing, input);
  const updated = await getRdvOrThrow(c.env.DB, existing.id, empresaId);
  return c.json({ success: true, data: updated });
});

controleVoos.post('/voos/:id/rdv/finalizar-preenchimento', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const flight = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  if (!checkPermission(c, 'editor')) {
    await assertRdvSelfScope(c, c.env.DB, empresaId, flight.id, RDV_CAPABILITIES.editarRascunhoProprio);
  }
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
    { status: existing.status, finalizado_operacionalmente_em: existing.finalizado_operacionalmente_em },
    {
      status: 'preenchimento_finalizado',
      finalizado_operacionalmente_por: userId,
    },
  );

  const updated = await getRdvOrThrow(c.env.DB, existing.id, empresaId);
  return c.json({ success: true, data: updated });
});

// ===========================================================================
// Fluxo Piloto -> Coordenação (workflow de revisão/aprovação do RDV)
// ===========================================================================

controleVoos.get('/voos/meus', auth(), requireRdvPilotOrCoordenacao(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = getActorId(c);
  const funcionarioId = await getFuncionarioIdForUser(c.env.DB, userId);
  if (!funcionarioId) {
    return c.json({ success: true, data: [], meta: { count: 0 } });
  }

  const { results } = await c.env.DB
    .prepare(
      `
      SELECT ${FLIGHT_SELECT}
      FROM cv_voos v
      WHERE v.empresa_id = ?
        AND v.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM cv_voo_tripulantes t
          WHERE t.voo_id = v.id AND t.empresa_id = v.empresa_id
            AND t.funcionario_id = ? AND t.deleted_at IS NULL
        )
      ORDER BY v.data_programacao DESC, v.id DESC
      LIMIT ${MAX_LIMIT}
    `,
    )
    .bind(empresaId, funcionarioId)
    .all();

  return c.json({ success: true, data: results || [], meta: { count: (results || []).length } });
});

controleVoos.get('/voos/:id/rdv/alertas', auth(), requireRdvPilotOrCoordenacao(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.visualizarProprio);
  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) {
    return c.json({ success: true, data: [] });
  }
  const alerts = await syncRdvAlerts(c.env.DB, empresaId, voo, rdv);
  return c.json({ success: true, data: alerts });
});

controleVoos.get('/voos/:id/rdv/revisoes', auth(), requireRdvPilotOrCoordenacao(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.visualizarProprio);
  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) return c.json({ success: true, data: [] });

  const { results } = await c.env.DB
    .prepare(
      `
      SELECT id, versao, entidade, registro_id, campo, valor_anterior, valor_novo,
             usuario_id, justificativa, estado_anterior, estado_novo, created_at
      FROM cv_rdv_revisoes
      WHERE rdv_id = ? AND empresa_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    )
    .bind(rdv.id, empresaId)
    .all();
  return c.json({ success: true, data: results || [] });
});

controleVoos.get('/voos/:id/rdv/aprovacoes', auth(), requireRdvPilotOrCoordenacao(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.visualizarProprio);
  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) return c.json({ success: true, data: [] });

  const { results } = await c.env.DB
    .prepare(
      `
      SELECT id, versao, tipo_aprovacao, status, usuario_id, funcionario_id,
             observacao, justificativa, created_at
      FROM cv_rdv_aprovacoes
      WHERE rdv_id = ? AND empresa_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    )
    .bind(rdv.id, empresaId)
    .all();
  return c.json({ success: true, data: results || [] });
});

controleVoos.get(
  '/voos/:id/rdv/relatorio-petrobras',
  auth(),
  requireRdvCoordenacao(RDV_CAPABILITIES.exportarPetrobras),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const vooId = c.req.param('id');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
    if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

    const [empresa, aeronave, tripulantes, etapas, abastecimentos, aprovacoes] = await Promise.all([
      c.env.DB
        .prepare('SELECT razao_social, nome_fantasia FROM empresas WHERE id = ? LIMIT 1')
        .bind(empresaId)
        .first<{ razao_social: string; nome_fantasia: string | null }>(),
      voo.aeronave_id
        ? c.env.DB.prepare('SELECT modelo FROM aeronaves WHERE id = ? LIMIT 1').bind(voo.aeronave_id).first<{ modelo: string }>()
        : Promise.resolve(null),
      c.env.DB
        .prepare(
          `
          SELECT f.nome, f.codigo_anac, t.funcao
          FROM cv_voo_tripulantes t
          LEFT JOIN funcionarios f ON f.id = t.funcionario_id AND f.empresa_id = t.empresa_id
          WHERE t.voo_id = ? AND t.empresa_id = ? AND t.deleted_at IS NULL
          ORDER BY t.funcao ASC
        `,
        )
        .bind(voo.id, empresaId)
        .all<{ nome: string | null; codigo_anac: string | null; funcao: string }>(),
      c.env.DB
        .prepare(
          `
          SELECT numero_etapa, origem_icao, destino_icao, horario_motor_ligado, horario_decolagem,
                 horario_pouso, horario_motor_desligado, tempo_decolagem_pouso, tempo_total,
                 pousos_diurnos, pousos_noturnos, pax, payload, combustivel_inicio, combustivel_fim
          FROM cv_voo_etapas
          WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
          ORDER BY numero_etapa ASC
        `,
        )
        .bind(voo.id, empresaId)
        .all<RelatorioPetrobrasEtapa>(),
      c.env.DB
        .prepare(
          `
          SELECT fornecedor, localidade, combustivel_abastecido, unidade, numero_ce, data_hora
          FROM cv_voo_abastecimentos
          WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
          ORDER BY data_hora ASC
        `,
        )
        .bind(voo.id, empresaId)
        .all<{
          fornecedor: string | null;
          localidade: string | null;
          combustivel_abastecido: number | null;
          unidade: string;
          numero_ce: string | null;
          data_hora: string;
        }>(),
      c.env.DB
        .prepare(
          `SELECT tipo_aprovacao, status, created_at FROM cv_rdv_aprovacoes WHERE rdv_id = ? AND empresa_id = ? ORDER BY created_at ASC`,
        )
        .bind(rdv.id, empresaId)
        .all<{ tipo_aprovacao: string; status: string; created_at: string }>(),
    ]);

    const identificadorInterno = `RDV-${empresaId}-${rdv.id}-v${rdv.versao}`;
    const geradoEm = new Date().toISOString();
    const hashIntegridade = await computeIntegrityHash({
      rdv_id: rdv.id,
      versao: rdv.versao,
      workflow_status: rdv.workflow_status,
      numero: rdv.numero,
      totais: {
        horas_voadas: rdv.horas_voadas,
        combustivel_consumo: rdv.combustivel_consumo,
      },
      gerado_em: geradoEm,
    });

    const data: RelatorioPetrobrasData = {
      empresa_nome: empresa?.nome_fantasia || empresa?.razao_social || 'AirTrust',
      base: null,
      contrato: null,
      cliente: null,
      data_voo: rdv.data_voo,
      prefixo: voo.prefixo,
      modelo_aeronave: aeronave?.modelo ?? null,
      numero_voo: null,
      numero_relatorio: rdv.numero,
      numero_sap: null,
      tripulantes: (tripulantes.results || []).map((t) => ({
        nome: t.nome || 'Tripulante nao identificado',
        codigo_anac: t.codigo_anac,
        funcao: t.funcao,
      })),
      etapas: etapas.results || [],
      abastecimentos: abastecimentos.results || [],
      totais: {
        horas_voadas: rdv.horas_voadas,
        numero_pousos: rdv.numero_pousos,
        ciclos: rdv.ciclos,
        combustivel_decolagem: rdv.combustivel_decolagem,
        combustivel_pouso: rdv.combustivel_pouso,
        combustivel_consumo: rdv.combustivel_consumo,
        pob: rdv.pob,
        carga_kg: rdv.carga_kg,
      },
      ocorrencias: rdv.ocorrencias,
      divergencias: rdv.divergencias,
      aprovacoes: aprovacoes.results || [],
      status_workflow: rdv.workflow_status,
      versao: rdv.versao,
      gerado_em: geradoEm,
      identificador_interno: identificadorInterno,
      hash_integridade: hashIntegridade,
    };

    const pdfBytes = await gerarRelatorioPetrobrasPdf(data);

    await maybeRecordSystemAudit(c, 'cv_rdv_operacional', 'UPDATE', rdv.id, null, {
      action: 'exportar_relatorio_petrobras',
      identificador_interno: identificadorInterno,
    });

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${identificadorInterno}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  },
);

// Fila da Coordenação: cruza voos com RDV, filtrável por status de fluxo,
// periodo, aeronave e piloto.
controleVoos.get('/rdv/fila', auth(), requireRdvCoordenacao(RDV_CAPABILITIES.visualizarTodos), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const workflowStatus = c.req.query('status');
  const dataInicio = c.req.query('data_inicio');
  const dataFim = c.req.query('data_fim');
  const aeronaveId = c.req.query('aeronave_id');
  const pilotoFuncionarioId = c.req.query('piloto_funcionario_id');

  const filters = ['r.empresa_id = ?', 'r.deleted_at IS NULL'];
  const values: unknown[] = [empresaId];

  if (workflowStatus) {
    filters.push('r.workflow_status = ?');
    values.push(workflowStatus);
  }
  if (dataInicio) {
    filters.push('r.data_voo >= ?');
    values.push(dataInicio);
  }
  if (dataFim) {
    filters.push('r.data_voo <= ?');
    values.push(dataFim);
  }
  if (aeronaveId) {
    filters.push('v.aeronave_id = ?');
    values.push(Number(aeronaveId));
  }
  if (pilotoFuncionarioId) {
    filters.push(
      'EXISTS (SELECT 1 FROM cv_voo_tripulantes t WHERE t.voo_id = v.id AND t.empresa_id = v.empresa_id AND t.funcionario_id = ? AND t.deleted_at IS NULL)',
    );
    values.push(Number(pilotoFuncionarioId));
  }

  const { results } = await c.env.DB
    .prepare(
      `
      SELECT
        r.id, r.voo_id, r.numero, r.data_voo, r.status, r.workflow_status, r.versao,
        r.responsavel_preenchimento_id, r.enviado_em, r.aprovado_coordenacao_em,
        r.finalizado_workflow_em, r.motivo_devolucao,
        v.prefixo, v.aeronave_id, v.data_programacao
      FROM cv_rdv_operacional r
      INNER JOIN cv_voos v ON v.id = r.voo_id AND v.empresa_id = r.empresa_id
      WHERE ${filters.join(' AND ')}
      ORDER BY r.data_voo DESC, r.id DESC
      LIMIT ${MAX_LIMIT}
    `,
    )
    .bind(...values)
    .all();

  return c.json({ success: true, data: results || [], meta: { count: (results || []).length } });
});

controleVoos.post('/voos/:id/rdv/enviar', auth(), requireRdvPilotOrCoordenacao(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.enviar);

  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');
  if (rdv.status !== 'preenchimento_finalizado') {
    throw new ApiError(
      'Finalize o preenchimento do RDV antes de enviar',
      409,
      'CONTROLE_VOOS_RDV_PREENCHIMENTO_INCOMPLETO',
    );
  }
  assertRdvWorkflowTransition(rdv.workflow_status, 'enviado');

  const payload = await parseOptionalJsonPayload(c);
  if (payload.versao !== undefined) assertRdvVersion(rdv, payload.versao);

  const alerts = await syncRdvAlerts(c.env.DB, empresaId, voo, rdv);
  const blocking = alerts.filter((a) => a.severidade === 'IMPEDE_ENVIO');
  if (blocking.length > 0) {
    throw new ApiError(
      `Envio bloqueado por alertas: ${blocking.map((a) => a.mensagem).join('; ')}`,
      409,
      'CONTROLE_VOOS_RDV_BLOQUEADO_POR_ALERTA',
    );
  }

  const novaVersao = rdv.versao + 1;
  await c.env.DB
    .prepare(
      `
      UPDATE cv_rdv_operacional
      SET workflow_status = 'enviado', versao = ?, enviado_por = ?, enviado_em = datetime('now'),
          updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ? AND versao = ?
    `,
    )
    .bind(novaVersao, userId, userId, rdv.id, empresaId, rdv.versao)
    .run();

  await c.env.DB
    .prepare(
      `
      INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, created_at)
      VALUES (?, ?, ?, 'COORDENACAO', 'ENVIADO', ?, datetime('now'))
    `,
    )
    .bind(empresaId, rdv.id, novaVersao, userId)
    .run();

  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: voo.id,
    tipoEvento: 'rdv',
    statusAnterior: voo.status,
    statusNovo: voo.status,
    descricao: 'RDV enviado para revisao da Coordenacao',
    metadata: { action: 'enviar', rdv_id: rdv.id, versao: novaVersao },
    usuarioId: userId,
  });

  const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
  return c.json({ success: true, data: updated });
});

controleVoos.post(
  '/voos/:id/rdv/iniciar-revisao',
  auth(),
  requireRdvCoordenacao(RDV_CAPABILITIES.revisar),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const userId = Number(getActorId(c));
    const vooId = c.req.param('id');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
    if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

    assertRdvWorkflowTransition(rdv.workflow_status, 'em_revisao');
    const payload = await parseOptionalJsonPayload(c);
    if (payload.versao !== undefined) assertRdvVersion(rdv, payload.versao);

    const novaVersao = rdv.versao + 1;
    await c.env.DB
      .prepare(
        `
        UPDATE cv_rdv_operacional
        SET workflow_status = 'em_revisao', versao = ?, revisao_iniciada_por = ?,
            revisao_iniciada_em = datetime('now'), updated_by = ?, updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND versao = ?
      `,
      )
      .bind(novaVersao, userId, userId, rdv.id, empresaId, rdv.versao)
      .run();

    await c.env.DB
      .prepare(
        `
        INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, created_at)
        VALUES (?, ?, ?, 'COORDENACAO', 'REVISAO_INICIADA', ?, datetime('now'))
      `,
      )
      .bind(empresaId, rdv.id, novaVersao, userId)
      .run();

    const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
    return c.json({ success: true, data: updated });
  },
);

controleVoos.post('/voos/:id/rdv/devolver', auth(), requireRdvCoordenacao(RDV_CAPABILITIES.devolver), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

  assertRdvWorkflowTransition(rdv.workflow_status, 'rascunho');
  const payload = await parseJsonPayload(c);
  if (payload.versao !== undefined) assertRdvVersion(rdv, payload.versao);
  const justificativa = requireNonEmptyText(payload.justificativa, 'justificativa');

  const novaVersao = rdv.versao + 1;
  await c.env.DB
    .prepare(
      `
      UPDATE cv_rdv_operacional
      SET workflow_status = 'rascunho', status = 'rascunho', versao = ?,
          motivo_devolucao = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ? AND versao = ?
    `,
    )
    .bind(novaVersao, justificativa, userId, rdv.id, empresaId, rdv.versao)
    .run();

  await c.env.DB
    .prepare(
      `
      INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, justificativa, created_at)
      VALUES (?, ?, ?, 'COORDENACAO', 'DEVOLVIDO', ?, ?, datetime('now'))
    `,
    )
    .bind(empresaId, rdv.id, novaVersao, userId, justificativa)
    .run();

  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: voo.id,
    tipoEvento: 'rdv',
    statusAnterior: voo.status,
    statusNovo: voo.status,
    descricao: 'RDV devolvido ao piloto pela Coordenacao',
    metadata: { action: 'devolver', rdv_id: rdv.id, versao: novaVersao, justificativa },
    usuarioId: userId,
  });

  const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
  return c.json({ success: true, data: updated });
});

controleVoos.post('/voos/:id/rdv/corrigir', auth(), requireRdvCoordenacao(RDV_CAPABILITIES.corrigir), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

  if (rdv.workflow_status !== 'em_revisao') {
    throw new ApiError(
      'Correcao da Coordenacao permitida apenas durante revisao',
      409,
      'CONTROLE_VOOS_RDV_CORRECAO_FORA_DE_REVISAO',
    );
  }

  const payload = await parseJsonPayload(c);
  if (payload.versao !== undefined) assertRdvVersion(rdv, payload.versao);
  const justificativa = requireNonEmptyText(payload.justificativa, 'justificativa');
  const campos = (payload.campos && typeof payload.campos === 'object' ? payload.campos : {}) as Record<
    string,
    unknown
  >;
  assertPayloadFields(campos, allowedRdvFields);

  const input = normalizeRdvInput(campos, false);
  const merged = buildMergedRdv(rdv, input);
  assertRdvRules(merged);

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const field of allowedRdvFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      fields.push(`${field} = ?`);
      values.push(input[field as keyof RdvInput] ?? null);
    }
  }

  const novaVersao = rdv.versao + 1;
  if (fields.length > 0) {
    fields.push('versao = ?', 'updated_by = ?', 'updated_at = datetime("now")');
    values.push(novaVersao, userId, rdv.id, empresaId, rdv.versao);

    await c.env.DB
      .prepare(
        `
        UPDATE cv_rdv_operacional
        SET ${fields.join(', ')}
        WHERE id = ? AND empresa_id = ? AND versao = ?
      `,
      )
      .bind(...values)
      .run();
  } else {
    await c.env.DB
      .prepare(
        `UPDATE cv_rdv_operacional SET versao = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND versao = ?`,
      )
      .bind(novaVersao, userId, rdv.id, empresaId, rdv.versao)
      .run();
  }

  const changedFields = await recordRdvFieldRevisions({
    db: c.env.DB,
    empresaId,
    rdvId: rdv.id,
    versao: novaVersao,
    before: rdv as unknown as Record<string, unknown>,
    after: merged as unknown as Record<string, unknown>,
    usuarioId: userId,
    justificativa,
    estadoAnterior: rdv.workflow_status,
    estadoNovo: rdv.workflow_status,
  });

  await maybeRecordSystemAudit(c, 'cv_rdv_operacional', 'UPDATE', rdv.id, rdv, merged);

  const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
  return c.json({ success: true, data: updated, meta: { campos_alterados: changedFields } });
});

controleVoos.post(
  '/voos/:id/rdv/aprovar',
  auth(),
  requireRdvCoordenacao(RDV_CAPABILITIES.aprovarCoordenacao),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const userId = Number(getActorId(c));
    const vooId = c.req.param('id');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
    if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

    assertRdvWorkflowTransition(rdv.workflow_status, 'aprovado_coordenacao');
    const payload = await parseOptionalJsonPayload(c);
    if (payload.versao !== undefined) assertRdvVersion(rdv, payload.versao);

    const alerts = await syncRdvAlerts(c.env.DB, empresaId, voo, rdv);
    const blocking = alerts.filter((a) => a.severidade === 'IMPEDE_APROVACAO');
    if (blocking.length > 0) {
      throw new ApiError(
        `Aprovacao bloqueada por alertas: ${blocking.map((a) => a.mensagem).join('; ')}`,
        409,
        'CONTROLE_VOOS_RDV_BLOQUEADO_POR_ALERTA',
      );
    }

    const novaVersao = rdv.versao + 1;
    await c.env.DB
      .prepare(
        `
        UPDATE cv_rdv_operacional
        SET workflow_status = 'aprovado_coordenacao', versao = ?, aprovado_coordenacao_por = ?,
            aprovado_coordenacao_em = datetime('now'), updated_by = ?, updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND versao = ?
      `,
      )
      .bind(novaVersao, userId, userId, rdv.id, empresaId, rdv.versao)
      .run();

    const observacao = typeof payload.observacao === 'string' ? payload.observacao : null;
    await c.env.DB
      .prepare(
        `
        INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, observacao, created_at)
        VALUES (?, ?, ?, 'COORDENACAO', 'APROVADO', ?, ?, datetime('now'))
      `,
      )
      .bind(empresaId, rdv.id, novaVersao, userId, observacao)
      .run();

    await recordFlightEvent({
      db: c.env.DB,
      empresaId,
      vooId: voo.id,
      tipoEvento: 'rdv',
      statusAnterior: voo.status,
      statusNovo: voo.status,
      descricao: 'RDV aprovado pela Coordenacao',
      metadata: { action: 'aprovar', rdv_id: rdv.id, versao: novaVersao },
      usuarioId: userId,
    });

    const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
    return c.json({ success: true, data: updated });
  },
);

controleVoos.post(
  '/voos/:id/rdv/finalizar',
  auth(),
  requireRdvCoordenacao(RDV_CAPABILITIES.aprovarCoordenacao),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const userId = Number(getActorId(c));
    const vooId = c.req.param('id');
    const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
    const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
    if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

    assertRdvWorkflowTransition(rdv.workflow_status, 'finalizado');
    const payload = await parseOptionalJsonPayload(c);
    if (payload.versao !== undefined) assertRdvVersion(rdv, payload.versao);

    const novaVersao = rdv.versao + 1;
    await c.env.DB
      .prepare(
        `
        UPDATE cv_rdv_operacional
        SET workflow_status = 'finalizado', versao = ?, finalizado_workflow_em = datetime('now'),
            updated_by = ?, updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND versao = ?
      `,
      )
      .bind(novaVersao, userId, rdv.id, empresaId, rdv.versao)
      .run();

    await recordFlightEvent({
      db: c.env.DB,
      empresaId,
      vooId: voo.id,
      tipoEvento: 'rdv',
      statusAnterior: voo.status,
      statusNovo: voo.status,
      descricao: 'RDV finalizado',
      metadata: { action: 'finalizar', rdv_id: rdv.id, versao: novaVersao },
      usuarioId: userId,
    });

    const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
    return c.json({ success: true, data: updated });
  },
);

controleVoos.post('/voos/:id/rdv/reabrir', auth(), requireRdvCoordenacao(RDV_CAPABILITIES.reabrir), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

  assertRdvWorkflowTransition(rdv.workflow_status, 'em_revisao');
  const payload = await parseJsonPayload(c);
  if (payload.versao !== undefined) assertRdvVersion(rdv, payload.versao);
  const justificativa = requireNonEmptyText(payload.justificativa, 'justificativa');

  const novaVersao = rdv.versao + 1;
  await c.env.DB
    .prepare(
      `
      UPDATE cv_rdv_operacional
      SET workflow_status = 'em_revisao', status = 'rascunho', versao = ?,
          reaberto_por = ?, reaberto_em = datetime('now'), updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ? AND versao = ?
    `,
    )
    .bind(novaVersao, userId, userId, rdv.id, empresaId, rdv.versao)
    .run();

  await c.env.DB
    .prepare(
      `
      INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, justificativa, created_at)
      VALUES (?, ?, ?, 'COORDENACAO', 'REABERTO', ?, ?, datetime('now'))
    `,
    )
    .bind(empresaId, rdv.id, novaVersao, userId, justificativa)
    .run();

  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: voo.id,
    tipoEvento: 'rdv',
    statusAnterior: voo.status,
    statusNovo: voo.status,
    descricao: 'RDV reaberto pela Coordenacao',
    metadata: { action: 'reabrir', rdv_id: rdv.id, versao: novaVersao, justificativa },
    usuarioId: userId,
  });

  const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
  return c.json({ success: true, data: updated });
});

controleVoos.post('/voos/:id/rdv/cancelar', auth(), requireRdvPilotOrCoordenacao(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.cancelar);

  const rdv = await getActiveRdvByFlight(c.env.DB, voo.id, empresaId);
  if (!rdv) throw new ApiError('RDV nao encontrado', 404, 'CONTROLE_VOOS_RDV_NOT_FOUND');

  assertRdvWorkflowTransition(rdv.workflow_status, 'cancelado');
  const payload = await parseJsonPayload(c);
  if (payload.versao !== undefined) assertRdvVersion(rdv, payload.versao);
  const justificativa = requireNonEmptyText(payload.justificativa, 'justificativa');

  const novaVersao = rdv.versao + 1;
  await c.env.DB
    .prepare(
      `
      UPDATE cv_rdv_operacional
      SET workflow_status = 'cancelado', status = 'cancelado', versao = ?,
          motivo_cancelamento = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ? AND versao = ?
    `,
    )
    .bind(novaVersao, justificativa, userId, rdv.id, empresaId, rdv.versao)
    .run();

  await c.env.DB
    .prepare(
      `
      INSERT INTO cv_rdv_aprovacoes (empresa_id, rdv_id, versao, tipo_aprovacao, status, usuario_id, justificativa, created_at)
      VALUES (?, ?, ?, 'COORDENACAO', 'CANCELADO', ?, ?, datetime('now'))
    `,
    )
    .bind(empresaId, rdv.id, novaVersao, userId, justificativa)
    .run();

  const updated = await getRdvOrThrow(c.env.DB, rdv.id, empresaId);
  return c.json({ success: true, data: updated });
});

// ===========================================================================
// Tripulação (cv_voo_tripulantes)
// ===========================================================================

const allowedCrewFuncoes = new Set(['PIC', 'SIC', 'COM', 'MEC', 'OUTRO']);

async function assertFuncionarioBelongsToEmpresa(db: D1Database, funcionarioId: number, empresaId: number) {
  const row = await db
    .prepare('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(funcionarioId, empresaId)
    .first();
  if (!row) {
    throw new ApiError('Funcionario nao encontrado nesta empresa', 400, 'CONTROLE_VOOS_TRIPULANTE_FUNCIONARIO_INVALIDO');
  }
}

controleVoos.get('/voos/:id/tripulantes', auth(), requireRdvPilotOrCoordenacao(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.visualizarProprio);

  const { results } = await c.env.DB
    .prepare(
      `
      SELECT t.id, t.voo_id, t.etapa_id, t.funcionario_id, t.funcao,
             t.horario_apresentacao, t.horario_dispensa, t.observacoes,
             f.nome AS funcionario_nome, f.codigo_anac AS funcionario_codigo_anac
      FROM cv_voo_tripulantes t
      LEFT JOIN funcionarios f ON f.id = t.funcionario_id AND f.empresa_id = t.empresa_id
      WHERE t.voo_id = ? AND t.empresa_id = ? AND t.deleted_at IS NULL
      ORDER BY t.funcao ASC, t.id ASC
    `,
    )
    .bind(voo.id, empresaId)
    .all();

  return c.json({ success: true, data: results || [] });
});

controleVoos.post('/voos/:id/tripulantes', auth(), requireControleVoosWrite(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  const payload = await parseJsonPayload(c);

  const funcionarioId = parsePositiveInteger(payload.funcionario_id, 'funcionario_id');
  const funcao = normalizeString(payload.funcao, 'funcao', true) as string;
  if (!allowedCrewFuncoes.has(funcao)) {
    throw new ApiError('funcao invalida', 400, 'CONTROLE_VOOS_TRIPULANTE_FUNCAO_INVALIDA');
  }
  await assertFuncionarioBelongsToEmpresa(c.env.DB, funcionarioId, empresaId);

  const horarioApresentacao = normalizeString(payload.horario_apresentacao, 'horario_apresentacao');
  const horarioDispensa = normalizeString(payload.horario_dispensa, 'horario_dispensa');
  if (horarioApresentacao && horarioDispensa && horarioDispensa < horarioApresentacao) {
    throw new ApiError('Horario de dispensa anterior a apresentacao', 400, 'CONTROLE_VOOS_TRIPULANTE_HORARIO_INVALIDO');
  }
  const observacoes = normalizeString(payload.observacoes, 'observacoes');
  const etapaId = parseOptionalPositiveInteger(payload.etapa_id, 'etapa_id');

  const result = await c.env.DB
    .prepare(
      `
      INSERT INTO cv_voo_tripulantes (
        empresa_id, voo_id, etapa_id, funcionario_id, funcao,
        horario_apresentacao, horario_dispensa, observacoes,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `,
    )
    .bind(empresaId, voo.id, etapaId, funcionarioId, funcao, horarioApresentacao, horarioDispensa, observacoes, userId, userId)
    .run();

  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId: voo.id,
    tipoEvento: 'tripulacao',
    statusAnterior: voo.status,
    statusNovo: voo.status,
    descricao: 'Tripulante adicionado',
    metadata: { action: 'create', tripulante_id: Number(result.meta.last_row_id), funcao },
    usuarioId: userId,
  });

  return c.json({ success: true, data: { id: Number(result.meta.last_row_id) } }, 201);
});

controleVoos.put('/voos/:id/tripulantes/:tripulanteId', auth(), requireControleVoosWrite(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const tripulanteId = parsePositiveInteger(c.req.param('tripulanteId'), 'tripulanteId');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);

  const existing = await c.env.DB
    .prepare('SELECT id FROM cv_voo_tripulantes WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(tripulanteId, voo.id, empresaId)
    .first();
  if (!existing) throw new ApiError('Tripulante nao encontrado', 404, 'CONTROLE_VOOS_TRIPULANTE_NOT_FOUND');

  const payload = await parseJsonPayload(c);
  const sets: string[] = [];
  const values: unknown[] = [];

  if (payload.funcao !== undefined) {
    const funcao = normalizeString(payload.funcao, 'funcao', true) as string;
    if (!allowedCrewFuncoes.has(funcao)) {
      throw new ApiError('funcao invalida', 400, 'CONTROLE_VOOS_TRIPULANTE_FUNCAO_INVALIDA');
    }
    sets.push('funcao = ?');
    values.push(funcao);
  }
  if (payload.horario_apresentacao !== undefined) {
    sets.push('horario_apresentacao = ?');
    values.push(normalizeString(payload.horario_apresentacao, 'horario_apresentacao'));
  }
  if (payload.horario_dispensa !== undefined) {
    sets.push('horario_dispensa = ?');
    values.push(normalizeString(payload.horario_dispensa, 'horario_dispensa'));
  }
  if (payload.observacoes !== undefined) {
    sets.push('observacoes = ?');
    values.push(normalizeString(payload.observacoes, 'observacoes'));
  }

  if (sets.length > 0) {
    sets.push('updated_by = ?', 'updated_at = datetime("now")');
    values.push(userId, tripulanteId, empresaId);
    await c.env.DB
      .prepare(`UPDATE cv_voo_tripulantes SET ${sets.join(', ')} WHERE id = ? AND empresa_id = ?`)
      .bind(...values)
      .run();
  }

  return c.json({ success: true, data: { id: tripulanteId } });
});

controleVoos.delete('/voos/:id/tripulantes/:tripulanteId', auth(), requireControleVoosWrite(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const tripulanteId = parsePositiveInteger(c.req.param('tripulanteId'), 'tripulanteId');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);

  await c.env.DB
    .prepare(
      `
      UPDATE cv_voo_tripulantes
      SET deleted_at = datetime('now'), updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
    `,
    )
    .bind(userId, tripulanteId, voo.id, empresaId)
    .run();

  return c.json({ success: true, data: { id: tripulanteId } });
});

// ===========================================================================
// Abastecimentos (cv_voo_abastecimentos)
// ===========================================================================

controleVoos.get('/voos/:id/abastecimentos', auth(), requireRdvPilotOrCoordenacao(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  await assertRdvSelfScope(c, c.env.DB, empresaId, voo.id, RDV_CAPABILITIES.visualizarProprio);

  const { results } = await c.env.DB
    .prepare(
      `
      SELECT id, voo_id, etapa_id, fornecedor, localidade, combustivel_solicitado, unidade,
             combustivel_abastecido, numero_ce, anexo_r2_key, responsavel_id, data_hora, observacoes
      FROM cv_voo_abastecimentos
      WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
      ORDER BY data_hora ASC, id ASC
    `,
    )
    .bind(voo.id, empresaId)
    .all();

  return c.json({ success: true, data: results || [] });
});

controleVoos.post('/voos/:id/abastecimentos', auth(), requireControleVoosWrite(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);
  const payload = await parseJsonPayload(c);

  const dataHora = normalizeString(payload.data_hora, 'data_hora', true) as string;
  const fornecedor = normalizeString(payload.fornecedor, 'fornecedor');
  const localidade = normalizeString(payload.localidade, 'localidade');
  const unidade = normalizeString(payload.unidade, 'unidade') || 'L';
  const combustivelSolicitado = parseOptionalNonNegativeNumber(payload.combustivel_solicitado, 'combustivel_solicitado');
  const combustivelAbastecido = parseOptionalNonNegativeNumber(payload.combustivel_abastecido, 'combustivel_abastecido');
  const numeroCe = normalizeString(payload.numero_ce, 'numero_ce');
  const anexoR2Key = normalizeString(payload.anexo_r2_key, 'anexo_r2_key');
  const responsavelId = parseOptionalPositiveInteger(payload.responsavel_id, 'responsavel_id');
  const etapaId = parseOptionalPositiveInteger(payload.etapa_id, 'etapa_id');
  const observacoes = normalizeString(payload.observacoes, 'observacoes');

  const result = await c.env.DB
    .prepare(
      `
      INSERT INTO cv_voo_abastecimentos (
        empresa_id, voo_id, etapa_id, fornecedor, localidade,
        combustivel_solicitado, unidade, combustivel_abastecido, numero_ce,
        anexo_r2_key, responsavel_id, data_hora, observacoes,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `,
    )
    .bind(
      empresaId,
      voo.id,
      etapaId,
      fornecedor,
      localidade,
      combustivelSolicitado,
      unidade,
      combustivelAbastecido,
      numeroCe,
      anexoR2Key,
      responsavelId,
      dataHora,
      observacoes,
      userId,
      userId,
    )
    .run();

  return c.json({ success: true, data: { id: Number(result.meta.last_row_id) } }, 201);
});

controleVoos.delete('/voos/:id/abastecimentos/:abastecimentoId', auth(), requireControleVoosWrite(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const vooId = c.req.param('id');
  const abastecimentoId = parsePositiveInteger(c.req.param('abastecimentoId'), 'abastecimentoId');
  const voo = await getFlightOrThrow(c.env.DB, vooId, empresaId);

  await c.env.DB
    .prepare(
      `
      UPDATE cv_voo_abastecimentos
      SET deleted_at = datetime('now'), updated_by = ?, updated_at = datetime('now')
      WHERE id = ? AND voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
    `,
    )
    .bind(userId, abastecimentoId, voo.id, empresaId)
    .run();

  return c.json({ success: true, data: { id: abastecimentoId } });
});

controleVoos.get('/dashboard', auth(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const filters = parseOperationalReadFilters(c);
  const scope = buildFlightScope('v', empresaId, filters);

  const totalsRow = await c.env.DB
    .prepare(
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

  const { results: nextFlights } = await c.env.DB
    .prepare(
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

  const overallRow = await c.env.DB
    .prepare(
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

  const { results: perDay } = await c.env.DB
    .prepare(
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

  const { results: cancelamentos } = await c.env.DB
    .prepare(
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
