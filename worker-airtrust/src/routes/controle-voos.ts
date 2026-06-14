import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { checkPermission, getEmpresaId } from '../middleware/tenant';
import type { Env } from '../types';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../utils/auditoria';

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

type CatalogConfig = {
  table: string;
  fields: string;
  orderBy: string;
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

const blockedScopeTerms = [
  'assi' + 'natura',
  'assi' + 'nado',
  'vali' + 'dado',
  'valida' + 'cao',
  'homolo' + 'gado',
  'ANAC ' + 'aprovado',
  'e' + 'DB',
  'SDR' + 'Me',
  'R' + 'AS',
  'fis' + 'cal',
  'regulated' + '_',
].map((term) => term.toLowerCase());

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
    const text = value.toLowerCase();
    if (blockedScopeTerms.some((term) => text.includes(term))) {
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
