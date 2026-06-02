/**
 * ESCALAS — Notificações In-App
 * Rotas: GET /notificacoes, PATCH /notificacoes/:nid/lida, PATCH /notificacoes/marcar-todas-lidas
 * NOTE: POST /:id/notificar permanece em escalas-core (depende de escala_id no path pai)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe } from './escalas-shared';

const notificacoes = new Hono<{ Bindings: Env }>();

// GET /api/escalas/notificacoes
notificacoes.get('/', auth(), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const funcionarioId = String(c.get('userId' as never) || '');
    const limit = Math.min(Number(c.req.query('limit') || '20'), 50);

    const rows = await c.env.DB.prepare(
      `SELECT id, tipo, titulo, mensagem, lida, referencia_id, referencia_tipo, created_at
       FROM notificacoes_inapp
       WHERE funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT ?`,
    )
      .bind(funcionarioId, empresaId, limit)
      .all();

    const naoLidas = await c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM notificacoes_inapp
       WHERE funcionario_id = ? AND empresa_id = ? AND lida = 0 AND deleted_at IS NULL`,
    )
      .bind(funcionarioId, empresaId)
      .first<{ cnt: number }>();

    return c.json({
      success: true,
      data: rows.results || [],
      nao_lidas: naoLidas?.cnt ?? 0,
    });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PATCH /api/escalas/notificacoes/marcar-todas-lidas
// NOTE: must be registered BEFORE /:nid/lida to avoid route conflict
notificacoes.patch('/marcar-todas-lidas', auth(), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const funcionarioId = String(c.get('userId' as never) || '');
    await c.env.DB.prepare(
      `UPDATE notificacoes_inapp SET lida = 1
       WHERE funcionario_id = ? AND empresa_id = ? AND lida = 0`,
    )
      .bind(funcionarioId, empresaId)
      .run();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PATCH /api/escalas/notificacoes/:nid/lida
notificacoes.patch('/:nid/lida', auth(), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const funcionarioId = String(c.get('userId' as never) || '');
    const nid = c.req.param('nid');
    await c.env.DB.prepare(
      `UPDATE notificacoes_inapp SET lida = 1
       WHERE id = ? AND funcionario_id = ? AND empresa_id = ?`,
    )
      .bind(nid, funcionarioId, empresaId)
      .run();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default notificacoes;
