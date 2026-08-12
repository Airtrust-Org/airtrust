/**
 * Qualification category catalog.
 *
 * Canonical identity is (empresa_id, id). `codigo` is a stable business key;
 * `nome` is presentation. Qualification models and histories never use a
 * category name as functional identity.
 */

import { Hono, type Context } from 'hono';
import type { Env, ApiResponse } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { generateColorFromName, slugify } from '../utils/colors';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import {
  assertQualificationCategoryCanBeDeactivated,
  resolveQualificationCategoryById,
} from '../services/qualification-category-contract';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

type CategoryColumns = {
  dominioCodigo: boolean;
  lmsIntegrada: boolean;
};

type CategoryRow = {
  id: number;
  empresa_id: number;
  codigo: string;
  nome: string;
  cor: string | null;
  descricao: string | null;
  ativo: number;
  dominio_codigo: string | null;
  lms_integrada: number;
  created_at: string;
  updated_at: string | null;
};

type CategoryApi = {
  id: number;
  codigo: string;
  nome: string;
  slug: string;
  cor: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  dominio_codigo: string | null;
  lms_integrada: boolean;
  created_at: string;
  updated_at: string | null;
};

async function loadCategoryColumns(db: D1Database): Promise<CategoryColumns> {
  const info = await db
    .prepare("PRAGMA table_info('qualificacoes_categorias')")
    .all<{ name?: string }>();
  const names = new Set((info.results || []).map((row) => String(row.name || '')));
  return {
    dominioCodigo: names.has('dominio_codigo'),
    lmsIntegrada: names.has('lms_integrada'),
  };
}

