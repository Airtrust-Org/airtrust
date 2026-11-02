/**
 * SGSO — KPIs / SPIs + Tendências + Categorias ADREP
 * Routes extracted from sgso.ts:
 *   GET /kpi/spi
 *   GET /kpi/tendencias
 *   GET /categorias-adrep
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { getEmpresaId } from '../middleware/tenant';
import { createLogger, toError } from '../utils/logger';
import { loadSpiRawMetrics } from '../repositories/sgso/spi-repository';
import { buildSpiReport } from '../services/sgso/kpi-spi';

type AppCtx = Context<{ Bindings: Env; Variables: { userId?: string } }>;

const sgsoKpi = new Hono<{ Bindings: Env; Variables: { userId?: string } }>();

function now(): string {
  return new Date().toISOString();
}

function sgsoErrorResponse(
  c: AppCtx,
  error: unknown,
  message: string,
  code: string,
  status: number = 500,
) {
  const logger = createLogger(c as Record<string, any>, 'SgsoKpiRoutes');
  logger.error(message, toError(error), { route: c.req.path, status });
  return c.json({ success: false, error: message, code }, status as any);
}

// ─────────────────────────────────────────────────────────────
// KPIs / SPIs
// ─────────────────────────────────────────────────────────────

// GET /api/sgso/kpi/spi
sgsoKpi.get('/kpi/spi', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const raw = await loadSpiRawMetrics(c.env.DB, empresaId);
    return c.json({ success: true, data: buildSpiReport(raw) });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao calcular SPIs', 'SGSO_SPI_CALC_ERROR');
  }
});

// GET /api/sgso/kpi/tendencias
sgsoKpi.get('/kpi/tendencias', async (c) => {
  try {
    const empresaId = getEmpresaId(c as any);
    const db = c.env.DB;

    // Relatos por mês (últimos 12 meses)
    const relatosMes = await db
      .prepare(
        `SELECT strftime('%Y-%m', data_ocorrencia) AS mes, COUNT(*) AS total,
                SUM(CASE WHEN tipo = 'INCIDENTE' THEN 1 ELSE 0 END) AS incidentes,
                SUM(CASE WHEN tipo = 'ACIDENTE' THEN 1 ELSE 0 END) AS acidentes,
                SUM(CASE WHEN anonimo = 1 THEN 1 ELSE 0 END) AS anonimos
         FROM sgso_relatos
         WHERE empresa_id = ? AND deleted_at IS NULL
           AND date(data_ocorrencia) >= date('now', '-12 months')
         GROUP BY mes
         ORDER BY mes ASC`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    // NCs abertas por mês
    const ncsMes = await db
      .prepare(
        `SELECT strftime('%Y-%m', created_at) AS mes, COUNT(*) AS total,
                SUM(CASE WHEN tipo = 'MAJOR' THEN 1 ELSE 0 END) AS major,
                SUM(CASE WHEN tipo = 'MINOR' THEN 1 ELSE 0 END) AS minor
         FROM sgso_nao_conformidades
         WHERE empresa_id = ? AND deleted_at IS NULL
           AND date(created_at) >= date('now', '-12 months')
         GROUP BY mes
         ORDER BY mes ASC`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    // Top 5 aeronaves com mais relatos
    const topAeronaves = await db
      .prepare(
        `SELECT aeronave_matricula, aeronave_modelo, COUNT(*) AS total
         FROM sgso_relatos
         WHERE empresa_id = ? AND deleted_at IS NULL AND aeronave_matricula IS NOT NULL
         GROUP BY aeronave_matricula
         ORDER BY total DESC
         LIMIT 5`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    // Distribuição por categoria ADREP
    const categorias = await db
      .prepare(
        `SELECT categoria_adrep, COUNT(*) AS total
         FROM sgso_relatos
         WHERE empresa_id = ? AND deleted_at IS NULL AND categoria_adrep IS NOT NULL
         GROUP BY categoria_adrep
         ORDER BY total DESC
         LIMIT 10`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    // Densidade da matriz de risco (para heatmap)
    const matrizDensidade = await db
      .prepare(
        `SELECT probabilidade, severidade, COUNT(*) AS total
         FROM sgso_avaliacao_risco
         WHERE empresa_id = ? AND deleted_at IS NULL AND tipo_avaliacao = 'INICIAL'
         GROUP BY probabilidade, severidade`,
      )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    return c.json({
      success: true,
      data: {
        relatos_por_mes: relatosMes.results,
        ncs_por_mes: ncsMes.results,
        top_aeronaves: topAeronaves.results,
        categorias_adrep: categorias.results,
        matriz_densidade: matrizDensidade.results,
      },
    });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao calcular tendências', 'SGSO_TREND_CALC_ERROR');
  }
});

// ─────────────────────────────────────────────────────────────
// CATEGORIAS ADREP
// ─────────────────────────────────────────────────────────────

// GET /api/sgso/categorias-adrep
sgsoKpi.get('/categorias-adrep', async (c) => {
  try {
    const db = c.env.DB;
    const rows = await db
      .prepare(
        'SELECT id, codigo, nome_pt, nome_en FROM sgso_categorias_adrep WHERE ativo = 1 ORDER BY nome_pt ASC',
      )
      .all<{ id: number; codigo: string; nome_pt: string; nome_en: string }>();
    return c.json({ success: true, data: rows.results });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao buscar categorias', 'SGSO_CATEGORIAS_GET_ERROR');
  }
});

export default sgsoKpi;
