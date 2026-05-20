/**
 * ========================================
 * ENDPOINT: FIX RENOVADAS PÓS-IMPORTAÇÃO
 * POST /api/qualificacoes-historico/fix-renovadas
 * ========================================
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { AppError } from '../utils/errors';
import { auth, requireRole } from '../middleware/auth';
import { createLogger, toError } from '../utils/logger';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth(), requireRole('admin'));

/**
 * POST /fix-renovadas
 * Identifica e marca automaticamente qualificações renovadas
 * Apenas ADMIN pode executar
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

    logger.info('Iniciando correção automática de renovadas', { empresaId });

    // Buscar todos os grupos de qualificações (por funcionário + código)
    const { results: grupos } = await db
      .prepare(
        `
        SELECT 
          funcionario_cpf,
          qualificacao_codigo,
          COUNT(*) as total
        FROM qualificacoes_historico
        WHERE deleted_at IS NULL
          AND empresa_id = ?
        GROUP BY funcionario_cpf, qualificacao_codigo
        HAVING COUNT(*) > 1
      `,
      )
      .bind(empresaId)
      .all();

    logger.info('Grupos encontrados para processamento', {
      empresaId,
      totalGrupos: grupos?.length || 0,
    });

    let totalVinculadas = 0;
    let totalRenovadas = 0;

    // Processar cada grupo individualmente
    for (const grupo of grupos || []) {
      const g = grupo as Record<string, unknown>;

      // Buscar registros ordenados do grupo
      const { results: registros } = await db
        .prepare(
          `
          SELECT id, data_conclusao, status
          FROM qualificacoes_historico
          WHERE funcionario_cpf = ?
            AND qualificacao_codigo = ?
            AND empresa_id = ?
            AND deleted_at IS NULL
          ORDER BY data_conclusao ASC
        `,
        )
        .bind(g.funcionario_cpf, g.qualificacao_codigo, empresaId)
        .all();

      if (!registros || registros.length <= 1) continue;

      // Para cada registro (exceto o primeiro), vincular ao anterior
      for (let i = 1; i < registros.length; i++) {
        const atual = registros[i] as Record<string, unknown>;
        const anterior = registros[i - 1] as Record<string, unknown>;

        // Atualizar renovacao_de no registro atual
        await db
          .prepare(
            `
            UPDATE qualificacoes_historico
            SET renovacao_de = ?, updated_at = datetime('now')
            WHERE id = ?
          `,
          )
          .bind(anterior.id, atual.id)
          .run();
        totalVinculadas++;

        // Marcar registro anterior como 'renovada' se ainda não estiver
        if (anterior.status !== 'renovada') {
          await db
            .prepare(
              `
              UPDATE qualificacoes_historico
              SET status = 'renovada', updated_at = datetime('now')
              WHERE id = ?
            `,
            )
            .bind(anterior.id)
            .run();
          totalRenovadas++;
        }
      }
    }

    const executionTime = Date.now() - startTime;

    logger.info('Correção de renovadas concluída', {
      empresaId,
      totalGruposProcessados: grupos?.length || 0,
      totalRenovadas,
      totalVinculadas,
      executionTimeMs: executionTime,
    });

    return c.json({
      success: true,
      message: 'Renovadas corrigidas com sucesso',
      data: {
        empresa_id: empresaId,
        total_grupos_processados: grupos?.length || 0,
        total_renovadas: totalRenovadas,
        total_vinculadas: totalVinculadas,
        execution_time_ms: executionTime,
      },
    });
  } catch (error) {
    createLogger(c, 'FixRenovadas').error('Erro ao corrigir renovadas', toError(error));

    if (error instanceof AppError) {
      return c.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },
        error.status as 400 | 403 | 404 | 500,
      );
    }

    return c.json(
      {
        success: false,
        error: 'Erro ao corrigir renovadas',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

/**
 * GET /fix-renovadas/stats
 * Retorna estatísticas de renovadas
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
        `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'renovada' THEN 1 ELSE 0 END) as renovadas,
        SUM(CASE WHEN renovacao_de IS NOT NULL THEN 1 ELSE 0 END) as vinculadas,
        COUNT(DISTINCT funcionario_cpf) as total_funcionarios,
        COUNT(DISTINCT CASE WHEN status = 'renovada' THEN funcionario_cpf END) as funcionarios_com_renovacao
      FROM qualificacoes_historico
      WHERE deleted_at IS NULL
        AND empresa_id = ?
    `,
      )
      .bind(empresaId)
      .first();

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    createLogger(c, 'FixRenovadas').error(
      'Erro ao buscar estatísticas de renovadas',
      toError(error),
    );
    return c.json(
      {
        success: false,
        error: 'Erro ao buscar estatísticas',
      },
      500,
    );
  }
});

export default app;
