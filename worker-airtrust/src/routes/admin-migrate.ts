/**
 * ADMIN MIGRATE ROUTE - Endpoint temporário para aplicar migrations
 * ⚠️ USAR APENAS EM EMERGÊNCIAS - Remover após uso
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/admin/migrate/0118
 * Aplica migration 0118: adiciona coluna modelo_aeronave_id
 * RBAC: apenas admin
 */
app.post('/0118', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;

  try {
    // 1. Adicionar nova coluna
    await db.prepare('ALTER TABLE funcionarios ADD COLUMN modelo_aeronave_id TEXT').run();

    // 2. Copiar dados
    await db
      .prepare('UPDATE funcionarios SET modelo_aeronave_id = aeronave WHERE aeronave IS NOT NULL')
      .run();

    // 3. Criar índice
    await db
      .prepare(
        'CREATE INDEX IF NOT EXISTS idx_funcionarios_modelo_aeronave ON funcionarios(modelo_aeronave_id)',
      )
      .run();

    // 4. Verificar resultado
    const sample = await db
      .prepare('SELECT id, nome, aeronave, modelo_aeronave_id FROM funcionarios LIMIT 5')
      .all();

    return c.json({
      success: true,
      message: 'Migration 0118 aplicada com sucesso',
      sample: sample.results,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Se coluna já existe, retornar sucesso
    if (errorMessage.includes('duplicate column name')) {
      const sample = await db
        .prepare('SELECT id, nome, aeronave, modelo_aeronave_id FROM funcionarios LIMIT 5')
        .all();
      return c.json({
        success: true,
        message: 'Migration 0118 já foi aplicada anteriormente',
        sample: sample.results,
      });
    }

    return c.json(
      {
        success: false,
        error: errorMessage,
      },
      500,
    );
  }
});

export default app;
