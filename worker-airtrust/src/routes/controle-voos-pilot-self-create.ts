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
  'origem_texto',
  'destino_texto',
  'tipo_voo_texto',
  'natureza_voo_codigo',
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

function stableTemporaryCode(prefix: string, value: string): string {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  let hash = 2166136261;
  for (const char of normalized) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36).toUpperCase()}`;
}

async function ensureTemporaryAirport(db: D1Database, empresaId: number, userId: number, name: string): Promise<number> {
  const code = stableTemporaryCode('PILOT_AER', name);
  await db.prepare(`INSERT OR IGNORE INTO cv_aeroportos (empresa_id, codigo, nome, tipo, descricao, ativo, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 'heliponto', 'Entrada livre temporaria pelo fluxo Criar meu voo', 0, ?, ?, datetime('now'), datetime('now'))`).bind(empresaId, code, name, userId, userId).run();
  const row = await db.prepare('SELECT id FROM cv_aeroportos WHERE empresa_id = ? AND codigo = ? AND deleted_at IS NULL LIMIT 1').bind(empresaId, code).first<{ id: number }>();
  if (!row) throw new ApiError('Aerodromo digitado indisponivel', 409, 'CONTROLE_VOOS_PILOT_CREATE_MANUAL_AIRPORT_UNAVAILABLE');
  return Number(row.id);
}

async function ensureTemporaryFlightType(db: D1Database, empresaId: number, userId: number, name: string): Promise<number> {
  const code = stableTemporaryCode('PILOT_TIPO', name);
  await db.prepare(`INSERT OR IGNORE INTO cv_tipos_voo (empresa_id, codigo, nome, descricao, ativo, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 'Entrada livre temporaria pelo fluxo Criar meu voo', 0, ?, ?, datetime('now'), datetime('now'))`).bind(empresaId, code, name, userId, userId).run();
  const row = await db.prepare('SELECT id FROM cv_tipos_voo WHERE empresa_id = ? AND codigo = ? AND deleted_at IS NULL LIMIT 1').bind(empresaId, code).first<{ id: number }>();
  if (!row) throw new ApiError('Tipo de voo digitado indisponivel', 409, 'CONTROLE_VOOS_PILOT_CREATE_MANUAL_TYPE_UNAVAILABLE');
  return Number(row.id);
}

async function resolvePilotNature(db: D1Database, empresaId: number, code: string): Promise<number> {
  const allowed = new Set(['MANUTENCAO', 'PETROBRAS']);
  if (!allowed.has(code)) throw new ApiError('Natureza do voo invalida', 400, 'CONTROLE_VOOS_PILOT_CREATE_INVALID_NATURE');
  const existing = await db.prepare('SELECT id, ativo FROM cv_naturezas_voo WHERE empresa_id = ? AND codigo = ? AND deleted_at IS NULL LIMIT 1').bind(empresaId, code).first<{ id: number; ativo: number }>();
  if (!existing) {
    throw new ApiError('Natureza do voo nao esta configurada para a empresa', 409, 'CONTROLE_VOOS_PILOT_CREATE_NATURE_NOT_CONFIGURED');
  }
  if (Number(existing.ativo) !== 1) throw new ApiError('Natureza do voo esta inativa', 409, 'CONTROLE_VOOS_PILOT_CREATE_NATURE_INACTIVE');
  return Number(existing.id);
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
  const manualMode = ['origem_texto', 'destino_texto', 'tipo_voo_texto', 'natureza_voo_codigo'].some((field) => String(payload[field] ?? '').trim().length > 0);
  let origemId: number;
  let destinoId: number;
  let tipoVooId: number;
  let naturezaVooId: number;
  if (manualMode) {
    const origemTexto = requiredText(payload.origem_texto, 'origem_texto');
    const destinoTexto = requiredText(payload.destino_texto, 'destino_texto');
    const tipoVooTexto = requiredText(payload.tipo_voo_texto, 'tipo_voo_texto');
    const naturezaCodigo = requiredText(payload.natureza_voo_codigo, 'natureza_voo_codigo').toUpperCase();
    if (origemTexto.toUpperCase() === destinoTexto.toUpperCase()) throw new ApiError('Origem e destino devem ser diferentes', 400, 'CONTROLE_VOOS_PILOT_CREATE_SAME_AIRPORT');
    origemId = await ensureTemporaryAirport(c.env.DB, empresaId, userId, origemTexto);
    destinoId = await ensureTemporaryAirport(c.env.DB, empresaId, userId, destinoTexto);
    tipoVooId = await ensureTemporaryFlightType(c.env.DB, empresaId, userId, tipoVooTexto);
    naturezaVooId = await resolvePilotNature(c.env.DB, empresaId, naturezaCodigo);
  } else {
    origemId = positiveInt(payload.origem_id, 'origem_id');
    destinoId = positiveInt(payload.destino_id, 'destino_id');
    tipoVooId = positiveInt(payload.tipo_voo_id, 'tipo_voo_id');
    naturezaVooId = positiveInt(payload.natureza_voo_id, 'natureza_voo_id');
  }
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

  if (!manualMode) {
    await Promise.all([
      assertCatalog(c.env.DB, 'cv_aeroportos', origemId, empresaId, 'origem_id'),
      assertCatalog(c.env.DB, 'cv_aeroportos', destinoId, empresaId, 'destino_id'),
      assertCatalog(c.env.DB, 'cv_tipos_voo', tipoVooId, empresaId, 'tipo_voo_id'),
      assertCatalog(c.env.DB, 'cv_naturezas_voo', naturezaVooId, empresaId, 'natureza_voo_id'),
    ]);
  }
  await assertAircraft(c.env.DB, aeronaveId, empresaId);

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
    metadata: { self_service: true, funcionario_id: funcionarioId, funcao, entrada_livre_temporaria: manualMode },
    usuarioId: userId,
  });

  const voo = await getFlightOrThrow(c.env.DB, String(vooId), empresaId);
  return c.json({ success: true, data: voo, meta: { self_service: true, funcionario_id: funcionarioId, funcao } }, 201);
});

export default pilotSelfCreate;
