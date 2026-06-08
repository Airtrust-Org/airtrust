/**
 * HAB ILITACOES ROUTES - Qualificações com Renovações
 *
 * Tabela: habilitacoes (schema correto com eh_renovada, timezone, etc)
 *
 * Campos adicionais vs qualificacoes_historico:
 * - timezone: Fuso horário da conclusão
 * - eh_renovada: Se é uma renovação (0/1)
 * - habilitacao_anterior_id: UUID da habilitação anterior (se renovada)
 * - renovada_em: Data da renovação
 * - nota_final: Nota final (vs "nota")
 */

import { Hono } from 'hono';
import type { Env, PaginatedResponse } from '../types';
import { calculatePagination } from '../utils/db';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/habilitacoes
 * Lista habilitações dos funcionários (tabela correta com campos de renovação)
 *
 * Query params:
 * - funcionario_id: filtrar por funcionário
 * - qualificacao_id: filtrar por tipo de qualificação
 * - status: filtrar por status (ATIVO, VENCIDO, etc)
 * - eh_renovada: filtrar por renovações (0/1)
 * - page, limit: paginação
 */
/**
 * GET /api/habilitacoes
 * Lista habilitações com paginação e filtros
 */
app.get('/', auth(), async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);

    const search = c.req.query('search');
    const ativo = c.req.query('ativo');
    const ehRenovada = c.req.query('eh_renovada');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');

    const whereClauses: string[] = ['deleted_at IS NULL', 'empresa_id = ?'];
    const bindings: unknown[] = [empresaId];

    if (search) {
      const pattern = `%${search}%`;
      whereClauses.push('(nome LIKE ? OR descricao LIKE ?)');
      bindings.push(pattern, pattern);
    }

    if (ativo !== undefined) {
      whereClauses.push('ativo = ?');
      bindings.push(ativo === '0' ? 0 : 1);
    }

    if (ehRenovada !== undefined) {
      whereClauses.push('eh_renovada = ?');
      bindings.push(ehRenovada === '1' ? 1 : 0);
    }

    const whereClause = whereClauses.join(' AND ');

    // Contar total
    const totalQuery = `
    SELECT COUNT(*) as total
    FROM habilitacoes
    WHERE ${whereClause}
  `;

    const totalResult = await db
      .prepare(totalQuery)
      .bind(...bindings)
      .first<{ total: number }>();

    const total = totalResult?.total || 0;
    const pagination = calculatePagination({ page, limit }, total);

    const query = `
    SELECT 
      id,
      nome,
      descricao,
      ativo,
      created_at,
      updated_at,
      deleted_at,
      habilitacao_anterior_id,
      eh_renovada,
      renovada_em,
      empresa_id
    FROM habilitacoes
    WHERE ${whereClause}
    ORDER BY nome ASC, created_at DESC
    LIMIT ? OFFSET ?
  `;

    const { results } = await db
      .prepare(query)
      .bind(...bindings, pagination.limit, pagination.offset)
      .all();

    const response: PaginatedResponse = {
      success: true,
      data: results || [],
      pagination,
    };

    return c.json(response);
  } catch (error) {
    console.error('[HABILITACOES] Error:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao buscar habilitacoes',
        details: 'Detalhes internos omitidos',
      },
      500,
    );
  }
});

export default app;
