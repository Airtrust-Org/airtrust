/**
 * QUALIFICACOES - MÓDULO ESTATÍSTICAS
 * Endpoints de analytics e dashboard
 *
 * Endpoints:
 * - GET / - Dashboard resumido
 * - GET /por-tipo - Stats agrupadas por tipo
 * - GET /por-periodo - Stats por período temporal
 * - GET /renovacoes-pendentes - Renovações aguardando
 * - GET /vencidos - Qualificações vencidas
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../../types';
import { auth } from '../../middleware/auth';
import { getTenantContext } from '../../middleware/tenant';
import { getQualificacoesVencimentoExpr } from '../../utils/qualificacoes-alerta-config';
import { buildCurrentOperationalQualificationPredicate } from '../../lib/qualificacoes/operational-qualification-predicates';
import {
  appendEmployeeSectorFilter,
  getEmployeeSectorAccess,
} from '../../middleware/employee-sector-access';

const router = new Hono<{ Bindings: Env }>();

type EstatisticasContext = Context<{ Bindings: Env }>;

function parseBoundedLimit(raw: string | undefined, fallback = 100, max = 500): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, parsed));
}

function safe(fn: (c: EstatisticasContext) => Promise<Response> | Response) {
  return async (c: EstatisticasContext) => {
    try {
      return await fn(c);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      console.error('[QUALIFICACOES_STATS_ERROR]', error.message, error.stack);
      return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
    }
  };
}

/**
 * GET /
 * Dashboard resumido
 */
router.get(
  '/',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const access = await getEmployeeSectorAccess(c, tenantCtx.empresaId);
    const scopeConditions: string[] = [];
    const scopeBindings: unknown[] = [];
    appendEmployeeSectorFilter(scopeConditions, scopeBindings, access, 'f');
    const currentQualificationPredicate = buildCurrentOperationalQualificationPredicate('qh');
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');

    // Resumo geral
    const resumo = await db
      .prepare(
        `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN ${vencimentoExpr} IS NULL OR (julianday(${vencimentoExpr}) >= julianday('now') AND julianday(${vencimentoExpr}) - julianday('now') > 30) THEN 1 ELSE 0 END) as validas,
        SUM(CASE WHEN ${vencimentoExpr} IS NOT NULL AND julianday(${vencimentoExpr}) - julianday('now') <= 30 AND julianday(${vencimentoExpr}) >= julianday('now') THEN 1 ELSE 0 END) as vencendo,
        SUM(CASE WHEN ${vencimentoExpr} IS NOT NULL AND julianday(${vencimentoExpr}) < julianday('now') THEN 1 ELSE 0 END) as vencidas
      FROM qualificacoes_historico qh
      JOIN funcionarios f ON f.id = qh.funcionario_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
      WHERE ${currentQualificationPredicate}
        AND f.deleted_at IS NULL
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND f.empresa_id = ?
        AND qh.empresa_id = f.empresa_id
        AND ${scopeConditions.join(' AND ')}`,
      )
      .bind(tenantCtx.empresaId, ...scopeBindings)
      .first<{ total: number; validas: number; vencendo: number; vencidas: number }>();

    const stats = {
      total: Number(resumo?.total || 0),
      validas: Number(resumo?.validas || 0),
      vencendo: Number(resumo?.vencendo || 0),
      vencidas: Number(resumo?.vencidas || 0),
    };

    return c.json({ success: true, data: stats });
  }),
);

/**
 * GET /por-tipo
 * Stats agrupadas por tipo de qualificação
 */
router.get(
  '/por-tipo',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const access = await getEmployeeSectorAccess(c, tenantCtx.empresaId);
    const scopeConditions: string[] = [];
    const scopeBindings: unknown[] = [];
    appendEmployeeSectorFilter(scopeConditions, scopeBindings, access, 'f');
    const currentQualificationPredicate = buildCurrentOperationalQualificationPredicate('qh');
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');

    const { results } = await db
      .prepare(
        `SELECT
        qt.id,
        qt.nome,
        qt.codigo,
        qt.categoria,
        COUNT(*) as total,
        SUM(CASE WHEN ${vencimentoExpr} IS NOT NULL AND julianday(${vencimentoExpr}) < julianday('now') THEN 1 ELSE 0 END) as vencidas,
        SUM(CASE WHEN ${vencimentoExpr} IS NOT NULL AND julianday(${vencimentoExpr}) - julianday('now') <= 30 AND julianday(${vencimentoExpr}) >= julianday('now') THEN 1 ELSE 0 END) as vencendo,
        SUM(CASE WHEN ${vencimentoExpr} IS NULL OR julianday(${vencimentoExpr}) - julianday('now') > 30 THEN 1 ELSE 0 END) as validas
      FROM qualificacoes_historico qh
      JOIN funcionarios f ON f.id = qh.funcionario_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
      WHERE ${currentQualificationPredicate}
        AND f.deleted_at IS NULL
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND f.empresa_id = ?
        AND qh.empresa_id = f.empresa_id
        AND ${scopeConditions.join(' AND ')}
      GROUP BY qt.id
      ORDER BY total DESC
      LIMIT 100`,
      )
      .bind(tenantCtx.empresaId, ...scopeBindings)
      .all();

    return c.json({ success: true, data: results || [], meta: { count: (results || []).length } });
  }),
);

