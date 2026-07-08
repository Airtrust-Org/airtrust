/**
 * ESCALAS — Padrões de Escala
 * Rotas: GET/POST /padroes, DELETE /padroes/:id
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe, parseBody, PadraoEscalaSchema } from './escalas-shared';

const padroes = new Hono<{ Bindings: Env }>();

// GET /api/escalas/padroes
padroes.get('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  try {
    const result = await db
      .prepare(
        `SELECT * FROM padroes_escala
         WHERE deleted_at IS NULL AND (empresa_id = ? OR empresa_id IS NULL)
         ORDER BY nome`,
      )
      .bind(empresaId)
      .all();
    return c.json({ success: true, data: result.results });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /api/escalas/padroes
padroes.post('/', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const body = await c.req.json();
  const parsed = parseBody(PadraoEscalaSchema, body);
  if (!parsed.ok) return c.json({ success: false, error: parsed.error }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await db
      .prepare(
        `INSERT INTO padroes_escala (id, nome, dias_trabalho, dias_folga, descricao, ativo, empresa_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        parsed.data.nome,
        parsed.data.dias_trabalho,
        parsed.data.dias_folga,
        parsed.data.descricao || null,
        parsed.data.ativo,
        empresaId,
        now,
        now,
      )
      .run();
    return c.json({ success: true, data: { id } }, 201);
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// DELETE /api/escalas/padroes/:id
padroes.delete('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const { id } = c.req.param();
  const empresaId = getEmpresaIdSafe(c);
  const now = new Date().toISOString();
  try {
    // Só permite excluir padrões da própria empresa (nunca os globais com
    // empresa_id NULL, nem os de outra empresa).
    const existing = await db
      .prepare(
        `SELECT id FROM padroes_escala WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first();
    if (!existing) {
      return c.json({ success: false, error: 'Padrão de escala não encontrado' }, 404);
    }

    await db
      .prepare(
        `UPDATE padroes_escala SET deleted_at = ?, updated_at = ? WHERE id = ? AND empresa_id = ?`,
      )
      .bind(now, now, id, empresaId)
      .run();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default padroes;
