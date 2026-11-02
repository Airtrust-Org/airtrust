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
import { listCategoriasAdrepAtivas, loadSgsoTrends } from '../repositories/sgso/trends-repository';

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
    const trends = await loadSgsoTrends(c.env.DB, empresaId);
    return c.json({
      success: true,
      data: {
        relatos_por_mes: trends.relatosPorMes,
        ncs_por_mes: trends.ncsPorMes,
        top_aeronaves: trends.topAeronaves,
        categorias_adrep: trends.categoriasAdrep,
        matriz_densidade: trends.matrizDensidade,
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
    return c.json({ success: true, data: await listCategoriasAdrepAtivas(c.env.DB) });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao buscar categorias', 'SGSO_CATEGORIAS_GET_ERROR');
  }
});

export default sgsoKpi;
