/**
 * ESCALAS — Quinzenas do Ano
 * Rotas: GET/POST/PUT/DELETE /quinzenas, POST /quinzenas/gerar-ano
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { getEmpresaIdSafe } from './escalas-shared';
import { getDefaultOperationalFortnightRange } from '../services/operational-fortnight-calendar';

const quinzenas = new Hono<{ Bindings: Env }>();

const QuinzenaSchema = z.object({
  ano: z.number().min(2024).max(2040),
  mes: z.number().min(1).max(12),
  numero: z.number().min(1).max(2),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observacoes: z.string().optional(),
});

// GET /api/escalas/quinzenas?ano=2026
quinzenas.get('/', auth(), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const ano = Number(c.req.query('ano') || new Date().getFullYear());
    const rows = await c.env.DB.prepare(
      `SELECT id, empresa_id, ano, mes, numero, data_inicio, data_fim, observacoes, created_at, updated_at
       FROM escalas_quinzenas
       WHERE empresa_id = ? AND ano = ? AND deleted_at IS NULL
       ORDER BY mes, numero`,
    )
      .bind(empresaId, ano)
      .all();
    return c.json({ success: true, data: rows.results });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /api/escalas/quinzenas/gerar-ano — auto-generate standard quinzenas for a year
// NOTE: must be registered BEFORE /:id to avoid route conflict
quinzenas.post('/gerar-ano', auth(), requirePermission('escalas', 'criar', 'admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const body = await c.req.json();
    const ano = Number(body.ano || new Date().getFullYear());
    const stmts = [];
    for (let mes = 1; mes <= 12; mes++) {
      const primeira = getDefaultOperationalFortnightRange(ano, mes, 1);
      const segunda = getDefaultOperationalFortnightRange(ano, mes, 2);
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO escalas_quinzenas (empresa_id, ano, mes, numero, data_inicio, data_fim)
           VALUES (?, ?, ?, 1, ?, ?)
           ON CONFLICT(empresa_id, ano, mes, numero) DO UPDATE SET
             data_inicio = excluded.data_inicio,
             data_fim = excluded.data_fim,
             updated_at = datetime('now'),
             deleted_at = NULL`,
        ).bind(empresaId, ano, mes, primeira.start, primeira.end),
      );
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO escalas_quinzenas (empresa_id, ano, mes, numero, data_inicio, data_fim)
           VALUES (?, ?, ?, 2, ?, ?)
           ON CONFLICT(empresa_id, ano, mes, numero) DO UPDATE SET
             data_inicio = excluded.data_inicio,
             data_fim = excluded.data_fim,
             updated_at = datetime('now'),
             deleted_at = NULL`,
        ).bind(empresaId, ano, mes, segunda.start, segunda.end),
      );
    }
    await c.env.DB.batch(stmts);
    return c.json({ success: true, message: `${stmts.length} quinzenas geradas para ${ano}` });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /api/escalas/quinzenas — create or upsert one quinzena
quinzenas.post('/', auth(), requirePermission('escalas', 'criar', 'admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const body = await c.req.json();
    const parsed = QuinzenaSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: parsed.error.errors }, 400);
    const { ano, mes, numero, data_inicio, data_fim, observacoes } = parsed.data;

    if (data_inicio > data_fim) {
      return c.json({ success: false, error: 'data_inicio deve ser anterior a data_fim' }, 400);
    }

    await c.env.DB.prepare(
      `INSERT INTO escalas_quinzenas (empresa_id, ano, mes, numero, data_inicio, data_fim, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(empresa_id, ano, mes, numero) DO UPDATE SET
         data_inicio = excluded.data_inicio,
         data_fim = excluded.data_fim,
         observacoes = excluded.observacoes,
         updated_at = datetime('now'),
         deleted_at = NULL`,
    )
      .bind(empresaId, ano, mes, numero, data_inicio, data_fim, observacoes ?? null)
      .run();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// PUT /api/escalas/quinzenas/:id
quinzenas.put('/:id', auth(), requirePermission('escalas', 'editar', 'admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const { data_inicio, data_fim, observacoes } = body;

    if (data_inicio && data_fim && data_inicio > data_fim) {
      return c.json({ success: false, error: 'data_inicio deve ser anterior a data_fim' }, 400);
    }

    const result = await c.env.DB.prepare(
      `UPDATE escalas_quinzenas SET data_inicio = ?, data_fim = ?, observacoes = ?, updated_at = datetime('now')
       WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(data_inicio, data_fim, observacoes ?? null, id, empresaId)
      .run();

    if ((result.meta?.changes ?? 0) === 0) {
      return c.json({ success: false, error: 'Quinzena não encontrada' }, 404);
    }

    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// DELETE /api/escalas/quinzenas/:id
quinzenas.delete('/:id', auth(), requirePermission('escalas', 'deletar', 'admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const id = Number(c.req.param('id'));
    const result = await c.env.DB.prepare(
      `UPDATE escalas_quinzenas SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(id, empresaId)
      .run();

    if ((result.meta?.changes ?? 0) === 0) {
      return c.json({ success: false, error: 'Quinzena não encontrada' }, 404);
    }

    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default quinzenas;
