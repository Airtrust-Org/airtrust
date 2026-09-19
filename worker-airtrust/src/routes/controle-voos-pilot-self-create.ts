import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import {
  getActorId,
  getEmpresaIdSafe,
  getFlightOrThrow,
  getFuncionarioIdForUser,
  recordFlightEvent,
} from '../repositories/controle-voos/rdv-repository';
import { requireAnyRdvAccess } from '../services/controle-voos/rdv-workflow';
import {
  buildFlightRelatedStatements,
  normalizeFlightRouteIds,
  resolveFlightRoutePoints,
} from '../services/controle-voos/flight-creation';

const pilotSelfCreate = new Hono<{ Bindings: Env }>();

const ALLOWED_FIELDS = new Set([
  'prefixo',
  'data_programacao',
  'rota_ids',
  'numero_voo',
  'numero_db',
  'tipo_voo_id',
  'contrato_id',
  'funcao_bordo_id',
  'aeronave_id',
  'horario_previsto_partida',
  'horario_previsto_chegada',
  'observacoes',
]);

function positiveInt(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(`${field} invalido`, 400, 'CONTROLE_VOOS_PILOT_CREATE_INVALID_PAYLOAD');
  }
  return parsed;
}

function requiredText(value: unknown, field: string): string {
  const text = String(value ?? '').trim();
  if (!text) throw new ApiError(`${field} obrigatorio`, 400, 'CONTROLE_VOOS_PILOT_CREATE_INVALID_PAYLOAD');
  return text;
}

function optionalText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}
function validDateTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

async function assertAircraft(db: D1Database, id: number, empresaId: number) {
  const row = await db
    .prepare(`SELECT id FROM aeronaves WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) NOT IN ('I','INATIVO','INDISPONIVEL','INDISPONÍVEL') LIMIT 1`)
    .bind(id, empresaId)
    .first();
  if (!row) throw new ApiError('aeronave_id nao pertence a empresa', 400, 'CONTROLE_VOOS_PILOT_CREATE_INVALID_CATALOG');
}

async function activeCatalogRow<T extends Record<string, unknown>>(
  db: D1Database,
  table: string,
  id: number,
  empresaId: number,
  fields: string,
  fieldName: string,
): Promise<T> {
  const row = await db
    .prepare(`SELECT ${fields} FROM ${table} WHERE id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL LIMIT 1`)
    .bind(id, empresaId)
    .first<T>();
  if (!row) throw new ApiError(`${fieldName} nao pertence a empresa`, 400, 'CONTROLE_VOOS_PILOT_CREATE_INVALID_CATALOG');
  return row;
}

async function resolveOperationalNature(db: D1Database, empresaId: number): Promise<number> {
  const row = await db
    .prepare("SELECT id FROM cv_naturezas_voo WHERE empresa_id = ? AND codigo = 'OPERACIONAL' AND ativo = 1 AND deleted_at IS NULL LIMIT 1")
    .bind(empresaId)
    .first<{ id: number }>();
  if (!row) throw new ApiError('Natureza operacional interna nao configurada', 409, 'CONTROLE_VOOS_OPERATIONAL_NATURE_MISSING');
  return Number(row.id);
}

function legacyCrewRole(code: string): 'PIC' | 'SIC' | 'OUTRO' {
  if (code === 'COMANDANTE') return 'PIC';
  if (code === 'COPILOTO') return 'SIC';
  return 'OUTRO';
}

