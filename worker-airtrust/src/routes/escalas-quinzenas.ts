/**
 * ESCALAS — Quinzenas do Ano
 * Rotas: GET/POST/PUT/DELETE /quinzenas, POST /quinzenas/gerar-ano
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe } from './escalas-shared';

const quinzenas = new Hono<{ Bindings: Env }>();
const requireQuinzenaManager = requireRole('admin', 'manager');

const OPERATIONAL_QUINZENA_PRESETS: Record<
  number,
  Record<string, { inicio: string; fim: string }>
> = {
  2025: {
    '12_1': { inicio: '2025-12-15', fim: '2025-12-29' },
  },
  2026: {
    '1_1': { inicio: '2025-12-30', fim: '2026-01-14' },
    '1_2': { inicio: '2026-01-15', fim: '2026-01-30' },
    '2_1': { inicio: '2026-01-31', fim: '2026-02-14' },
    '2_2': { inicio: '2026-02-15', fim: '2026-02-28' },
    '3_1': { inicio: '2026-03-01', fim: '2026-03-15' },
    '3_2': { inicio: '2026-03-16', fim: '2026-03-31' },
    '4_1': { inicio: '2026-04-01', fim: '2026-04-15' },
    '4_2': { inicio: '2026-04-16', fim: '2026-04-30' },
    '5_1': { inicio: '2026-05-01', fim: '2026-05-16' },
    '5_2': { inicio: '2026-05-17', fim: '2026-05-31' },
    '6_1': { inicio: '2026-06-01', fim: '2026-06-15' },
    '6_2': { inicio: '2026-06-16', fim: '2026-06-30' },
    '7_1': { inicio: '2026-07-01', fim: '2026-07-15' },
    '7_2': { inicio: '2026-07-16', fim: '2026-07-31' },
    '8_1': { inicio: '2026-08-01', fim: '2026-08-16' },
    '8_2': { inicio: '2026-08-17', fim: '2026-08-31' },
    '9_1': { inicio: '2026-09-01', fim: '2026-09-15' },
    '9_2': { inicio: '2026-09-16', fim: '2026-09-30' },
    '10_1': { inicio: '2026-10-01', fim: '2026-10-15' },
    '10_2': { inicio: '2026-10-16', fim: '2026-10-31' },
    '11_1': { inicio: '2026-11-01', fim: '2026-11-15' },
    '11_2': { inicio: '2026-11-16', fim: '2026-11-30' },
    '12_1': { inicio: '2026-12-01', fim: '2026-12-14' },
    '12_2': { inicio: '2026-12-15', fim: '2026-12-29' },
  },
};

function getDefaultQuinzenaRange(ano: number, mes: number, numero: 1 | 2) {
  const preset = OPERATIONAL_QUINZENA_PRESETS[ano]?.[`${mes}_${numero}`];
  if (preset) {
    return preset;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(ano, mes, 0).getDate();
  const primeiraQuinzenaFim = Math.min(16, lastDay);
  const segundaQuinzenaInicio = Math.min(primeiraQuinzenaFim + 1, lastDay);
  const prefix = `${ano}-${pad(mes)}`;

  if (numero === 1) {
    return { inicio: `${prefix}-01`, fim: `${prefix}-${pad(primeiraQuinzenaFim)}` };
  }

  return { inicio: `${prefix}-${pad(segundaQuinzenaInicio)}`, fim: `${prefix}-${pad(lastDay)}` };
}

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
quinzenas.post('/gerar-ano', auth(), requireQuinzenaManager, async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const body = await c.req.json();
    const ano = Number(body.ano || new Date().getFullYear());
    const stmts = [];
    for (let mes = 1; mes <= 12; mes++) {
      const primeira = getDefaultQuinzenaRange(ano, mes, 1);
      const segunda = getDefaultQuinzenaRange(ano, mes, 2);
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO escalas_quinzenas (empresa_id, ano, mes, numero, data_inicio, data_fim)
           VALUES (?, ?, ?, 1, ?, ?)
           ON CONFLICT(empresa_id, ano, mes, numero) DO UPDATE SET
             data_inicio = excluded.data_inicio,
             data_fim = excluded.data_fim,
             updated_at = datetime('now'),
             deleted_at = NULL`,
        ).bind(empresaId, ano, mes, primeira.inicio, primeira.fim),
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
        ).bind(empresaId, ano, mes, segunda.inicio, segunda.fim),
      );
    }
    await c.env.DB.batch(stmts);
    return c.json({ success: true, message: `${stmts.length} quinzenas geradas para ${ano}` });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /api/escalas/quinzenas — create or upsert one quinzena
quinzenas.post('/', auth(), requireQuinzenaManager, async (c) => {
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
quinzenas.put('/:id', auth(), requireQuinzenaManager, async (c) => {
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
quinzenas.delete('/:id', auth(), requireQuinzenaManager, async (c) => {
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
