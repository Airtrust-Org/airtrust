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

const pilotSelfCreate = new Hono<{ Bindings: Env }>();

const ALLOWED_FIELDS = new Set([
  'prefixo',
  'data_programacao',
  'origem_id',
  'destino_id',
  'tipo_voo_id',
  'natureza_voo_id',
  'aeronave_id',
  'horario_previsto_partida',
  'horario_previsto_chegada',
  'observacoes',
  'funcao',
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

async function assertCatalog(db: D1Database, table: string, id: number, empresaId: number, field: string) {
  const row = await db
    .prepare(`SELECT id FROM ${table} WHERE id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL LIMIT 1`)
    .bind(id, empresaId)
    .first();
  if (!row) throw new ApiError(`${field} nao pertence a empresa`, 400, 'CONTROLE_VOOS_PILOT_CREATE_INVALID_CATALOG');
}

async function assertAircraft(db: D1Database, id: number | null, empresaId: number) {
  if (!id) return;
  const row = await db
    .prepare(`SELECT id FROM aeronaves WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) NOT IN ('I','INATIVO','INDISPONIVEL','INDISPONÍVEL') LIMIT 1`)
    .bind(id, empresaId)
    .first();
  if (!row) throw new ApiError('aeronave_id nao pertence a empresa', 400, 'CONTROLE_VOOS_PILOT_CREATE_INVALID_CATALOG');
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

  const prefixo = requiredText(payload.prefixo, 'prefixo');
  const dataProgramacao = requiredText(payload.data_programacao, 'data_programacao');
  const origemId = positiveInt(payload.origem_id, 'origem_id');
  const destinoId = positiveInt(payload.destino_id, 'destino_id');
  const tipoVooId = positiveInt(payload.tipo_voo_id, 'tipo_voo_id');
  const naturezaVooId = positiveInt(payload.natureza_voo_id, 'natureza_voo_id');
  const aeronaveId = payload.aeronave_id == null || payload.aeronave_id === '' ? null : positiveInt(payload.aeronave_id, 'aeronave_id');
  const partida = requiredText(payload.horario_previsto_partida, 'horario_previsto_partida');
  const chegada = requiredText(payload.horario_previsto_chegada, 'horario_previsto_chegada');
  const observacoes = optionalText(payload.observacoes);
  const funcao = String(payload.funcao || 'PIC').toUpperCase();

  if (!['PIC', 'SIC'].includes(funcao)) {
    throw new ApiError('funcao deve ser PIC ou SIC', 400, 'CONTROLE_VOOS_PILOT_CREATE_INVALID_FUNCTION');
  }
  if (!validDate(dataProgramacao) || !validDateTime(partida) || !validDateTime(chegada) || Date.parse(chegada) < Date.parse(partida)) {
    throw new ApiError('Data ou horarios invalidos', 400, 'CONTROLE_VOOS_PILOT_CREATE_INVALID_TIME');
  }
  if (origemId === destinoId) {
    throw new ApiError('Origem e destino devem ser diferentes', 400, 'CONTROLE_VOOS_PILOT_CREATE_SAME_AIRPORT');
  }

  await Promise.all([
    assertCatalog(c.env.DB, 'cv_aeroportos', origemId, empresaId, 'origem_id'),
    assertCatalog(c.env.DB, 'cv_aeroportos', destinoId, empresaId, 'destino_id'),
    assertCatalog(c.env.DB, 'cv_tipos_voo', tipoVooId, empresaId, 'tipo_voo_id'),
    assertCatalog(c.env.DB, 'cv_naturezas_voo', naturezaVooId, empresaId, 'natureza_voo_id'),
    assertAircraft(c.env.DB, aeronaveId, empresaId),
  ]);

  const create = await c.env.DB.prepare(`
    INSERT INTO cv_voos (
      empresa_id, prefixo, data_programacao, origem_id, destino_id,
      tipo_voo_id, natureza_voo_id, aeronave_id,
      horario_previsto_partida, horario_previsto_chegada,
      status, observacoes, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planejado', ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    empresaId, prefixo, dataProgramacao, origemId, destinoId,
    tipoVooId, naturezaVooId, aeronaveId, partida, chegada,
    observacoes, userId, userId,
  ).run();

  const vooId = Number(create.meta.last_row_id);
  try {
    await c.env.DB.prepare(`
      INSERT INTO cv_voo_tripulantes (
        empresa_id, voo_id, funcionario_id, funcao,
        observacoes, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'Voo criado pelo proprio tripulante', ?, ?, datetime('now'), datetime('now'))
    `).bind(empresaId, vooId, funcionarioId, funcao, userId, userId).run();
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
    metadata: { self_service: true, funcionario_id: funcionarioId, funcao },
    usuarioId: userId,
  });

  const voo = await getFlightOrThrow(c.env.DB, String(vooId), empresaId);
  return c.json({ success: true, data: voo, meta: { self_service: true, funcionario_id: funcionarioId, funcao } }, 201);
});

export default pilotSelfCreate;
