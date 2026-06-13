/**
 * ========================================
 * ENDPOINT: FIX RENOVADAS PÓS-IMPORTAÇÃO
 * POST /api/qualificacoes-historico/fix-renovadas
 * ========================================
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { AppError } from '../utils/errors';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { createLogger, toError } from '../utils/logger';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth(), requireRole('admin'));

const PLANNED_STATUSES = ['PLANEJADA', 'PLANEJADO'];
const CANCELLED_STATUSES = ['CANCELADA', 'CANCELADO'];

function isEligibleForRenovada(status: unknown): boolean {
  const upper = String(status || '').trim().toUpperCase();
  if (PLANNED_STATUSES.includes(upper)) return false;
  if (CANCELLED_STATUSES.includes(upper)) return false;
  return true;
}

interface GrupoRow {
  funcionario_id: number;
  qualificacao_codigo: string;
  total: number;
}

interface HistoricoRow {
  id: number;
  data_conclusao: string | null;
  status: string | null;
  renovada: number | null;
  funcionario_nome: string | null;
  setor_nome: string | null;
  data_vencimento: string | null;
}

interface PreviewItem {
  funcionario_id: number;
  funcionario_nome: string | null;
  setor: string | null;
  qualificacao_codigo: string;
  id_antigo: number;
  status_atual: string | null;
  data_conclusao_antiga: string | null;
  data_vencimento_antiga: string | null;
  id_mais_recente: number;
  status_mais_recente: string | null;
  data_conclusao_nova: string | null;
  data_vencimento_nova: string | null;
  novo_status_proposto: 'RENOVADA';
}

async function findRenovadaCandidates(
  db: D1Database,
  empresaId: number,
  setorId: number | null,
): Promise<PreviewItem[]> {
  const setorClause = setorId
    ? 'AND f.setor_id = ?'
    : '';
  const setorBinding = setorId ? [setorId] : [];

  const { results: grupos } = await db
    .prepare(
      `SELECT
          qh.funcionario_id,
          qh.qualificacao_codigo,
          COUNT(*) as total
        FROM qualificacoes_historico qh
        INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
        WHERE qh.deleted_at IS NULL
          AND qh.empresa_id = ?
          ${setorClause}
          AND UPPER(COALESCE(qh.status, '')) NOT IN ('PLANEJADA','PLANEJADO','CANCELADA','CANCELADO')
        GROUP BY qh.funcionario_id, qh.qualificacao_codigo
        HAVING COUNT(*) > 1`,
    )
    .bind(empresaId, ...setorBinding)
    .all<GrupoRow>();

  const items: PreviewItem[] = [];

  for (const grupo of grupos ?? []) {
    const { results: registros } = await db
      .prepare(
        `SELECT
            qh.id,
            qh.data_conclusao,
            qh.status,
            qh.renovada,
            qh.data_vencimento,
            f.nome AS funcionario_nome,
            s.nome AS setor_nome
          FROM qualificacoes_historico qh
          INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
          LEFT JOIN setores s ON s.id = f.setor_id AND s.deleted_at IS NULL
          WHERE qh.funcionario_id = ?
            AND qh.qualificacao_codigo = ?
            AND qh.empresa_id = ?
            AND qh.deleted_at IS NULL
            AND UPPER(COALESCE(qh.status, '')) NOT IN ('PLANEJADA','PLANEJADO','CANCELADA','CANCELADO')
          ORDER BY date(COALESCE(qh.data_conclusao, '1900-01-01')) ASC, qh.id ASC`,
      )
      .bind(grupo.funcionario_id, grupo.qualificacao_codigo, empresaId)
      .all<HistoricoRow>();

    const rows = registros ?? [];
    if (rows.length <= 1) continue;

    const maisRecente = rows[rows.length - 1];

    for (let i = 0; i < rows.length - 1; i++) {
      const antigo = rows[i];
      if (Number(antigo.renovada) === 1 || String(antigo.status || '').toUpperCase() === 'RENOVADA') {
        continue; // already renovada
      }
      if (!isEligibleForRenovada(antigo.status)) continue;

      items.push({
        funcionario_id: grupo.funcionario_id,
        funcionario_nome: antigo.funcionario_nome,
        setor: antigo.setor_nome,
        qualificacao_codigo: grupo.qualificacao_codigo,
        id_antigo: antigo.id,
        status_atual: antigo.status,
        data_conclusao_antiga: antigo.data_conclusao,
        data_vencimento_antiga: antigo.data_vencimento,
        id_mais_recente: maisRecente.id,
        status_mais_recente: maisRecente.status,
        data_conclusao_nova: maisRecente.data_conclusao,
        data_vencimento_nova: maisRecente.data_vencimento,
        novo_status_proposto: 'RENOVADA',
      });
    }
  }

  return items;
}

/**
 * GET /fix-renovadas/preview
 * Preview somente-leitura: lista candidatos a RENOVADA sem aplicar mudanças
 */
app.get('/preview', async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = Number((c.get('empresaId' as never) as unknown) || 0);
    if (!Number.isFinite(empresaId) || empresaId <= 0) {
      throw new AppError('Empresa não identificada no contexto', 401, 'TENANT_REQUIRED');
    }
    const setorIdRaw = c.req.query('setor_id');
    const setorId = setorIdRaw ? Number(setorIdRaw) : null;

    const items = await findRenovadaCandidates(db, empresaId, Number.isFinite(setorId) && setorId! > 0 ? setorId : null);

    return c.json({
      success: true,
      data: {
        total_candidatos: items.length,
        items,
        dry_run: true,
      },
    });
  } catch (error) {
    createLogger(c, 'FixRenovadas').error('Erro no preview de renovadas', toError(error));
    if (error instanceof AppError) {
      const status4xx = Math.floor(error.status / 100) === 4 ? (error.status as 400 | 401 | 403 | 404) : null;
      if (status4xx) return c.json({ success: false, error: error.message, code: error.code }, status4xx);
      return c.json({ success: false, error: 'Erro interno ao processar solicitação', code: error.code }, 500);
    }
    return c.json({ success: false, error: 'Erro ao gerar preview' }, 500);
  }
});

