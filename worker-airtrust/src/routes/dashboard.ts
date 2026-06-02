/**
 * Rotas do Dashboard
 * Estatísticas e métricas do sistema
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { createLogger, toError } from '../utils/logger';
import {
  getQualificacoesAlertaDias,
  getTodayIsoSaoPaulo,
  getQualificacoesVencimentoExpr,
} from '../utils/qualificacoes-alerta-config';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth());

/**
 * GET /api/dashboard/qualificacoes
 * Retorna estatísticas das qualificações
 */
app.get('/qualificacoes', async (c) => {
  try {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const thresholdDias = await getQualificacoesAlertaDias(db, empresaId);
    const hojeSp = getTodayIsoSaoPaulo();
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');

    // ✅ QUERY UNIFICADA - Cálculo DINÂMICO de data_vencimento
    // Usa julianday() para cálculo de datas e JOIN com funcionarios para filtrar ativos
    const statsResult = await db
      .prepare(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE 
            WHEN qh.renovada = 1 THEN 0
            WHEN ${vencimentoExpr} IS NULL THEN 0
            WHEN date(${vencimentoExpr}) > date(?, '+' || ? || ' days') THEN 1 
            ELSE 0 
          END) as validas,
          SUM(CASE 
            WHEN qh.renovada = 1 THEN 0
            WHEN ${vencimentoExpr} IS NULL THEN 0
            WHEN date(${vencimentoExpr}) >= date(?)
             AND date(${vencimentoExpr}) <= date(?, '+' || ? || ' days') THEN 1 
            ELSE 0 
          END) as vencendo,
          SUM(CASE 
            WHEN qh.renovada = 1 THEN 0
            WHEN ${vencimentoExpr} IS NULL THEN 0
            WHEN date(${vencimentoExpr}) < date(?) THEN 1 
            ELSE 0 
          END) as vencidas,
          SUM(CASE WHEN qh.renovada = 1 THEN 1 ELSE 0 END) as renovadas,
          SUM(CASE WHEN (qh.data_conclusao IS NULL OR qh.status = 'PLANEJADA') AND qh.deleted_at IS NULL AND qh.renovada = 0 THEN 1 ELSE 0 END) as planejadas
        FROM qualificacoes_historico qh
        LEFT JOIN funcionarios f ON f.id = qh.funcionario_id 
          AND f.deleted_at IS NULL 
          AND UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'
        LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
        WHERE qh.deleted_at IS NULL
          AND f.id IS NOT NULL
          AND f.empresa_id = ?`,
      )
      .bind(hojeSp, thresholdDias, hojeSp, hojeSp, thresholdDias, hojeSp, empresaId)
      .first<{
        total: number;
        validas: number;
        vencendo: number;
        vencidas: number;
        renovadas: number;
        planejadas: number;
      }>();

    const total_ativas = Number(statsResult?.total || 0);
    const validas = Number(statsResult?.validas || 0);
    const a_vencer_30_dias = Number(statsResult?.vencendo || 0);
    const vencidas = Number(statsResult?.vencidas || 0);
    const renovadas = Number(statsResult?.renovadas || 0);
    const planejadas = Number(statsResult?.planejadas || 0);

    // Qualificações por categoria (fazer JOIN com qualificacoes_tipos)
    const porCategoriaResult = await db
      .prepare(
        `
        SELECT qt.categoria, COUNT(*) as total 
        FROM qualificacoes_historico qh
        LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL
        LEFT JOIN funcionarios f ON f.id = qh.funcionario_id 
          AND f.deleted_at IS NULL 
          AND UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'
        WHERE qh.deleted_at IS NULL 
          AND f.id IS NOT NULL
          AND qh.renovada = 0
          AND qh.data_conclusao IS NOT NULL
          AND f.empresa_id = ?
        GROUP BY qt.categoria
        ORDER BY total DESC
      `,
      )
      .bind(empresaId)
      .all<{ categoria: string; total: number }>();

    const por_categoria = porCategoriaResult.results || [];

    // 🚫 Desabilitar cache para garantir dados atualizados
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');

    return c.json({
      success: true,
      data: {
        total_ativas,
        vencidas,
        a_vencer_30_dias,
        dias_alerta_vencimento: thresholdDias,
        validas,
        renovadas,
        planejadas,
        por_categoria,
      },
    });
  } catch (error) {
    createLogger(c as Context, 'Dashboard').error(
      'Erro ao buscar dashboard de qualificações',
      toError(error),
    );
    return c.json(
      {
        success: false,
        error: 'Erro ao buscar estatísticas de qualificações',
      },
      500,
    );
  }
});

/**
 * GET /api/dashboard/licencas
 * Retorna estatísticas das licenças
 */
app.get('/licencas', async (c) => {
  try {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const thresholdDias = await getQualificacoesAlertaDias(db, empresaId);
    const hojeSp = getTodayIsoSaoPaulo();

    // Total de licenças ativas (filtradas por empresa via funcionarios)
    const totalResult = await db
      .prepare(
        `
        SELECT COUNT(*) as total 
        FROM licencas l
        INNER JOIN funcionarios f ON l.funcionario_id = f.id AND f.deleted_at IS NULL AND f.empresa_id = ?
        WHERE l.deleted_at IS NULL
      `,
      )
      .bind(empresaId)
      .first<{ total: number }>();

    const total_ativas = totalResult?.total || 0;

    // Licenças vencidas
    const vencidasResult = await db
      .prepare(
        `
        SELECT COUNT(*) as total 
        FROM licencas l
        INNER JOIN funcionarios f ON l.funcionario_id = f.id AND f.deleted_at IS NULL AND f.empresa_id = ?
        WHERE date(l.data_vencimento) < date(?) 
        AND l.deleted_at IS NULL
      `,
      )
      .bind(empresaId, hojeSp)
      .first<{ total: number }>();

    const vencidas = vencidasResult?.total || 0;

    // Licenças a vencer (próximos 30 dias)
    const aVencerResult = await db
      .prepare(
        `
        SELECT COUNT(*) as total 
        FROM licencas l
        INNER JOIN funcionarios f ON l.funcionario_id = f.id AND f.deleted_at IS NULL AND f.empresa_id = ?
        WHERE date(l.data_vencimento) BETWEEN date(?) AND date(?, '+' || ? || ' days')
        AND l.deleted_at IS NULL
      `,
      )
      .bind(empresaId, hojeSp, hojeSp, thresholdDias)
      .first<{ total: number }>();

    const a_vencer_30_dias = aVencerResult?.total || 0;

    // Licenças válidas (vencimento > 30 dias)
    const validasResult = await db
      .prepare(
        `
        SELECT COUNT(*) as total 
        FROM licencas l
        INNER JOIN funcionarios f ON l.funcionario_id = f.id AND f.deleted_at IS NULL AND f.empresa_id = ?
        WHERE date(l.data_vencimento) > date(?, '+' || ? || ' days')
        AND l.deleted_at IS NULL
      `,
      )
      .bind(empresaId, hojeSp, thresholdDias)
      .first<{ total: number }>();

    const validas = validasResult?.total || 0;

    // Licenças por tipo
    const porTipoResult = await db
      .prepare(
        `
        SELECT l.tipo, COUNT(*) as total 
        FROM licencas l
        INNER JOIN funcionarios f ON l.funcionario_id = f.id AND f.deleted_at IS NULL AND f.empresa_id = ?
        WHERE l.deleted_at IS NULL 
        GROUP BY l.tipo
        ORDER BY total DESC
      `,
      )
      .bind(empresaId)
      .all<{ tipo: string; total: number }>();

    const por_tipo = porTipoResult.results || [];

    return c.json({
      success: true,
      data: {
        total_ativas,
        vencidas,
        a_vencer_30_dias,
        dias_alerta_vencimento: thresholdDias,
        validas,
        por_tipo,
      },
    });
  } catch (error) {
    createLogger(c as Context, 'Dashboard').error(
      'Erro ao buscar dashboard de licenças',
      toError(error),
    );
    return c.json(
      {
        success: false,
        error: 'Erro ao buscar estatísticas de licenças',
      },
      500,
    );
  }
});

/**
 * ============================================================================
 * DASHBOARD PRINCIPAL - Métricas Operacionais e Alertas
 * ============================================================================
 */

import {
  getDashboardMetrics,
  getDashboardAlerts,
  getComplianceScore,
  getDemandaTreinamento,
  getAtividadesRecentes,
  getTaxaConclusaoMensal,
  getUtilizacaoSimuladores,
  getSystemHealth,
} from '../services/dashboardService';

/**
 * GET /api/dashboard/metrics
 * Retorna métricas principais do dashboard
 */
app.get('/metrics', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const metrics = await getDashboardMetrics(c.env.DB, empresaId);
    return c.json({ success: true, data: metrics });
  } catch (error) {
    createLogger(c as Context, 'Dashboard').error('Erro ao buscar métricas', toError(error));
    return c.json({ success: false, error: 'Erro ao buscar métricas do dashboard' }, 500);
  }
});

/**
 * GET /api/dashboard/alertas-criticos
 * Retorna alertas críticos ordenados por prioridade
 */
app.get('/alertas-criticos', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const alertas = await getDashboardAlerts(c.env.DB, empresaId);
    return c.json({ success: true, data: alertas });
  } catch (error) {
    createLogger(c as Context, 'Dashboard').error(
      'Erro ao buscar alertas críticos',
      toError(error),
    );
    return c.json({ success: false, error: 'Erro ao buscar alertas críticos' }, 500);
  }
});

/**
 * GET /api/dashboard/compliance-score
 * Retorna score de compliance geral
 */
app.get('/compliance-score', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const score = await getComplianceScore(c.env.DB, empresaId);
    return c.json({ success: true, data: score });
  } catch (error) {
    createLogger(c as Context, 'Dashboard').error(
      'Erro ao buscar score de compliance',
      toError(error),
    );
    return c.json({ success: false, error: 'Erro ao buscar score de compliance' }, 500);
  }
});

/**
 * GET /api/dashboard/demanda-treinamento
 * Retorna demanda futura estratificada
 */
app.get('/demanda-treinamento', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const demanda = await getDemandaTreinamento(c.env.DB, empresaId);
    return c.json({ success: true, data: demanda });
  } catch (error) {
    createLogger(c as Context, 'Dashboard').error(
      'Erro ao buscar demanda de treinamento',
      toError(error),
    );
    return c.json({ success: false, error: 'Erro ao buscar demanda de treinamento' }, 500);
  }
});

/**
 * GET /api/dashboard/atividades-recentes
 * Retorna últimas atividades do sistema
 */
app.get('/atividades-recentes', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const atividades = await getAtividadesRecentes(c.env.DB, empresaId);
    return c.json({ success: true, data: atividades });
  } catch (error) {
    createLogger(c as Context, 'Dashboard').error(
      'Erro ao buscar atividades recentes',
      toError(error),
    );
    return c.json({ success: false, error: 'Erro ao buscar atividades recentes' }, 500);
  }
});

/**
 * GET /api/dashboard/taxa-conclusao-mensal
 * Retorna taxa de conclusão dos últimos 6 meses
 */
app.get('/taxa-conclusao-mensal', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const taxas = await getTaxaConclusaoMensal(c.env.DB, empresaId);
    return c.json({ success: true, data: taxas });
  } catch (error) {
    createLogger(c as Context, 'Dashboard').error(
      'Erro ao buscar taxa de conclusão mensal',
      toError(error),
    );
    return c.json({ success: false, error: 'Erro ao buscar taxa de conclusão mensal' }, 500);
  }
});

/**
 * GET /api/dashboard/utilizacao-simuladores
 * Retorna utilização de simuladores
 */
app.get('/utilizacao-simuladores', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const utilizacao = await getUtilizacaoSimuladores(c.env.DB, empresaId);
    return c.json({ success: true, data: utilizacao });
  } catch (error) {
    createLogger(c as Context, 'Dashboard').error(
      'Erro ao buscar utilização de simuladores',
      toError(error),
    );
    return c.json({ success: false, error: 'Erro ao buscar utilização de simuladores' }, 500);
  }
});

/**
 * GET /api/dashboard/system-health
 * Retorna saúde do sistema
 */
app.get('/system-health', async (c) => {
  try {
    const health = await getSystemHealth(c.env.DB);
    return c.json({ success: true, data: health });
  } catch (error) {
    createLogger(c as Context, 'Dashboard').error(
      'Erro ao verificar saúde do sistema',
      toError(error),
    );
    return c.json({ success: false, error: 'Erro ao verificar saúde do sistema' }, 500);
  }
});

export default app;
