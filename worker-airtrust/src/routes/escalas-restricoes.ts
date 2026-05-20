/**
 * ESCALAS — Restrições de Tripulação
 * Rotas: GET/POST /restricoes, DELETE /restricoes/:id
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe, parseBody, RestricaoTripulacaoSchema } from './escalas-shared';

const restricoes = new Hono<{ Bindings: Env }>();

// GET /api/escalas/restricoes
restricoes.get('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  try {
    const result = await db
      .prepare(
        `SELECT rt.*, fa.nome as funcionario_a_nome, fb.nome as funcionario_b_nome
         FROM restricoes_tripulacao rt
         LEFT JOIN funcionarios fa ON rt.funcionario_a_id = fa.id AND (fa.empresa_id IS NULL OR fa.empresa_id = rt.empresa_id)
         LEFT JOIN funcionarios fb ON rt.funcionario_b_id = fb.id AND (fb.empresa_id IS NULL OR fb.empresa_id = rt.empresa_id)
         WHERE rt.deleted_at IS NULL AND rt.ativo = 1
           AND (rt.empresa_id = ? OR rt.empresa_id IS NULL)
         ORDER BY rt.created_at DESC`,
      )
      .bind(empresaId)
      .all();
    return c.json({ success: true, data: result.results });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// POST /api/escalas/restricoes
restricoes.post('/', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = String(c.get('userId' as never) || '');
  const body = await c.req.json();
  const parsed = parseBody(RestricaoTripulacaoSchema, body);
  if (!parsed.ok) return c.json({ success: false, error: parsed.error }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const d = parsed.data;

  try {
    await db
      .prepare(
        `INSERT INTO restricoes_tripulacao
         (id, funcionario_a_id, funcionario_b_id, tipo_restricao, motivo, contrato_referencia, data_inicio, data_fim, ativo, empresa_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        d.funcionario_a_id,
        d.funcionario_b_id,
        d.tipo_restricao,
        d.motivo || null,
        d.contrato_referencia || null,
        d.data_inicio || null,
        d.data_fim || null,
        empresaId,
        userId,
        now,
        now,
      )
      .run();
    return c.json({ success: true, data: { id } }, 201);
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// DELETE /api/escalas/restricoes/:id
restricoes.delete('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const { id } = c.req.param();
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `UPDATE restricoes_tripulacao SET deleted_at = ?, updated_at = ?, ativo = 0 WHERE id = ?`,
      )
      .bind(now, now, id)
      .run();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

export default restricoes;