function normalizeCode(value: unknown, fallbackName: string): string {
  const source = String(value || '').trim() || slugify(fallbackName);
  return source
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function categorySelect(columns: CategoryColumns): string {
  return `id, empresa_id, codigo, nome, cor, descricao, ativo,
    ${columns.dominioCodigo ? 'dominio_codigo' : 'NULL'} AS dominio_codigo,
    ${columns.lmsIntegrada ? 'COALESCE(lms_integrada, 0)' : '0'} AS lms_integrada,
    created_at, updated_at`;
}

function serializeCategory(row: CategoryRow): CategoryApi {
  return {
    id: Number(row.id),
    codigo: String(row.codigo),
    nome: String(row.nome),
    slug: slugify(row.nome),
    cor: row.cor || generateColorFromName(row.nome),
    descricao: row.descricao,
    ordem: Number(row.id),
    ativo: Number(row.ativo) === 1,
    dominio_codigo: row.dominio_codigo || null,
    lms_integrada: Number(row.lms_integrada) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function validateDomain(db: D1Database, dominioCodigo: unknown): Promise<string | null> {
  if (dominioCodigo == null || String(dominioCodigo).trim() === '') return null;
  const codigo = String(dominioCodigo).trim().toUpperCase();
  const row = await db
    .prepare('SELECT codigo FROM dominios_operacionais WHERE codigo = ? AND ativo = 1 LIMIT 1')
    .bind(codigo)
    .first<{ codigo: string }>();
  if (!row) {
    throw new ApiError(
      'Domínio operacional inválido ou inativo',
      422,
      'INVALID_OPERATIONAL_DOMAIN',
    );
  }
  return codigo;
}

async function ensureUniqueLmsCategory(
  db: D1Database,
  empresaId: number,
  exceptId?: number,
): Promise<void> {
  const row = await db
    .prepare(
      `SELECT id
         FROM qualificacoes_categorias
        WHERE empresa_id = ?
          AND lms_integrada = 1
          AND ativo = 1
          AND deleted_at IS NULL
          ${exceptId ? 'AND id <> ?' : ''}
        LIMIT 1`,
    )
    .bind(...(exceptId ? [empresaId, exceptId] : [empresaId]))
    .first<{ id: number }>();
  if (row) {
    throw new ApiError(
      'O tenant já possui uma categoria ativa integrada ao LMS',
      409,
      'LMS_CATEGORY_ALREADY_CONFIGURED',
    );
  }
}

function apiErrorResponse(c: Context<{ Bindings: Env }>, error: unknown) {
  if (error instanceof ApiError) {
    return c.json(
      { success: false, error: error.message, code: error.code },
      error.statusCode as 400 | 403 | 404 | 409 | 422 | 500,
    );
  }
  console.error('[QUALIFICATION_CATEGORIES_ERROR]', error);
  return c.json({ success: false, error: 'Erro interno ao processar categoria' }, 500);
}

/** List categories. Inactive categories remain readable for historical/model reload. */
app.get('/', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const columns = await loadCategoryColumns(db);
  const rawSetorIds = c.req.query('setor_ids') || c.req.query('setor_id');
  const apenasAtivas = c.req.query('ativo') === '1';
  const setorIds = rawSetorIds
    ? [
        ...new Set(
          rawSetorIds
            .split(',')
            .map(Number)
            .filter((n) => Number.isInteger(n) && n > 0),
        ),
      ]
    : [];

  const conditions = ['qc.empresa_id = ?', 'qc.deleted_at IS NULL'];
  const bindings: unknown[] = [empresaId];
  if (apenasAtivas) conditions.push('qc.ativo = 1');

  if (setorIds.length > 0) {
    const placeholders = setorIds.map(() => '?').join(', ');
    conditions.push(`EXISTS (
      SELECT 1
        FROM qualificacoes_tipos qt
       WHERE qt.categoria_id = qc.id
         AND qt.empresa_id = qc.empresa_id
         AND qt.deleted_at IS NULL
         AND qt.ativo = 1
         AND (
           NOT EXISTS (
             SELECT 1 FROM qualificacoes_tipos_setores qts_any
              WHERE qts_any.tipo_id = qt.id
                AND qts_any.empresa_id = qt.empresa_id
                AND qts_any.deleted_at IS NULL
           )
           OR EXISTS (
             SELECT 1 FROM qualificacoes_tipos_setores qts
              WHERE qts.tipo_id = qt.id
                AND qts.empresa_id = qt.empresa_id
                AND qts.deleted_at IS NULL
                AND qts.setor_id IN (${placeholders})
           )
         )
    )`);
    bindings.push(...setorIds);
  }

  const result = await db
    .prepare(
      `SELECT ${categorySelect(columns)}
         FROM qualificacoes_categorias qc
        WHERE ${conditions.join(' AND ')}
        ORDER BY qc.id ASC`,
    )
    .bind(...bindings)
    .all<CategoryRow>();

  const response: ApiResponse<CategoryApi[]> = {
    success: true,
    data: (result.results || []).map(serializeCategory),
  };
  return c.json(response);
});

app.post('/', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  try {
    const columns = await loadCategoryColumns(db);
    const body = (await c.req.json()) as Record<string, unknown>;
    const nome = String(body.nome || '').trim();
    if (!nome) return c.json({ success: false, error: 'Nome é obrigatório' }, 400);

    const codigo = normalizeCode(body.codigo, nome);
    if (!codigo) return c.json({ success: false, error: 'Código é obrigatório' }, 400);
    const dominioCodigo = columns.dominioCodigo
      ? await validateDomain(db, body.dominio_codigo)
      : null;
    const lmsIntegrada = columns.lmsIntegrada && Boolean(body.lms_integrada);
    if (lmsIntegrada) await ensureUniqueLmsCategory(db, empresaId);

    const duplicate = await db
      .prepare(
        `SELECT id FROM qualificacoes_categorias
          WHERE empresa_id = ? AND deleted_at IS NULL
            AND (UPPER(TRIM(nome)) = UPPER(TRIM(?)) OR UPPER(TRIM(codigo)) = UPPER(TRIM(?)))
          LIMIT 1`,
      )
      .bind(empresaId, nome, codigo)
      .first();
    if (duplicate) return c.json({ success: false, error: 'Categoria já existe' }, 409);

    const insertColumns = ['empresa_id', 'nome', 'codigo', 'cor', 'descricao', 'ativo'];
    const insertValues: unknown[] = [
      empresaId,
      nome,
      codigo,
      String(body.cor || '').trim() || generateColorFromName(nome),
      body.descricao == null ? null : String(body.descricao),
      body.ativo === false || body.ativo === 0 ? 0 : 1,
    ];
    if (columns.dominioCodigo) {
      insertColumns.push('dominio_codigo');
      insertValues.push(dominioCodigo);
    }
    if (columns.lmsIntegrada) {
      insertColumns.push('lms_integrada');
      insertValues.push(lmsIntegrada ? 1 : 0);
    }

    const result = await db
      .prepare(
        `INSERT INTO qualificacoes_categorias
           (${insertColumns.join(', ')}, created_at, updated_at)
         VALUES (${insertColumns.map(() => '?').join(', ')}, datetime('now'), datetime('now'))`,
      )
      .bind(...insertValues)
      .run();

    const created = await db
      .prepare(
        `SELECT ${categorySelect(columns)} FROM qualificacoes_categorias
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(result.meta.last_row_id, empresaId)
      .first<CategoryRow>();

    if (!created) throw new ApiError('Categoria criada não pôde ser relida', 500);
    await registrarAuditoria({
      db,
      tabela: 'qualificacoes_categorias',
      acao: 'INSERT',
      registro_id: created.id,
      dados_novos: serializeCategory(created),
      ...extrairUsuarioAuditoria(c),
    });
    return c.json(
      { success: true, message: 'Categoria criada com sucesso', data: serializeCategory(created) },
      201,
    );
  } catch (error) {
    return apiErrorResponse(c, error);
  }
});

app.put('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    const columns = await loadCategoryColumns(db);
    const existing = await db
      .prepare(
        `SELECT ${categorySelect(columns)} FROM qualificacoes_categorias
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(id, empresaId)
      .first<CategoryRow>();
    if (!existing) return c.json({ success: false, error: 'Categoria não encontrada' }, 404);

    const body = (await c.req.json()) as Record<string, unknown>;
    if (
      body.codigo !== undefined &&
      normalizeCode(body.codigo, existing.nome) !== existing.codigo
    ) {
      return c.json(
        {
          success: false,
          error: 'Código da categoria é imutável',
          code: 'CATEGORY_CODE_IMMUTABLE',
        },
        409,
      );
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    if (body.nome !== undefined) {
      const nome = String(body.nome || '').trim();
      if (!nome) return c.json({ success: false, error: 'Nome é obrigatório' }, 400);
      const duplicate = await db
        .prepare(
          `SELECT id FROM qualificacoes_categorias
            WHERE empresa_id = ? AND id <> ? AND deleted_at IS NULL
              AND UPPER(TRIM(nome)) = UPPER(TRIM(?)) LIMIT 1`,
        )
        .bind(empresaId, id, nome)
        .first();
      if (duplicate) return c.json({ success: false, error: 'Categoria já existe' }, 409);
      updates.push('nome = ?');
      params.push(nome);
    }
    if (body.descricao !== undefined) {
      updates.push('descricao = ?');
      params.push(body.descricao == null ? null : String(body.descricao));
    }
    if (body.cor !== undefined) {
      updates.push('cor = ?');
      params.push(body.cor == null ? null : String(body.cor));
    }
    if (columns.dominioCodigo && body.dominio_codigo !== undefined) {
      updates.push('dominio_codigo = ?');
      params.push(await validateDomain(db, body.dominio_codigo));
    }

    const nextAtivo = body.ativo === undefined ? Number(existing.ativo) === 1 : Boolean(body.ativo);
    if (!nextAtivo && Number(existing.ativo) === 1) {
      const category = await resolveQualificationCategoryById(db, {
        empresaId,
        categoriaId: id,
      });
      if (!category) throw new ApiError('Categoria não encontrada', 404);
      await assertQualificationCategoryCanBeDeactivated(db, category);
      updates.push('ativo = 0');
    } else if (body.ativo !== undefined && nextAtivo !== (Number(existing.ativo) === 1)) {
      updates.push('ativo = 1');
    }

    if (columns.lmsIntegrada && body.lms_integrada !== undefined) {
      const nextLms = Boolean(body.lms_integrada);
      if (nextLms && Number(existing.lms_integrada) !== 1) {
        await ensureUniqueLmsCategory(db, empresaId, id);
      }
      updates.push('lms_integrada = ?');
      params.push(nextLms ? 1 : 0);
    }

    if (updates.length === 0) {
      return c.json({
        success: true,
        data: serializeCategory(existing),
        message: 'Nenhuma alteração detectada',
      });
    }

    updates.push("updated_at = datetime('now')");
    await db
      .prepare(
        `UPDATE qualificacoes_categorias SET ${updates.join(', ')}
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(...params, id, empresaId)
      .run();

    const updated = await db
      .prepare(
        `SELECT ${categorySelect(columns)} FROM qualificacoes_categorias
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(id, empresaId)
      .first<CategoryRow>();
    if (!updated) throw new ApiError('Categoria atualizada não pôde ser relida', 500);

    await registrarAuditoria({
      db,
      tabela: 'qualificacoes_categorias',
      acao: 'UPDATE',
      registro_id: id,
      dados_anteriores: serializeCategory(existing),
      dados_novos: serializeCategory(updated),
      ...extrairUsuarioAuditoria(c),
    });
    return c.json({
      success: true,
      message: 'Categoria atualizada com sucesso',
      data: serializeCategory(updated),
    });
  } catch (error) {
    return apiErrorResponse(c, error);
  }
});

app.delete('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    const category = await resolveQualificationCategoryById(db, {
      empresaId,
      categoriaId: id,
    });
    if (!category) return c.json({ success: false, error: 'Categoria não encontrada' }, 404);
    await assertQualificationCategoryCanBeDeactivated(db, category);

    const result = await db
      .prepare(
        `UPDATE qualificacoes_categorias
            SET ativo = 0, deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .run();
    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Categoria não encontrada' }, 404);
    }

    await registrarAuditoria({
      db,
      tabela: 'qualificacoes_categorias',
      acao: 'DELETE',
      registro_id: id,
      dados_anteriores: category,
      ...extrairUsuarioAuditoria(c),
    });
    return c.json({ success: true, message: 'Categoria removida com sucesso' });
  } catch (error) {
    return apiErrorResponse(c, error);
  }
});

export default app;
