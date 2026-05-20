/**
 * ========================================
 * ENDPOINT: DEDUPLICATE HISTÓRICO
 * POST /api/qualificacoes-historico/deduplicate
 * ========================================
 * Remove duplicatas mantendo o registro mais recente
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { AppError } from '../utils/errors';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /deduplicate
 * Remove duplicatas do histórico de qualificações
 * Mantém apenas o registro mais recente (por data_conclusao e ID)
 */
app.post('/', async (c) => {
  try {
    const db = c.env.DB;
    const startTime = Date.now();

    console.log('[DEDUPLICATE] Iniciando remoção de duplicatas...');

    // 1. Identificar duplicatas exatas (ANTES da remoção)
    const { results: duplicatasBefore } = await db
      .prepare(
        `
        SELECT 
          funcionario_cpf,
          qualificacao_codigo,
          data_vencimento,
          COUNT(*) as total
        FROM qualificacoes_historico
        WHERE deleted_at IS NULL
        GROUP BY funcionario_cpf, qualificacao_codigo, data_vencimento
        HAVING COUNT(*) > 1
      `,
      )
      .all();

    const totalDuplicatasBefore = duplicatasBefore?.length || 0;
    console.log(`[DEDUPLICATE] Encontradas ${totalDuplicatasBefore} duplicatas`);

    if (totalDuplicatasBefore === 0) {
      return c.json({
        success: true,
        message: 'Nenhuma duplicata encontrada',
        data: {
          duplicatas_removidas: 0,
          registros_mantidos: 0,
          execution_time_ms: Date.now() - startTime,
        },
      });
    }

    // 2. Para cada grupo duplicado, manter apenas o mais recente
    // D1 não suporta window functions, então faremos por grupo
    let totalRemovidos = 0;

    for (const grupo of duplicatasBefore || []) {
      const dup = grupo as Record<string, unknown>;

      // Buscar todos IDs deste grupo
      const { results: registros } = await db
        .prepare(
          `
          SELECT id, data_conclusao, created_at
          FROM qualificacoes_historico
          WHERE funcionario_cpf = ?
            AND qualificacao_codigo = ?
            AND data_vencimento = ?
            AND deleted_at IS NULL
          ORDER BY 
            data_conclusao DESC NULLS LAST,
            created_at DESC,
            id DESC
        `,
        )
        .bind(dup.funcionario_cpf, dup.qualificacao_codigo, dup.data_vencimento)
        .all();

      if (!registros || registros.length <= 1) continue;

      // Manter o primeiro (mais recente), deletar os demais
      const idsParaDeletar = registros.slice(1).map((r: Record<string, unknown>) => r.id as number);

      for (const id of idsParaDeletar) {
        await db
          .prepare(
            `
            UPDATE qualificacoes_historico
            SET 
              deleted_at = datetime('now'),
              updated_at = datetime('now')
            WHERE id = ?
          `,
          )
          .bind(id)
          .run();
        totalRemovidos++;
      }
    }

    // 3. Verificar duplicatas APÓS remoção
    const { results: duplicatasAfter } = await db
      .prepare(
        `
        SELECT 
          funcionario_cpf,
          qualificacao_codigo,
          data_vencimento,
          COUNT(*) as total
        FROM qualificacoes_historico
        WHERE deleted_at IS NULL
        GROUP BY funcionario_cpf, qualificacao_codigo, data_vencimento
        HAVING COUNT(*) > 1
      `,
      )
      .all();

    const totalDuplicatasAfter = duplicatasAfter?.length || 0;

    const executionTime = Date.now() - startTime;

    console.log('[DEDUPLICATE] Remoção concluída:', {
      duplicatas_antes: totalDuplicatasBefore,
      duplicatas_removidas: totalRemovidos,
      duplicatas_depois: totalDuplicatasAfter,
      execution_time_ms: executionTime,
    });

    return c.json({
      success: true,
      message: 'Duplicatas removidas com sucesso',
      data: {
        duplicatas_antes: totalDuplicatasBefore,
        duplicatas_removidas: totalRemovidos,
        duplicatas_restantes: totalDuplicatasAfter,
        registros_mantidos: totalDuplicatasBefore,
        execution_time_ms: executionTime,
      },
    });
  } catch (error) {
    console.error('[DEDUPLICATE] Erro:', error);

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
        error: 'Erro ao remover duplicatas',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

/**
 * GET /deduplicate/preview
 * Mostra duplicatas que seriam removidas (dry-run)
 */
app.get('/preview', async (c) => {
  try {
    const db = c.env.DB;

    // Buscar grupos duplicados - query simples sem window functions
    const { results: duplicatas } = await db
      .prepare(
        `
        SELECT 
          funcionario_cpf,
          qualificacao_codigo,
          data_vencimento,
          COUNT(*) as total
        FROM qualificacoes_historico
        WHERE deleted_at IS NULL
        GROUP BY funcionario_cpf, qualificacao_codigo, data_vencimento
        HAVING COUNT(*) > 1
        ORDER BY funcionario_cpf, qualificacao_codigo
      `,
      )
      .all();

    const totalGrupos = duplicatas?.length || 0;
    const totalARemover =
      duplicatas?.reduce(
        (sum, dup: Record<string, unknown>) => sum + ((dup.total as number) - 1),
        0,
      ) || 0;

    return c.json({
      success: true,
      data: {
        total_grupos_duplicados: totalGrupos,
        total_registros_a_remover: totalARemover,
        grupos: duplicatas?.slice(0, 10) || [],
      },
    });
  } catch (error) {
    console.error('[DEDUPLICATE] Erro ao buscar preview:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao buscar preview de duplicatas',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      500,
    );
  }
});

export default app;
