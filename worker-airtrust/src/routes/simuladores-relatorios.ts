/**
 * SIMULADORES — Relatórios
 * Routes: GET /uso, GET /tripulantes, GET /desempenho
 * (mounted under /relatorios prefix in simuladores-core.ts)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth, optionalAuth } from '../middleware/auth';
import { createLogger, toError } from '../utils/logger';

const app = new Hono<{ Bindings: Env }>();
function reportsErrorResponse(c: any, error: string, code: string) {
  return c.json({ success: false, error, code }, 500);
}

app.use('*', async (c, next) => {
  if (c.req.method === 'GET') {
    return optionalAuth()(c, next);
  }
  return auth()(c, next);
});

app.get('/uso', async (c) => {
  const logger = createLogger(c, 'SimuladoresRelatorios.uso');
  try {
    const di = c.req.query('data_inicio') || null;
    const df = c.req.query('data_fim') || null;
    const diSql = di || '2000-01-01';
    const dfSql = df || '2099-12-31';

    // 1. Uso por simulador
    const porSimulador = await c.env.DB.prepare(
      `SELECT
        s.id as simulador_id,
        s.nome as codigo,
        s.tipo as tipo_aeronave,
        COALESCE(SUM(sa.duracao_minutos), 0) / 60.0 as horas,
        COUNT(sa.id) as total_sessoes
      FROM simuladores s
      LEFT JOIN simulador_agendamentos sa ON s.id = sa.simulador_id
        AND sa.deleted_at IS NULL
        AND sa.data BETWEEN ? AND ?
      WHERE s.deleted_at IS NULL
      GROUP BY s.id, s.nome, s.tipo
      ORDER BY horas DESC`,
    )
      .bind(diSql, dfSql)
      .all();

    // 2. Uso por tipo de sessão
    const porTipoSessao = await c.env.DB.prepare(
      `SELECT
        COALESCE(sa.tipo_sessao, 'SEM_TIPO') as tipo_sessao,
        COUNT(sa.id) as sessoes,
        COALESCE(SUM(sa.duracao_minutos), 0) / 60.0 as horas
      FROM simulador_agendamentos sa
      WHERE sa.deleted_at IS NULL
        AND sa.data BETWEEN ? AND ?
      GROUP BY sa.tipo_sessao
      ORDER BY sessoes DESC`,
    )
      .bind(diSql, dfSql)
      .all();

    // 3. Uso por status
    const porStatus = await c.env.DB.prepare(
      `SELECT
        COALESCE(sa.status, 'SEM_STATUS') as status,
        COUNT(sa.id) as sessoes
      FROM simulador_agendamentos sa
      WHERE sa.deleted_at IS NULL
        AND sa.data BETWEEN ? AND ?
      GROUP BY sa.status
      ORDER BY sessoes DESC`,
    )
      .bind(diSql, dfSql)
      .all();

    // 4. Total de horas
    const totalResult = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(duracao_minutos), 0) / 60.0 as total_horas
      FROM simulador_agendamentos
      WHERE deleted_at IS NULL
        AND data BETWEEN ? AND ?`,
    )
      .bind(diSql, dfSql)
      .first<{ total_horas: number }>();

    return c.json({
      success: true,
      data: {
        periodo: { data_inicio: di, data_fim: df },
        total_horas: totalResult?.total_horas ?? 0,
        por_simulador: porSimulador.results || [],
        por_tipo_sessao: porTipoSessao.results || [],
        por_status: porStatus.results || [],
      },
    });
  } catch (e: unknown) {
    logger.error('Erro ao gerar relatório de uso', toError(e));
    return reportsErrorResponse(
      c,
      e instanceof Error ? e.message : 'Erro ao gerar relatório de uso',
      'SIMULADORES_REPORT_USAGE_ERROR',
    );
  }
});

app.get('/tripulantes', async (c) => {
  const logger = createLogger(c, 'SimuladoresRelatorios.tripulantes');
  try {
    const lim = parseInt(c.req.query('limit') || '50');
    const di = c.req.query('data_inicio') || '2000-01-01';
    const df = c.req.query('data_fim') || '2099-12-31';
    const r = await c.env.DB.prepare(
      `SELECT
        f.id as funcionario_id,
        f.nome,
        f.matricula,
        COALESCE(f.funcao, '') as funcao,
        COUNT(DISTINCT fs.id) as sessoes_totais,
        COALESCE(SUM(fs.carga_horaria_total), 0) as horas,
        SUM(CASE WHEN fs.aprovado = 1 THEN 1 ELSE 0 END) as aprovados,
        SUM(CASE WHEN fs.aprovado = 0 AND fs.resultado_final != 'PENDENTE' THEN 1 ELSE 0 END) as reprovados,
        SUM(CASE WHEN fs.resultado_final = 'FALTA' THEN 1 ELSE 0 END) as faltas
      FROM funcionarios f
      INNER JOIN fichas_sessao fs ON f.id = fs.colaborador_id_aluno
      LEFT JOIN simulador_agendamentos sa ON fs.agendamento_slot_id = sa.id
      WHERE fs.deleted_at IS NULL
        AND (sa.data BETWEEN ? AND ? OR sa.data IS NULL)
      GROUP BY f.id, f.nome, f.matricula, f.funcao
      HAVING sessoes_totais > 0
      ORDER BY horas DESC
      LIMIT ?`,
    )
      .bind(di, df, lim)
      .all();
    return c.json({ success: true, data: r.results || [] });
  } catch (e: unknown) {
    logger.error('Erro ao gerar relatório de tripulantes', toError(e));
    return reportsErrorResponse(
      c,
      e instanceof Error ? e.message : 'Erro ao gerar relatório de tripulantes',
      'SIMULADORES_REPORT_CREW_ERROR',
    );
  }
});

app.get('/desempenho', async (c) => {
  const logger = createLogger(c, 'SimuladoresRelatorios.desempenho');
  try {
    const di = c.req.query('data_inicio') || '2000-01-01';
    const df = c.req.query('data_fim') || '2099-12-31';
    const r = await c.env.DB.prepare(
      `SELECT
        COALESCE(fs.tipo_sessao, sa.tipo_sessao, 'SEM_TIPO') as tipo_sessao,
        COUNT(*) as sessoes,
        SUM(CASE WHEN fs.aprovado = 1 THEN 1 ELSE 0 END) as aprovados,
        SUM(CASE WHEN fs.aprovado = 0 AND fs.resultado_final != 'PENDENTE' THEN 1 ELSE 0 END) as reprovados,
        ROUND(
          CASE WHEN COUNT(*) > 0
            THEN SUM(CASE WHEN fs.aprovado = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)
            ELSE 0
          END, 2
        ) as aprovacao_percent
      FROM fichas_sessao fs
      LEFT JOIN simulador_agendamentos sa ON fs.agendamento_slot_id = sa.id
      WHERE fs.deleted_at IS NULL
        AND (sa.data BETWEEN ? AND ? OR sa.data IS NULL)
      GROUP BY COALESCE(fs.tipo_sessao, sa.tipo_sessao, 'SEM_TIPO')
      ORDER BY sessoes DESC`,
    )
      .bind(di, df)
      .all();
    return c.json({ success: true, data: r.results || [] });
  } catch (e: unknown) {
    logger.error('Erro ao gerar relatório de desempenho', toError(e));
    return reportsErrorResponse(
      c,
      e instanceof Error ? e.message : 'Erro ao gerar relatório de desempenho',
      'SIMULADORES_REPORT_PERFORMANCE_ERROR',
    );
  }
});

export default app;
