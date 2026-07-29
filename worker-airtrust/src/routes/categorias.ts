/**
 * CATEGORIAS ROUTES - Gestão de Categorias de Qualificações
 *
 * Endpoints para gerenciar categorias:
 * - GET /api/categorias - Lista todas as categorias
 * - POST /api/categorias - Cria nova categoria
 * - PUT /api/categorias/:id - Atualiza categoria
 * - DELETE /api/categorias/:id - Remove categoria
 */

import { Hono } from 'hono';
import type { Env, QualificacaoCategoria, ApiResponse } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { generateColorFromName, slugify } from '../utils/colors';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth());

/**
 * GET /api/categorias
 * Lista categorias de qualificações.
 * Query params opcionais:
 *   setor_ids=1,2,3 — filtra categorias que têm pelo menos um tipo vinculado aos setores indicados
 *   setor_id=11     — alias para setor_ids (um único valor)
 *   ativo=1         — retorna apenas categorias ativas (uso de criação)
 */
app.get('/', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  const rawSetorIds = c.req.query('setor_ids') || c.req.query('setor_id');
  const apenasAtivas = c.req.query('ativo') === '1';
  const setorIds: number[] = rawSetorIds
    ? rawSetorIds
        .split(',')
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];

  let sql: string;
  let bindings: unknown[];

  if (setorIds.length > 0) {
    const placeholders = setorIds.map(() => '?').join(', ');
    sql = `
      SELECT DISTINCT qc.id, qc.codigo, qc.nome, qc.cor, qc.descricao, qc.ativo, qc.created_at, qc.updated_at
      FROM qualificacoes_categorias qc
      INNER JOIN qualificacoes_tipos qt
        ON qt.categoria_id = qc.id
        AND qt.empresa_id = qc.empresa_id
        AND qt.deleted_at IS NULL
      INNER JOIN qualificacoes_tipos_setores qts
        ON qts.tipo_id = qt.id
        AND qts.empresa_id = qc.empresa_id
        AND qts.setor_id IN (${placeholders})
      WHERE qc.empresa_id = ? AND qc.deleted_at IS NULL ${apenasAtivas ? 'AND qc.ativo = 1' : ''}
      ORDER BY qc.id ASC
    `;
    bindings = [...setorIds, empresaId];
  } else {
    sql = `
      SELECT id, codigo, nome, cor, descricao, ativo, created_at, updated_at
      FROM qualificacoes_categorias
      WHERE empresa_id = ? AND deleted_at IS NULL ${apenasAtivas ? 'AND ativo = 1' : ''}
      ORDER BY id ASC
    `;
    bindings = [empresaId];
  }

  const { results } = await db.prepare(sql).bind(...bindings).all<any>();

  const categorias: QualificacaoCategoria[] = (results || []).map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nome: r.nome,
    slug: slugify(r.nome),
    cor: r.cor || generateColorFromName(r.nome),
    descricao: r.descricao,
      ordem: r.id,
      ativo: Boolean(r.ativo),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  const response: ApiResponse<QualificacaoCategoria[]> = {
    success: true,
    data: categorias,
  };

  return c.json(response);
});

/**
 * POST /api/categorias
 * Cria uma nova categoria
 */
app.post('/', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  try {
    const body = await c.req.json();
    const { nome, descricao } = body;

    if (!nome || nome.trim().length === 0) {
      return c.json({ success: false, error: 'Nome é obrigatório' }, 400);
    }

    const cor = generateColorFromName(nome);
    const codigo = slugify(nome).toUpperCase();

    // Verificar se categoria já existe
    const { results: existing } = await db
      .prepare(
        `SELECT id
         FROM qualificacoes_categorias
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND (
             UPPER(TRIM(nome)) = UPPER(TRIM(?))
             OR UPPER(TRIM(codigo)) = UPPER(TRIM(?))
           )`,
      )
      .bind(empresaId, nome, codigo)
      .all();

    if (existing && existing.length > 0) {
      return c.json({ success: false, error: 'Categoria já existe' }, 409);
    }

    const result = await db
      .prepare(
        `
        INSERT INTO qualificacoes_categorias (
          empresa_id,
          nome,
          codigo,
          cor,
          descricao,
          ativo,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `,
      )
      .bind(empresaId, nome, codigo, cor, descricao || null)
      .run();

    const novaCategoria: QualificacaoCategoria = {
      id: result.meta.last_row_id as number,
      codigo,
      nome,
      slug: slugify(nome),
      cor,
      descricao: descricao || undefined,
      ordem: result.meta.last_row_id as number,
      ativo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const ua = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'qualificacoes_categorias',
      acao: 'INSERT',
      registro_id: novaCategoria.id,
      dados_novos: body,
      ...ua,
    });

    const response: ApiResponse<QualificacaoCategoria> = {
      success: true,
      message: 'Categoria criada com sucesso',
      data: novaCategoria,
    };

    return c.json(response, 201);
  } catch (error) {
    console.error('[POST /categorias] Erro:', error);
    return c.json({ success: false, error: 'Erro ao criar categoria' }, 500);
  }
});

