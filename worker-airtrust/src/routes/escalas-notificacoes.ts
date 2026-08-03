/**
 * ESCALAS — Notificações In-App
 * Rotas: GET /notificacoes, PATCH /notificacoes/:nid/lida, PATCH /notificacoes/marcar-todas-lidas
 * NOTE: POST /:id/notificar permanece em escalas-core (depende de escala_id no path pai)
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe } from './escalas-shared';

type AppContext = Context<{ Bindings: Env }>;

const notificacoes = new Hono<{ Bindings: Env }>();

async function resolveFuncionarioId(c: AppContext): Promise<string | null> {
  const userId = c.get('userId' as never);
  if (userId === null || userId === undefined || userId === '') return null;

  const row = await c.env.DB.prepare(
    `SELECT funcionario_id
       FROM usuarios
      WHERE id = ?
        AND deleted_at IS NULL
      LIMIT 1`,
  )
    .bind(userId)
    .first<{ funcionario_id: string | number | null }>();

  return row?.funcionario_id === null || row?.funcionario_id === undefined
    ? null
    : String(row.funcionario_id);
}

// GET /api/escalas/notificacoes
notificacoes.get('/', auth(), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const funcionarioId = await resolveFuncionarioId(c);
    const limit = Math.min(Math.max(Number(c.req.query('limit') || '20'), 1), 50);

    if (!funcionarioId) {
      return c.json({ success: true, data: [], nao_lidas: 0 });
    }

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
  } catch {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PATCH /api/escalas/notificacoes/marcar-todas-lidas
// NOTE: must be registered BEFORE /:nid/lida to avoid route conflict
notificacoes.patch('/marcar-todas-lidas', auth(), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const funcionarioId = await resolveFuncionarioId(c);
    if (!funcionarioId) {
      return c.json({ success: false, error: 'Usuário sem funcionário vinculado' }, 404);
    }

    const result = await c.env.DB.prepare(
      `UPDATE notificacoes_inapp SET lida = 1
       WHERE funcionario_id = ? AND empresa_id = ? AND lida = 0 AND deleted_at IS NULL`,
    )
      .bind(funcionarioId, empresaId)
      .run();
    return c.json({ success: true, updated: result.meta.changes || 0 });
  } catch {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PATCH /api/escalas/notificacoes/:nid/lida
notificacoes.patch('/:nid/lida', auth(), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const funcionarioId = await resolveFuncionarioId(c);
    if (!funcionarioId) {
      return c.json({ success: false, error: 'Usuário sem funcionário vinculado' }, 404);
    }

    const nid = c.req.param('nid');
    const result = await c.env.DB.prepare(
      `UPDATE notificacoes_inapp SET lida = 1
       WHERE id = ? AND funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(nid, funcionarioId, empresaId)
      .run();

    if ((result.meta.changes || 0) === 0) {
      return c.json({ success: false, error: 'Notificação não encontrada' }, 404);
    }
    return c.json({ success: true, updated: result.meta.changes || 0 });
  } catch {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default notificacoes;