pilotSelfCreate.post('/voos/meus/criar', auth(), requireAnyRdvAccess(), async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const userId = Number(getActorId(c));
  const funcionarioId = await getFuncionarioIdForUser(c.env.DB, userId);
  if (!funcionarioId) {
    throw new ApiError('Usuario sem vinculo de funcionario', 403, 'CONTROLE_VOOS_PILOT_CREATE_NO_FUNCIONARIO');
  }

  const funcionario = await c.env.DB
    .prepare('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL LIMIT 1')
    .bind(funcionarioId, empresaId)
    .first();
  if (!funcionario) {
    throw new ApiError('Funcionario nao pertence a empresa ativa', 403, 'CONTROLE_VOOS_PILOT_CREATE_FUNCIONARIO_SCOPE');
  }

  const payload = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError('Payload JSON invalido', 400, 'CONTROLE_VOOS_PILOT_CREATE_INVALID_PAYLOAD');
  }
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new ApiError(`Campo nao permitido: ${key}`, 400, 'CONTROLE_VOOS_PILOT_CREATE_FORBIDDEN_FIELD');
    }
  }

  const prefixo = requiredText(payload.prefixo, 'prefixo').toUpperCase();
  const dataProgramacao = requiredText(payload.data_programacao, 'data_programacao');
  const routeIds = normalizeFlightRouteIds(payload.rota_ids);
  if (!routeIds) throw new ApiError('rota_ids obrigatoria', 400, 'CONTROLE_VOOS_PILOT_CREATE_ROUTE_REQUIRED');
  const numeroVoo = optionalText(payload.numero_voo);
  const numeroDb = optionalText(payload.numero_db);
  const tipoVooId = positiveInt(payload.tipo_voo_id, 'tipo_voo_id');
  const contratoId = positiveInt(payload.contrato_id, 'contrato_id');
  const funcaoBordoId = positiveInt(payload.funcao_bordo_id, 'funcao_bordo_id');
  const aeronaveId = positiveInt(payload.aeronave_id, 'aeronave_id');
  const partida = requiredText(payload.horario_previsto_partida, 'horario_previsto_partida');
  const chegada = requiredText(payload.horario_previsto_chegada, 'horario_previsto_chegada');
  const observacoes = optionalText(payload.observacoes);

  if (!validDate(dataProgramacao) || !validDateTime(partida) || !validDateTime(chegada) || Date.parse(chegada) < Date.parse(partida)) {
    throw new ApiError('Data ou horarios invalidos', 400, 'CONTROLE_VOOS_PILOT_CREATE_INVALID_TIME');
  }

  await assertAircraft(c.env.DB, aeronaveId, empresaId);
  await activeCatalogRow(c.env.DB, 'cv_tipos_voo', tipoVooId, empresaId, 'id', 'tipo_voo_id');
  await activeCatalogRow(c.env.DB, 'cv_contratos', contratoId, empresaId, 'id', 'contrato_id');
  const role = await activeCatalogRow<{ id: number; codigo: string; nome: string }>(
    c.env.DB,
    'cv_funcoes_bordo',
    funcaoBordoId,
    empresaId,
    'id, codigo, nome',
    'funcao_bordo_id',
  );
  const natureId = await resolveOperationalNature(c.env.DB, empresaId);
  const routePoints = await resolveFlightRoutePoints(c.env.DB, empresaId, routeIds);

  const create = await c.env.DB.prepare(`
    INSERT INTO cv_voos (
      empresa_id, prefixo, data_programacao, origem_id, destino_id,
      numero_voo, numero_db, contrato_id, tipo_voo_id, natureza_voo_id, aeronave_id,
      horario_previsto_partida, horario_previsto_chegada,
      status, observacoes, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planejado', ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    empresaId, prefixo, dataProgramacao, routeIds[0], routeIds[routeIds.length - 1],
    numeroVoo, numeroDb, contratoId, tipoVooId, natureId, aeronaveId, partida, chegada,
    observacoes, userId, userId,
  ).run();

  const vooId = Number(create.meta.last_row_id);
  const legacyRole = legacyCrewRole(String(role.codigo || '').trim().toUpperCase());
  const relatedStatements = buildFlightRelatedStatements(c.env.DB, {
    empresaId,
    vooId,
    userId,
    routePoints,
    picFuncionarioId: null,
    sicFuncionarioId: null,
  });
  relatedStatements.push(
    c.env.DB.prepare(`
      INSERT INTO cv_voo_tripulantes (
        empresa_id, voo_id, funcionario_id, funcao, funcao_bordo_id,
        observacoes, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'Voo criado pelo proprio tripulante', ?, ?, datetime('now'), datetime('now'))
    `).bind(empresaId, vooId, funcionarioId, legacyRole, funcaoBordoId, userId, userId),
  );
  try {
    await c.env.DB.batch(relatedStatements);
  } catch (error) {
    await c.env.DB.prepare("UPDATE cv_voos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ?")
      .bind(vooId, empresaId).run();
    throw error;
  }

  await recordFlightEvent({
    db: c.env.DB,
    empresaId,
    vooId,
    tipoEvento: 'sistema',
    statusNovo: 'planejado',
    descricao: 'Voo criado pelo proprio tripulante',
    metadata: { self_service: true, funcionario_id: funcionarioId, funcao_bordo_id: funcaoBordoId, funcao_bordo: role.nome },
    usuarioId: userId,
  });

  const voo = await getFlightOrThrow(c.env.DB, String(vooId), empresaId);
  return c.json({ success: true, data: voo, meta: { self_service: true, funcionario_id: funcionarioId, funcao_bordo_id: funcaoBordoId } }, 201);
});

export default pilotSelfCreate;