/**
 * POST /fix-renovadas
 * Identifica e marca automaticamente qualificações renovadas.
 * Body (opcional): { dry_run?: boolean, setor_id?: number }
 */
app.post('/', async (c) => {
  try {
    const db = c.env.DB;
    const logger = createLogger(c, 'FixRenovadas');
    const startTime = Date.now();
    const empresaId = Number((c.get('empresaId' as never) as unknown) || 0);

    if (!Number.isFinite(empresaId) || empresaId <= 0) {
      throw new AppError('Empresa não identificada no contexto', 401, 'TENANT_REQUIRED');
    }

    let body: { dry_run?: boolean; setor_id?: number } = {};
    try {
      body = await c.req.json();
    } catch {
      // body is optional — plain POST with no JSON is valid
    }
    const dryRun = body.dry_run === true;
    const setorId = typeof body.setor_id === 'number' && body.setor_id > 0 ? body.setor_id : null;

    logger.info('Iniciando fix-renovadas', { empresaId, dryRun, setorId });

    const candidates = await findRenovadaCandidates(db, empresaId, setorId);

    if (dryRun) {
      return c.json({
        success: true,
        message: `Dry-run: ${candidates.length} registro(s) seriam marcados como RENOVADA`,
        data: {
          empresa_id: empresaId,
          dry_run: true,
          total_candidatos: candidates.length,
          items: candidates,
        },
      });
    }

    // Apply updates
    let totalRenovadas = 0;
    let totalVinculadas = 0;

    for (const candidate of candidates) {
      // Mark older record as RENOVADA
      await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET renovada = 1,
                  status = 'RENOVADA',
                  updated_at = datetime('now')
            WHERE id = ?
              AND empresa_id = ?
              AND deleted_at IS NULL`,
        )
        .bind(candidate.id_antigo, empresaId)
        .run();
      totalRenovadas++;

      // Set renovacao_de on the newer record (only if the pair hasn't been linked yet)
      await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET renovacao_de = CASE WHEN renovacao_de IS NULL THEN ? ELSE renovacao_de END,
                  updated_at = datetime('now')
            WHERE id = ?
              AND empresa_id = ?
              AND deleted_at IS NULL`,
        )
        .bind(candidate.id_antigo, candidate.id_mais_recente, empresaId)
        .run();
      totalVinculadas++;
    }

    const executionTime = Date.now() - startTime;

    logger.info('fix-renovadas concluído', {
      empresaId,
      totalRenovadas,
      totalVinculadas,
      executionTimeMs: executionTime,
    });

    return c.json({
      success: true,
      message: `${totalRenovadas} registro(s) marcado(s) como RENOVADA com sucesso`,
      data: {
        empresa_id: empresaId,
        dry_run: false,
        total_renovadas: totalRenovadas,
        total_vinculadas: totalVinculadas,
        execution_time_ms: executionTime,
        items_aplicados: candidates,
      },
    });
  } catch (error) {
    createLogger(c, 'FixRenovadas').error('Erro ao corrigir renovadas', toError(error));

    if (error instanceof AppError) {
      const status4xx = Math.floor(error.status / 100) === 4 ? (error.status as 400 | 401 | 403 | 404) : null;
      if (status4xx) return c.json({ success: false, error: error.message, code: error.code }, status4xx);
      return c.json({ success: false, error: 'Erro interno ao processar solicitação', code: error.code }, 500);
    }

    return c.json({ success: false, error: 'Erro ao corrigir renovadas' }, 500);
  }
});

/**
 * GET /fix-renovadas/stats
 * Estatísticas de renovadas (usa funcionario_id, não cpf)
 */
app.get('/stats', async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = Number((c.get('empresaId' as never) as unknown) || 0);

    if (!Number.isFinite(empresaId) || empresaId <= 0) {
      throw new AppError('Empresa não identificada no contexto', 401, 'TENANT_REQUIRED');
    }

    const stats = await db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN UPPER(COALESCE(status,'')) = 'RENOVADA' OR COALESCE(renovada,0) = 1 THEN 1 ELSE 0 END) as renovadas,
          SUM(CASE WHEN renovacao_de IS NOT NULL THEN 1 ELSE 0 END) as vinculadas,
          COUNT(DISTINCT funcionario_id) as total_funcionarios,
          COUNT(DISTINCT CASE WHEN UPPER(COALESCE(status,'')) = 'RENOVADA' OR COALESCE(renovada,0) = 1 THEN funcionario_id END) as funcionarios_com_renovacao
        FROM qualificacoes_historico
        WHERE deleted_at IS NULL
          AND empresa_id = ?`,
      )
      .bind(empresaId)
      .first();

    return c.json({ success: true, data: stats });
  } catch (error) {
    createLogger(c, 'FixRenovadas').error('Erro ao buscar estatísticas de renovadas', toError(error));
    return c.json({ success: false, error: 'Erro ao buscar estatísticas' }, 500);
  }
});

export default app;