/**
 * GET /por-periodo
 * Stats agrupadas por período temporal
 */
router.get(
  '/por-periodo',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const access = await getEmployeeSectorAccess(c, tenantCtx.empresaId);
    const scopeConditions: string[] = [];
    const scopeBindings: unknown[] = [];
    appendEmployeeSectorFilter(scopeConditions, scopeBindings, access, 'f');
    const currentQualificationPredicate = buildCurrentOperationalQualificationPredicate('qh');
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');

    const { results } = await db
      .prepare(
        `SELECT
        strftime('%Y-%m', ${vencimentoExpr}) as periodo,
        COUNT(*) as total,
        SUM(CASE WHEN julianday(${vencimentoExpr}) < julianday('now') THEN 1 ELSE 0 END) as vencidas,
        SUM(CASE WHEN julianday(${vencimentoExpr}) >= julianday('now') THEN 1 ELSE 0 END) as validas
      FROM qualificacoes_historico qh
      JOIN funcionarios f ON f.id = qh.funcionario_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
      WHERE ${currentQualificationPredicate}
        AND f.deleted_at IS NULL
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND f.empresa_id = ?
        AND qh.empresa_id = f.empresa_id
        AND ${scopeConditions.join(' AND ')}
        AND ${vencimentoExpr} IS NOT NULL
      GROUP BY strftime('%Y-%m', ${vencimentoExpr})
      ORDER BY periodo DESC
      LIMIT 50`,
      )
      .bind(tenantCtx.empresaId, ...scopeBindings)
      .all();

    return c.json({ success: true, data: results || [], meta: { count: (results || []).length } });
  }),
);

/**
 * GET /renovacoes-pendentes
 * Qualificações que estão vencendo (próximos 30 dias)
 */
router.get(
  '/renovacoes-pendentes',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const access = await getEmployeeSectorAccess(c, tenantCtx.empresaId);
    const scopeConditions: string[] = [];
    const scopeBindings: unknown[] = [];
    appendEmployeeSectorFilter(scopeConditions, scopeBindings, access, 'f');
    const currentQualificationPredicate = buildCurrentOperationalQualificationPredicate('qh');
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');
    const limit = parseBoundedLimit(c.req.query('limit'));

    const { results } = await db
      .prepare(
        `SELECT
        qh.id,
        f.nome as funcionario_nome,
        f.matricula,
        qt.nome as tipo_nome,
        qt.codigo,
        ${vencimentoExpr} as data_vencimento,
        CAST((julianday(${vencimentoExpr}) - julianday('now')) AS INTEGER) as dias_para_vencer
      FROM qualificacoes_historico qh
      JOIN funcionarios f ON f.id = qh.funcionario_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
      WHERE ${currentQualificationPredicate}
        AND f.deleted_at IS NULL
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND f.empresa_id = ?
        AND qh.empresa_id = f.empresa_id
        AND ${scopeConditions.join(' AND ')}
        AND ${vencimentoExpr} IS NOT NULL
        AND julianday(${vencimentoExpr}) - julianday('now') <= 30
        AND julianday(${vencimentoExpr}) >= julianday('now')
      ORDER BY date(${vencimentoExpr}) ASC
      LIMIT ?`,
      )
      .bind(tenantCtx.empresaId, ...scopeBindings, limit)
      .all();

    return c.json({ success: true, data: results || [], meta: { count: (results || []).length } });
  }),
);

/**
 * GET /vencidos
 * Qualificações que já venceram
 */
router.get(
  '/vencidos',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const access = await getEmployeeSectorAccess(c, tenantCtx.empresaId);
    const scopeConditions: string[] = [];
    const scopeBindings: unknown[] = [];
    appendEmployeeSectorFilter(scopeConditions, scopeBindings, access, 'f');
    const currentQualificationPredicate = buildCurrentOperationalQualificationPredicate('qh');
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');
    const limit = parseBoundedLimit(c.req.query('limit'));

    const { results } = await db
      .prepare(
        `SELECT
        qh.id,
        f.nome as funcionario_nome,
        f.matricula,
        qt.nome as tipo_nome,
        qt.codigo,
        ${vencimentoExpr} as data_vencimento,
        CAST((julianday('now') - julianday(${vencimentoExpr})) AS INTEGER) as dias_vencido
      FROM qualificacoes_historico qh
      JOIN funcionarios f ON f.id = qh.funcionario_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
      WHERE ${currentQualificationPredicate}
        AND f.deleted_at IS NULL
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND f.empresa_id = ?
        AND qh.empresa_id = f.empresa_id
        AND ${scopeConditions.join(' AND ')}
        AND ${vencimentoExpr} IS NOT NULL
        AND julianday(${vencimentoExpr}) < julianday('now')
      ORDER BY date(${vencimentoExpr}) DESC
      LIMIT ?`,
      )
      .bind(tenantCtx.empresaId, ...scopeBindings, limit)
      .all();

    return c.json({ success: true, data: results || [], meta: { count: (results || []).length } });
  }),
);

export default router;
