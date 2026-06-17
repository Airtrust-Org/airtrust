/**
 * QUALIFICACOES ALERTAS ROUTES - Sistema de Alertas de Qualificações
 *
 * Endpoints para alertas e estatísticas de qualificações expirando:
 * - GET /api/qualificacoes/alertas - Lista qualificações expirando/vencidas
 * - GET /api/qualificacoes/alertas/resumo - Estatísticas resumidas para dashboard
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import {
  calcularDiasAteVencimento,
  determinarStatus,
  determinarUrgencia,
  agruparPorStatus,
} from '../utils/qualificacoes-expiration';
import { jsonError } from '../middleware/response';
import { AppError } from '../utils/errors';
import { getEmpresaId } from '../middleware/tenant';
import {
  appendEmployeeSectorFilter,
  getEmployeeSectorAccess,
} from '../services/employee-sector-access';
import {
  getQualificacoesAlertaDias,
  getTodayIsoSaoPaulo,
  getQualificacoesVencimentoExpr,
  normalizeQualificacoesAlertaDias,
} from '../utils/qualificacoes-alerta-config';

const app = new Hono<{ Bindings: Env }>();

// Safe wrapper para handlers
/* eslint-disable @typescript-eslint/no-explicit-any */
function safe(fn: (c: any) => Promise<any> | any) {
  return async (c: any) => {
    try {
      return await fn(c);
    } catch (e) {
      const err = e as AppError;
      if (err instanceof AppError) {
        return jsonError(c, err.message, err.status || 400, err.code);
      }
      console.error('[ALERTAS] Erro:', (e as Error).stack || e);
      return jsonError(c, 'Erro interno inesperado', 500, 'INTERNAL_ERROR');
    }
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// =============================================
// GET /api/qualificacoes/alertas
// Lista qualificações expirando/vencidas
// =============================================
app.get(
  '/',
  auth(),
  safe(async (c) => {
    const {
      urgencia,
      limit = '100',
      funcionario_cpf,
      dias: diasQuery,
      apenasRequisitosMatriz,
    } = c.req.query();
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const scopeConditions: string[] = [];
    const scopeBindings: unknown[] = [];
    appendEmployeeSectorFilter(scopeConditions, scopeBindings, access, 'f');

    const filtrarPorMatriz =
      String(apenasRequisitosMatriz || '')
        .trim()
        .toLowerCase() === 'true';
    const diasConfigurados = await getQualificacoesAlertaDias(c.env.DB, empresaId);
    const diasJanela = diasQuery ? normalizeQualificacoesAlertaDias(diasQuery) : diasConfigurados;
    const hojeSp = getTodayIsoSaoPaulo();
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');

    let query = `
      SELECT 
        qh.id,
        qh.funcionario_cpf,
        f.nome as funcionario_nome,
        f.matricula as funcionario_matricula,
        f.email as funcionario_email,
        qh.qualificacao_codigo,
        qt.nome as qualificacao_nome,
        qt.categoria,
        qh.data_conclusao,
        qh.origem_tipo,
        ${vencimentoExpr} as data_vencimento
      FROM qualificacoes_historico qh
      INNER JOIN funcionarios f ON qh.funcionario_cpf = f.cpf
      INNER JOIN qualificacoes_tipos qt ON qh.qualificacao_codigo = qt.codigo
      WHERE qh.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?
        AND ${scopeConditions.join(' AND ')}
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND qt.deleted_at IS NULL
        AND ${vencimentoExpr} IS NOT NULL
        AND date(${vencimentoExpr}) <= date(?, '+' || ? || ' days')
        AND (
          ? = 0
          OR EXISTS (
            SELECT 1
            FROM matriz_treinamento_funcao mtf
            WHERE mtf.empresa_id = f.empresa_id
              AND mtf.funcao_id = f.funcao_id
              AND mtf.qualificacao_tipo_id = qt.id
              AND mtf.ativo = 1
              AND mtf.deleted_at IS NULL
          )
        )
        AND qh.id IN (
          SELECT MAX(id)
          FROM qualificacoes_historico
          WHERE deleted_at IS NULL
          GROUP BY funcionario_cpf, qualificacao_codigo
        )
    `;

    const params: unknown[] = [empresaId, ...scopeBindings, hojeSp, diasJanela, filtrarPorMatriz ? 1 : 0];

    if (funcionario_cpf) {
      query += ` AND qh.funcionario_cpf = ?`;
      params.push(funcionario_cpf);
    }

    query += ` ORDER BY qh.data_vencimento ASC`;
    query += ` LIMIT ?`;
    params.push(parseInt(limit, 10));

    const { results } = await c.env.DB.prepare(query)
      .bind(...params)
      .all();

    /* eslint-disable @typescript-eslint/no-explicit-any */
    // Enriquecer e filtrar
    const alertas = (results || [])
      .map((row: any) => {
        const diasAteVencimento = calcularDiasAteVencimento(row.data_vencimento);
        const status = determinarStatus(row.data_vencimento, diasJanela, hojeSp);
        const urgenciaCalc = determinarUrgencia(diasAteVencimento);

        return {
          ...row,
          dias_ate_vencimento: diasAteVencimento,
          status: status,
          urgencia: urgenciaCalc,
        };
      })
      .filter((alerta: any) => {
        // Filtro de urgência
        if (urgencia && alerta.urgencia !== urgencia) {
          return false;
        }

        return true;
      });

    // Agrupar por status
    const agrupado = agruparPorStatus(alertas);

    // Contar por urgência
    const contagemUrgencia = alertas.reduce(
      (acc: any, alerta: any) => {
        acc[alerta.urgencia] = (acc[alerta.urgencia] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return c.json({
      success: true,
      data: alertas,
      meta: {
        total: alertas.length,
        dias_janela: diasJanela,
        apenas_requisitos_matriz: filtrarPorMatriz,
        por_status: {
          vigente: agrupado.vigentes?.length || 0,
          expirando: agrupado.expirando?.length || 0,
          vencida: agrupado.vencidas?.length || 0,
        },
        por_urgencia: contagemUrgencia,
      },
    });
  }),
);

// =============================================
// GET /api/qualificacoes/alertas/resumo
// Resumo de alertas (dashboard)
// =============================================
app.get(
  '/resumo',
  auth(),
  safe(async (c) => {
    const { apenasRequisitosMatriz } = c.req.query();
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const scopeConditions: string[] = [];
    const scopeBindings: unknown[] = [];
    appendEmployeeSectorFilter(scopeConditions, scopeBindings, access, 'f');

    const filtrarPorMatriz =
      String(apenasRequisitosMatriz || '')
        .trim()
        .toLowerCase() === 'true';
    const diasJanela = await getQualificacoesAlertaDias(c.env.DB, empresaId);
    const hojeSp = getTodayIsoSaoPaulo();
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');
    // Buscar todas qualificações ativas (mais recentes de cada tipo)
    const { results } = await c.env.DB.prepare(
      `
      SELECT 
        ${vencimentoExpr} as data_vencimento,
        qt.categoria
      FROM qualificacoes_historico qh
      INNER JOIN funcionarios f ON qh.funcionario_cpf = f.cpf
      INNER JOIN qualificacoes_tipos qt ON qh.qualificacao_codigo = qt.codigo
      WHERE qh.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?
        AND ${scopeConditions.join(' AND ')}
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND qt.deleted_at IS NULL
        AND (
          ? = 0
          OR EXISTS (
            SELECT 1
            FROM matriz_treinamento_funcao mtf
            WHERE mtf.empresa_id = f.empresa_id
              AND mtf.funcao_id = f.funcao_id
              AND mtf.qualificacao_tipo_id = qt.id
              AND mtf.ativo = 1
              AND mtf.deleted_at IS NULL
          )
        )
        AND (qh.data_vencimento IS NOT NULL OR qh.data_conclusao IS NOT NULL)
        AND qh.id IN (
          SELECT MAX(id)
          FROM qualificacoes_historico
          WHERE deleted_at IS NULL
          GROUP BY funcionario_cpf, qualificacao_codigo
        )
    `,
    )
      .bind(empresaId, ...scopeBindings, filtrarPorMatriz ? 1 : 0)
      .all();

    // Calcular estatísticas
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const stats: Record<string, any> = {
      total: (results || []).length,
      vigente: 0,
      expirando: 0,
      vencida: 0,
      urgencia: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };

    (results || []).forEach((row: any) => {
      const dias = calcularDiasAteVencimento(row.data_vencimento);
      const status = determinarStatus(row.data_vencimento, diasJanela, hojeSp);
      const urgenciaCalc = determinarUrgencia(dias);

      if (stats[status] !== undefined) {
        stats[status]++;
      }

      if (urgenciaCalc && stats.urgencia[urgenciaCalc] !== undefined) {
        stats.urgencia[urgenciaCalc]++;
      }
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return c.json({
      success: true,
      data: {
        ...stats,
        dias_janela: diasJanela,
        apenas_requisitos_matriz: filtrarPorMatriz,
      },
    });
  }),
);

export default app;