/**
 * PUT /api/categorias/:id
 * Atualiza uma categoria
 */
app.put('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    const body = await c.req.json();
    const { nome, descricao, cor, ativo } = body;

    // Verificar se categoria existe
    const existing = await db
      .prepare('SELECT * FROM qualificacoes_categorias WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(id, empresaId)
      .first<any>();

    if (!existing) {
      return c.json({ success: false, error: 'Categoria não encontrada' }, 404);
    }

    const nextNome = nome !== undefined && nome.trim().length > 0 ? nome : existing.nome;
    const nextCodigo = slugify(nextNome).toUpperCase();

    const duplicate = await db
      .prepare(
        `SELECT id
         FROM qualificacoes_categorias
         WHERE empresa_id = ?
           AND id <> ?
           AND deleted_at IS NULL
           AND (
             UPPER(TRIM(nome)) = UPPER(TRIM(?))
             OR UPPER(TRIM(codigo)) = UPPER(TRIM(?))
           )
         LIMIT 1`,
      )
      .bind(empresaId, id, nextNome, nextCodigo)
      .first();

    if (duplicate) {
      return c.json({ success: false, error: 'Categoria já existe' }, 409);
    }

    if (nome !== undefined && nextNome !== existing.nome) {
      const modelosEmUso = await db
        .prepare(
          `SELECT id
             FROM qualificacoes_tipos
            WHERE empresa_id = ?
              AND deleted_at IS NULL
              AND (
                categoria_id = ?
                OR UPPER(TRIM(COALESCE(categoria, ''))) = UPPER(TRIM(?))
              )
            LIMIT 1`,
        )
        .bind(empresaId, id, existing.nome)
        .first();
      if (modelosEmUso) {
        return c.json(
          { success: false, error: 'Categoria possui modelos ativos; reclassifique-os por operação controlada antes de renomear' },
          409,
        );
      }
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (nome !== undefined && nome.trim().length > 0) {
      updates.push('nome = ?');
      params.push(nextNome);
      updates.push('codigo = ?');
      params.push(nextCodigo);
    }

    if (descricao !== undefined) {
      updates.push('descricao = ?');
      params.push(descricao);
    }

    if (cor !== undefined) {
      updates.push('cor = ?');
      params.push(cor);
    }

    if (ativo !== undefined) {
      updates.push('ativo = ?');
      params.push(ativo ? 1 : 0);
    }

    if (updates.length === 0) {
      return c.json({ success: false, error: 'Nenhum campo para atualizar' }, 400);
    }

    updates.push('updated_at = datetime("now")');
    params.push(id, empresaId);

    const result = await db
      .prepare(
        `UPDATE qualificacoes_categorias SET ${updates.join(
          ', ',
        )} WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(...params)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Não foi possível atualizar a categoria' }, 500);
    }

    const ua2 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'qualificacoes_categorias',
      acao: 'UPDATE',
      registro_id: id,
      dados_novos: body,
      ...ua2,
    });

    const response: ApiResponse = {
      success: true,
      message: 'Categoria atualizada com sucesso',
    };

    return c.json(response);
  } catch (error) {
    console.error('[PUT /categorias/:id] Erro:', error);
    return c.json({ success: false, error: 'Erro ao atualizar categoria' }, 500);
  }
});

/**
 * DELETE /api/categorias/:id
 * Remove uma categoria (soft delete)
 */
app.delete('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    const emUso = await db
      .prepare(
        `SELECT id
           FROM qualificacoes_tipos
          WHERE empresa_id = ?
            AND deleted_at IS NULL
            AND (categoria_id = ? OR (categoria_id IS NULL AND UPPER(TRIM(COALESCE(categoria, ''))) = UPPER(TRIM((SELECT nome FROM qualificacoes_categorias WHERE id = ? AND empresa_id = ?)))))
          LIMIT 1`,
      )
      .bind(empresaId, id, id, empresaId)
      .first();
    if (emUso) {
      return c.json(
        { success: false, error: 'Categoria possui modelos ativos; reclassifique-os antes de remover ou desativar' },
        409,
      );
    }

    const result = await db
      .prepare(
        `UPDATE qualificacoes_categorias
         SET deleted_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Categoria não encontrada' }, 404);
    }

    const ua3 = extrairUsuarioAuditoria(c);
    await registrarAuditoria({
      db,
      tabela: 'qualificacoes_categorias',
      acao: 'DELETE',
      registro_id: id,
      ...ua3,
    });

    const response: ApiResponse = {
      success: true,
      message: 'Categoria removida com sucesso',
    };

    return c.json(response);
  } catch (error) {
    console.error('[DELETE /categorias/:id] Erro:', error);
    return c.json({ success: false, error: 'Erro ao deletar categoria' }, 500);
  }
});

export default app;
