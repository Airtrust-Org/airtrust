/**
 * ESCALAS — Templates de Tripulação
 * Rotas: GET/POST/PUT/DELETE /templates, POST /templates/:id/usar
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe } from './escalas-shared';
import { createLogger, toError } from '../utils/logger';

const templates = new Hono<{ Bindings: Env }>();

const TemplateSchema = z.object({
  nome: z.string().min(1).max(120),
  quinzena: z.coerce.number().int().min(0).max(2).default(0),
  aeronave: z.string().max(100).optional().nullable(),
  pic_id: z.string().optional().nullable(),
  sic_id: z.string().optional().nullable(),
  padrao_escala_id: z.string().optional().nullable(),
  base: z.string().max(100).optional().nullable(),
  observacoes: z.string().max(500).optional().nullable(),
  ativo: z.coerce.number().int().min(0).max(1).optional().default(1),
});

function templatesErrorResponse(
  c: { json: (body: unknown, status?: number) => Response },
  status: 400 | 404 | 500,
  error: string | Record<string, unknown>,
  code: string,
) {
  return c.json({ success: false, error, code }, status);
}

// GET /api/escalas/templates
templates.get('/', auth(), async (c) => {
  const logger = createLogger(c, 'EscalasTemplates.list');
  try {
    const empresaId = getEmpresaIdSafe(c);
    const { aeronave, quinzena } = c.req.query();
    const where: string[] = ['t.empresa_id = ?', 't.deleted_at IS NULL', 't.ativo = 1'];
    const binds: unknown[] = [empresaId];

    if (aeronave) {
      where.push('(t.aeronave IS NULL OR UPPER(t.aeronave) = UPPER(?))');
      binds.push(aeronave);
    }
    if (quinzena !== undefined) {
      where.push('(t.quinzena = 0 OR t.quinzena = ?)');
      binds.push(Number(quinzena));
    }

    const rows = await c.env.DB.prepare(
      `SELECT t.id, t.nome, t.quinzena, t.aeronave, t.pic_id, t.sic_id,
              t.padrao_escala_id, t.base, t.observacoes, t.usos,
              fpic.nome AS pic_nome, fsic.nome AS sic_nome
      FROM escalas_templates_tripulacao t
      LEFT JOIN funcionarios fpic ON fpic.id = t.pic_id AND (fpic.empresa_id IS NULL OR fpic.empresa_id = t.empresa_id)
      LEFT JOIN funcionarios fsic ON fsic.id = t.sic_id AND (fsic.empresa_id IS NULL OR fsic.empresa_id = t.empresa_id)
       WHERE ${where.join(' AND ')}
       ORDER BY t.usos DESC, t.nome ASC`,
    )
      .bind(...binds)
      .all();
    return c.json({ success: true, data: rows.results || [] });
  } catch (e) {
    logger.error('Erro ao listar templates de escala', toError(e));
    return templatesErrorResponse(
      c,
      500,
      'Erro ao listar templates de escala',
      'ESCALA_TEMPLATE_LIST_ERROR',
    );
  }
});

// POST /api/escalas/templates
templates.post('/', auth(), requireRole('admin', 'manager'), async (c) => {
  const logger = createLogger(c, 'EscalasTemplates.create');
  try {
    const empresaId = getEmpresaIdSafe(c);
    const body = await c.req.json();
    const parsed = TemplateSchema.safeParse(body);
    if (!parsed.success) {
      return templatesErrorResponse(
        c,
        400,
        parsed.error.flatten(),
        'ESCALA_TEMPLATE_INVALID_PAYLOAD',
      );
    }

    const d = parsed.data;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO escalas_templates_tripulacao
         (id, empresa_id, nome, quinzena, aeronave, pic_id, sic_id, padrao_escala_id, base, observacoes, ativo, usos, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
      .bind(
        id,
        empresaId,
        d.nome,
        d.quinzena,
        d.aeronave ?? null,
        d.pic_id ?? null,
        d.sic_id ?? null,
        d.padrao_escala_id ?? null,
        d.base ?? null,
        d.observacoes ?? null,
        d.ativo,
        now,
        now,
      )
      .run();

    return c.json({ success: true, data: { id } }, 201);
  } catch (e) {
    logger.error('Erro ao criar template de escala', toError(e));
    return templatesErrorResponse(
      c,
      500,
      'Erro ao criar template de escala',
      'ESCALA_TEMPLATE_CREATE_ERROR',
    );
  }
});

// PUT /api/escalas/templates/:id
templates.put('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const logger = createLogger(c, 'EscalasTemplates.update');
  try {
    const empresaId = getEmpresaIdSafe(c);
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare(
      `SELECT id FROM escalas_templates_tripulacao WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(id, empresaId)
      .first();
    if (!existing) {
      return templatesErrorResponse(c, 404, 'Template não encontrado', 'ESCALA_TEMPLATE_NOT_FOUND');
    }

    const body = await c.req.json();
    const parsed = TemplateSchema.partial().safeParse(body);
    if (!parsed.success) {
      return templatesErrorResponse(
        c,
        400,
        parsed.error.flatten(),
        'ESCALA_TEMPLATE_INVALID_UPDATE',
      );
    }

    const d = parsed.data;
    const fields: string[] = [];
    const vals: unknown[] = [];
    const map: [string, unknown][] = [
      ['nome', d.nome],
      ['quinzena', d.quinzena],
      ['aeronave', d.aeronave],
      ['pic_id', d.pic_id],
      ['sic_id', d.sic_id],
      ['padrao_escala_id', d.padrao_escala_id],
      ['base', d.base],
      ['observacoes', d.observacoes],
      ['ativo', d.ativo],
    ];
    for (const [col, val] of map) {
      if (val !== undefined) {
        fields.push(`${col} = ?`);
        vals.push(val ?? null);
      }
    }
    if (fields.length === 0) return c.json({ success: true });
    fields.push('updated_at = ?');
    vals.push(new Date().toISOString());
    vals.push(id);

    await c.env.DB.prepare(
      `UPDATE escalas_templates_tripulacao SET ${fields.join(', ')} WHERE id = ?`,
    )
      .bind(...vals)
      .run();

    return c.json({ success: true });
  } catch (e) {
    logger.error('Erro ao atualizar template de escala', toError(e));
    return templatesErrorResponse(
      c,
      500,
      'Erro ao atualizar template de escala',
      'ESCALA_TEMPLATE_UPDATE_ERROR',
    );
  }
});

// DELETE /api/escalas/templates/:id
templates.delete('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  const logger = createLogger(c, 'EscalasTemplates.delete');
  try {
    const empresaId = getEmpresaIdSafe(c);
    const id = c.req.param('id');
    await c.env.DB.prepare(
      `UPDATE escalas_templates_tripulacao SET deleted_at = ? WHERE id = ? AND empresa_id = ?`,
    )
      .bind(new Date().toISOString(), id, empresaId)
      .run();
    return c.json({ success: true });
  } catch (e) {
    logger.error('Erro ao remover template de escala', toError(e));
    return templatesErrorResponse(
      c,
      500,
      'Erro ao remover template de escala',
      'ESCALA_TEMPLATE_DELETE_ERROR',
    );
  }
});

// POST /api/escalas/templates/:id/usar (incrementa contador)
templates.post('/:id/usar', auth(), async (c) => {
  const logger = createLogger(c, 'EscalasTemplates.incrementUsage');
  try {
    const empresaId = getEmpresaIdSafe(c);
    const id = c.req.param('id');
    await c.env.DB.prepare(
      `UPDATE escalas_templates_tripulacao SET usos = usos + 1, updated_at = ?
       WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(new Date().toISOString(), id, empresaId)
      .run();
    return c.json({ success: true });
  } catch (e) {
    logger.error('Erro ao registrar uso de template de escala', toError(e));
    return templatesErrorResponse(
      c,
      500,
      'Erro ao registrar uso do template',
      'ESCALA_TEMPLATE_USAGE_ERROR',
    );
  }
});

export default templates;
