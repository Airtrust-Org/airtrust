import { Hono } from 'hono';
import { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/debug/historico/:id
 * Debug específico de um registro histórico
 */
app.get('/historico/:id', async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  try {
    // Query direta no banco
    const record = await db
      .prepare(
        `
      SELECT 
        qh.id,
        qh.funcionario_id,
        qh.qualificacao_id,
        qh.qualificacao_codigo,
        qh.deleted_at,
        f.nome as funcionario_nome,
        qt.id as tipo_db_id,
        qt.nome as tipo_nome,
        qt.codigo as tipo_codigo
      FROM qualificacoes_historico qh
      LEFT JOIN funcionarios f ON qh.funcionario_id = f.id
      LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
      WHERE qh.id = ?
    `,
      )
      .bind(id)
      .first();

    if (!record) {
      return c.json({ success: false, error: 'Registro não encontrado' }, 404);
    }

    return c.json({
      success: true,
      data: record,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: 'Erro ao buscar registro',
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

export default app;
