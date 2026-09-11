import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { auth } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import { checkPermission } from '../middleware/tenant';
import type { Env } from '../types';
import {
  getActorId,
  getEmpresaIdSafe,
  maybeRecordSystemAudit,
} from '../repositories/controle-voos/rdv-repository';

type CatalogKey = 'aeroportos' | 'tipos' | 'naturezas' | 'motivos';

type CatalogConfig = {
  table: string;
  fields: string;
  allowed: readonly string[];
  requiredOnCreate: readonly string[];
};

const catalogManagement = new Hono<{ Bindings: Env }>();

const CATALOGS: Record<CatalogKey, CatalogConfig> = {
  aeroportos: {
    table: 'cv_aeroportos',
    fields: 'id, codigo, codigo_icao, codigo_iata, nome, cidade, uf, tipo, descricao, ativo, ordem',
    allowed: ['codigo', 'codigo_icao', 'codigo_iata', 'nome', 'cidade', 'uf', 'tipo', 'descricao', 'ativo', 'ordem'],
    requiredOnCreate: ['codigo', 'nome', 'tipo'],
  },
  tipos: {
    table: 'cv_tipos_voo',
    fields: 'id, codigo, nome, descricao, ativo, ordem',
    allowed: ['codigo', 'nome', 'descricao', 'ativo', 'ordem'],
    requiredOnCreate: ['codigo', 'nome'],
  },
  naturezas: {
    table: 'cv_naturezas_voo',
    fields: 'id, codigo, nome, descricao, ativo, ordem',
    allowed: ['codigo', 'nome', 'descricao', 'ativo', 'ordem'],
    requiredOnCreate: ['codigo', 'nome'],
  },
  motivos: {
    table: 'cv_motivos_operacionais',
    fields: 'id, codigo, nome, tipo, descricao, ativo, ordem',
    allowed: ['codigo', 'nome', 'tipo', 'descricao', 'ativo', 'ordem'],
    requiredOnCreate: ['codigo', 'nome', 'tipo'],
  },
};

const AEROPORTO_TYPES = new Set(['aeroporto', 'heliponto', 'plataforma']);
const MOTIVO_TYPES = new Set([
  'atraso',
  'cancelamento',
  'alternado_divergido',
  'indisponibilidade',
  'geral',
]);

function requireCatalogManager(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (!checkPermission(c, 'manager')) {
      throw new ApiError(
        'Permissao insuficiente para gerenciar cadastros operacionais',
        403,
        'CONTROLE_VOOS_CATALOG_RBAC_FORBIDDEN',
      );
    }
    await next();
  };
}

function resolveCatalog(raw: string): CatalogKey | null {
  const name = raw.trim().toLowerCase().replace(/_/g, '-');
  if (name === 'aeroportos') return 'aeroportos';
  if (name === 'tipos' || name === 'tipos-voo') return 'tipos';
  if (name === 'naturezas' || name === 'naturezas-voo') return 'naturezas';
  if (name === 'motivos' || name === 'motivos-operacionais') return 'motivos';
  return null;
}

function asPositiveId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError('ID invalido', 400, 'CONTROLE_VOOS_CATALOG_INVALID_ID');
  }
  return id;
}

async function parseJsonPayload(c: Parameters<typeof getEmpresaIdSafe>[0]): Promise<Record<string, unknown>> {
  try {
    const value = await c.req.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid');
    }
    return value as Record<string, unknown>;
  } catch {
    throw new ApiError('Payload JSON invalido', 400, 'CONTROLE_VOOS_CATALOG_INVALID_PAYLOAD');
  }
}

function normalizeText(value: unknown, field: string, required = false): string | null {
  if (value === null || value === undefined) {
    if (required) {
      throw new ApiError(`${field} obrigatorio`, 400, 'CONTROLE_VOOS_CATALOG_INVALID_PAYLOAD');
    }
    return null;
  }
  const text = String(value).trim();
  if (required && !text) {
    throw new ApiError(`${field} obrigatorio`, 400, 'CONTROLE_VOOS_CATALOG_INVALID_PAYLOAD');
  }
  return text || null;
}

function normalizeBoolean(value: unknown): number {
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return 1;
  if (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false') return 0;
  throw new ApiError('ativo invalido', 400, 'CONTROLE_VOOS_CATALOG_INVALID_PAYLOAD');
}

function normalizeOrder(value: unknown): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new ApiError('ordem invalida', 400, 'CONTROLE_VOOS_CATALOG_INVALID_PAYLOAD');
  }
  return number;
}

