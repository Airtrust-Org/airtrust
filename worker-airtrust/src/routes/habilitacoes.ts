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

    const funcionarioId = c.req.query('funcionario_id');
    const qualificacaoId = c.req.query('qualificacao_id');
    const status = c.req.query('status');
    const ehRenovada = c.req.query('eh_renovada');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');

    const whereClauses: string[] = ['h.deleted_at IS NULL'];
    const bindings: unknown[] = [];

    if (funcionarioId) {
      whereClauses.push('h.funcionario_id = ?');
      bindings.push(funcionarioId); // TEXT em produção
    }

    if (qualificacaoId) {
      whereClauses.push('h.qualificacao_id = ?');
      bindings.push(qualificacaoId); // TEXT em produção
    }

    if (status) {
      whereClauses.push('h.status = ?');
      bindings.push(status);
    }

    if (ehRenovada !== undefined) {
      whereClauses.push('h.eh_renovada = ?');
      bindings.push(ehRenovada === '1' ? 1 : 0);
    }

    const whereClause = whereClauses.join(' AND ');

    // Contar total
    const totalQuery = `
    SELECT COUNT(*) as total
    FROM habilitacoes h
    WHERE ${whereClause}
  `;

    const totalResult = await db
      .prepare(totalQuery)
      .bind(...bindings)
      .first<{ total: number }>();

    const total = totalResult?.total || 0;
    const pagination = calculatePagination({ page, limit }, total);

    // Query principal - SELECT * para descobrir schema real em produção
    const query = `
    SELECT 
      h.*,
      f.nome as funcionario_nome,
      f.matricula as funcionario_matricula,
      f.cargo as funcionario_cargo
    FROM habilitacoes h
    LEFT JOIN funcionarios f ON h.funcionario_id = CAST(f.id AS TEXT) AND f.deleted_at IS NULL
    WHERE ${whereClause}
    ORDER BY h.data_vencimento DESC NULLS LAST, h.created_at DESC
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
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

export default app;
