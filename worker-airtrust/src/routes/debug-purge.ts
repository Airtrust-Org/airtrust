/**
 * ROTA TEMPORÁRIA: PURGE DE QUALIFICAÇÕES SOFT-DELETED
 * Remove permanentemente registros com deleted_at IS NOT NULL
 * ⚠️ USAR APENAS EM DEV/DEBUG
 */

import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

app.post('/purge-qualificacoes', async (c) => {
  // Bloqueado em produção — usar apenas em dev/staging
  const env = (c.env as Env & { ENVIRONMENT?: string }).ENVIRONMENT ?? 'production';
  if (env === 'production') {
    return c.json({ success: false, error: 'Rota indisponível em produção' }, 403);
  }
  const db = c.env.DB;

  try {
    console.log('[PURGE] Iniciando hard delete de qualificacoes_historico soft-deleted...');

    // Step 1: Contar registros ANTES
    const countBefore = await db
      .prepare(
        `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos,
          SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deletados
        FROM qualificacoes_historico
      `,
      )
      .first<{ total: number; ativos: number; deletados: number }>();

    console.log('[PURGE] Estado ANTES:', countBefore);

    // Step 2: Limpar renovacao_de que apontam para deletados (ATIVOS)
    await db
      .prepare(
        `
        UPDATE qualificacoes_historico 
        SET renovacao_de = NULL 
        WHERE renovacao_de IN (
          SELECT id FROM qualificacoes_historico WHERE deleted_at IS NOT NULL
        )
        AND deleted_at IS NULL
      `,
      )
      .run();

    console.log('[PURGE] renovacao_de órfãos limpos (registros ativos)');

    // Step 3: Limpar renovacao_de DOS PRÓPRIOS DELETADOS também
    await db
      .prepare(
        `
        UPDATE qualificacoes_historico 
        SET renovacao_de = NULL 
        WHERE deleted_at IS NOT NULL
      `,
      )
      .run();

    console.log('[PURGE] renovacao_de limpos nos registros deletados');

    // Step 3.5: Limpar notificacoes_log que referenciam deletados
    await db
      .prepare(
        `
        DELETE FROM notificacoes_log 
        WHERE qualificacao_historico_id IN (
          SELECT id FROM qualificacoes_historico WHERE deleted_at IS NOT NULL
        )
      `,
      )
      .run();

    console.log('[PURGE] notificacoes_log órfãos deletados');

    // Step 4: Tentar deletar UM registro primeiro (teste)
    console.log('[PURGE] Tentando deletar 1 registro como teste...');
    try {
      await db
        .prepare('DELETE FROM qualificacoes_historico WHERE deleted_at IS NOT NULL LIMIT 1')
        .run();
      console.log('[PURGE] ✅ Delete de 1 registro OK');
    } catch (testError) {
      console.error('[PURGE] ❌ Erro no teste de delete:', testError);
      throw new Error(
        `FK constraint ainda ativa: ${testError instanceof Error ? testError.message : 'unknown'}`,
      );
    }

    // Step 5: HARD DELETE COMPLETO (agora sem FKs bloqueando)
    console.log('[PURGE] Executando HARD DELETE completo...');
    const deleteResult = await db
      .prepare('DELETE FROM qualificacoes_historico WHERE deleted_at IS NOT NULL')
      .run();

    console.log('[PURGE] Hard delete executado:', deleteResult); // Step 4: Contar registros DEPOIS
    const countAfter = await db
      .prepare(
        `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos,
          SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deletados
        FROM qualificacoes_historico
      `,
      )
      .first<{ total: number; ativos: number; deletados: number }>();

    console.log('[PURGE] Estado DEPOIS:', countAfter);

    // VACUUM não pode ser executado dentro de transação implícita do Worker
    // Executar manualmente depois: wrangler d1 execute airtrust-db --env production --remote --command="VACUUM"

    return c.json({
      success: true,
      message: 'Purge completo com sucesso! Execute VACUUM manualmente para recuperar espaço.',
      before: countBefore,
      after: countAfter,
      removed: countBefore?.deletados || 0,
      vacuum_command:
        'wrangler d1 execute airtrust-db --env production --remote --command="VACUUM"',
    });
  } catch (error) {
    console.error('[PURGE] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
      },
      500,
    );
  }
});

export default app;