function normalizePayload(
  key: CatalogKey,
  payload: Record<string, unknown>,
  create: boolean,
): Record<string, string | number | null> {
  const config = CATALOGS[key];
  for (const field of Object.keys(payload)) {
    if (!config.allowed.includes(field)) {
      throw new ApiError(
        `Campo nao permitido: ${field}`,
        400,
        'CONTROLE_VOOS_CATALOG_FORBIDDEN_FIELD',
      );
    }
  }

  if (create) {
    for (const field of config.requiredOnCreate) {
      if (!(field in payload)) {
        throw new ApiError(
          `${field} obrigatorio`,
          400,
          'CONTROLE_VOOS_CATALOG_INVALID_PAYLOAD',
        );
      }
    }
  }

  const normalized: Record<string, string | number | null> = {};
  for (const field of config.allowed) {
    if (!(field in payload)) continue;
    const raw = payload[field];
    if (field === 'ativo') {
      normalized[field] = normalizeBoolean(raw);
      continue;
    }
    if (field === 'ordem') {
      normalized[field] = normalizeOrder(raw);
      continue;
    }
    const required = create && config.requiredOnCreate.includes(field);
    let text = normalizeText(raw, field, required);
    if (text && ['codigo', 'codigo_icao', 'codigo_iata', 'uf'].includes(field)) {
      text = text.toUpperCase();
    }
    normalized[field] = text;
  }

  if (create && !('ativo' in normalized)) normalized.ativo = 1;
  if (create && !('ordem' in normalized)) normalized.ordem = 0;

  if (key === 'aeroportos' && normalized.tipo != null && !AEROPORTO_TYPES.has(String(normalized.tipo))) {
    throw new ApiError('tipo de aerodromo invalido', 400, 'CONTROLE_VOOS_CATALOG_INVALID_PAYLOAD');
  }
  if (key === 'motivos' && normalized.tipo != null && !MOTIVO_TYPES.has(String(normalized.tipo))) {
    throw new ApiError('tipo de motivo invalido', 400, 'CONTROLE_VOOS_CATALOG_INVALID_PAYLOAD');
  }

  return normalized;
}

function mapConstraintError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/unique|constraint/i.test(message)) {
    throw new ApiError(
      'Ja existe um cadastro com esse codigo nesta empresa',
      409,
      'CONTROLE_VOOS_CATALOG_DUPLICATE',
    );
  }
  throw error;
}

async function loadCatalogRow(
  db: D1Database,
  key: CatalogKey,
  id: number,
  empresaId: number,
) {
  const config = CATALOGS[key];
  return db
    .prepare(`SELECT ${config.fields} FROM ${config.table} WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(id, empresaId)
    .first<Record<string, unknown>>();
}

catalogManagement.post(
  '/catalogos/:nome',
  auth(),
  requireCatalogManager(),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const actorId = getActorId(c);
    const key = resolveCatalog(c.req.param('nome'));
    if (!key) {
      throw new ApiError('Catalogo nao encontrado', 404, 'CONTROLE_VOOS_CATALOG_NOT_FOUND');
    }

    const payload = normalizePayload(key, await parseJsonPayload(c), true);
    const config = CATALOGS[key];
    const fields = Object.keys(payload);
    const values = fields.map((field) => payload[field]);
    const placeholders = fields.map(() => '?').join(', ');

    let result;
    try {
      result = await c.env.DB.prepare(
        `INSERT INTO ${config.table} (empresa_id, ${fields.join(', ')}, created_by, updated_by, created_at, updated_at) VALUES (?, ${placeholders}, ?, ?, datetime('now'), datetime('now'))`,
      )
        .bind(empresaId, ...values, actorId, actorId)
        .run();
    } catch (error) {
      mapConstraintError(error);
    }

    const id = Number(result.meta.last_row_id);
    const created = await loadCatalogRow(c.env.DB, key, id, empresaId);
    await maybeRecordSystemAudit(c, config.table, 'INSERT', id, null, created || payload);
    return c.json({ success: true, data: created }, 201);
  },
);

catalogManagement.patch(
  '/catalogos/:nome/:id',
  auth(),
  requireCatalogManager(),
  async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const actorId = getActorId(c);
    const key = resolveCatalog(c.req.param('nome'));
    if (!key) {
      throw new ApiError('Catalogo nao encontrado', 404, 'CONTROLE_VOOS_CATALOG_NOT_FOUND');
    }
    const id = asPositiveId(c.req.param('id'));
    const existing = await loadCatalogRow(c.env.DB, key, id, empresaId);
    if (!existing) {
      throw new ApiError('Cadastro operacional nao encontrado', 404, 'CONTROLE_VOOS_CATALOG_ITEM_NOT_FOUND');
    }

    const payload = normalizePayload(key, await parseJsonPayload(c), false);
    const fields = Object.keys(payload);
    if (fields.length === 0) {
      throw new ApiError('Nenhum campo para atualizar', 400, 'CONTROLE_VOOS_CATALOG_EMPTY_PATCH');
    }

    const config = CATALOGS[key];
    const setSql = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => payload[field]);
    try {
      await c.env.DB.prepare(
        `UPDATE ${config.table} SET ${setSql}, updated_by = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
        .bind(...values, actorId, id, empresaId)
        .run();
    } catch (error) {
      mapConstraintError(error);
    }

    const updated = await loadCatalogRow(c.env.DB, key, id, empresaId);
    await maybeRecordSystemAudit(c, config.table, 'UPDATE', id, existing, updated || payload);
    return c.json({ success: true, data: updated });
  },
);

export default catalogManagement;
