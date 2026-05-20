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
import { softDelete } from '../utils/db';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { generateColorFromName, slugify } from '../utils/colors';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth());

/**
 * GET /api/categorias
 * Lista todas as categorias de qualificações
 */
app.get('/', async (c) => {
  const db = c.env.DB;

  const { results } = await db
    .prepare(
      `
    SELECT id, nome, cor, descricao, ativo, created_at, updated_at
    FROM qualificacoes_categorias
    WHERE deleted_at IS NULL
    ORDER BY id ASC
  `,
    )
    .all<any>();

  // Mapear para tipo esperado
  const categorias: QualificacaoCategoria[] = (results || []).map((r) => ({
    id: r.id,
    nome: r.nome,
    slug: slugify(r.nome),
    cor: r.cor || generateColorFromName(r.nome),
    descricao: r.descricao,
    ordem: r.id,
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
      .prepare('SELECT id FROM qualificacoes_categorias WHERE nome = ? AND deleted_at IS NULL')
      .bind(nome)
      .all();

    if (existing && existing.length > 0) {
      return c.json({ success: false, error: 'Categoria já existe' }, 409);
    }

    const result = await db
      .prepare(
        `
        INSERT INTO qualificacoes_categorias (nome, codigo, cor, descricao, ativo, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `,
      )
      .bind(nome, codigo, cor, descricao || null)
      .run();

    const novaCategoria: QualificacaoCategoria = {
      id: result.meta.last_row_id as number,
      nome,
      slug: slugify(nome),
      cor,
      descricao: descricao || undefined,
      ordem: result.meta.last_row_id as number,
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
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    const body = await c.req.json();
    const { nome, descricao, cor } = body;

    // Verificar se categoria existe
    const { results: existing } = await db
      .prepare('SELECT id FROM qualificacoes_categorias WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .all();

    if (!existing || existing.length === 0) {
      return c.json({ success: false, error: 'Categoria não encontrada' }, 404);
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (nome !== undefined && nome.trim().length > 0) {
      updates.push('nome = ?');
      params.push(nome);
    }

    if (descricao !== undefined) {
      updates.push('descricao = ?');
      params.push(descricao);
    }

    if (cor !== undefined) {
      updates.push('cor = ?');
      params.push(cor);
    }

    if (updates.length === 0) {
      return c.json({ success: false, error: 'Nenhum campo para atualizar' }, 400);
    }

    updates.push('updated_at = datetime("now")');
    params.push(id);

    const result = await db
      .prepare(
        `UPDATE qualificacoes_categorias SET ${updates.join(
          ', ',
        )} WHERE id = ? AND deleted_at IS NULL`,
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
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  try {
    const result = await softDelete(db, 'qualificacoes_categorias', id);

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
