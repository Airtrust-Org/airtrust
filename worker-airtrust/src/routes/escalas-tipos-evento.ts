// FIX: [BUG 1] - Event type config route now supports returning only active records for the legend.
/**
 * ESCALAS — Tipos de Evento Config (persiste no D1, multi-tenant)
 * Rotas: GET/POST/PUT/DELETE /tipos-evento-config
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe } from './escalas-shared';

const tiposEvento = new Hono<{ Bindings: Env }>();

function getSiglaPadrao(codigo: string): string {
  switch (normalizeTipoEventoCodigo(codigo)) {
    case 'VOO':
    case 'VIM':
    case 'VIAGEM':
      return 'V';
    case 'TSO':
    case 'TREINAMENTO_SOLO':
    case 'TRB':
    case 'TRABALHO':
      return 'T';
    case 'SIM':
    case 'TREINAMENTO_SIMULADOR':
    case 'SMH':
    case 'STANDBY':
      return 'S';
    case 'MED':
    case 'MEDICO':
      return 'M';
    case 'CHK':
    case 'CHEQUE':
      return 'C';
    case 'REA':
    case 'REAQUISI':
      return 'R';
    case 'FOL':
    case 'FOLGA':
    case 'FER':
    case 'FERIAS':
      return 'F';
    case 'LIC':
    case 'LICENCA':
      return 'L';
    default:
      return 'E';
  }
}

function normalizeSigla(value: string | null | undefined, codigo: string): string {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 2);

  return normalized || getSiglaPadrao(codigo);
}

const TipoEventoConfigSchema = z.object({
  codigo: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  sigla: z.string().trim().max(2).optional().nullable(),
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{3,8}$/)
    .or(z.string().min(2).max(50)),
  icone: z.string().max(60).optional().nullable(),
  ativo: z.coerce.number().int().min(0).max(1).optional().default(1),
  ordem: z.coerce.number().int().min(0).max(999).optional().default(0),
});

function normalizeTipoEventoCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

// GET /api/escalas/tipos-evento-config
tiposEvento.get('/', auth(), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const apenasAtivos = ['1', 'true'].includes(String(c.req.query('ativo') || '').toLowerCase());
    const existingCount = await c.env.DB.prepare(
      `SELECT COUNT(1) AS count
       FROM escalas_tipos_evento_config
       WHERE empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(empresaId)
      .first<{ count: number }>();

    if (!existingCount || Number(existingCount.count || 0) === 0) {
      const now = new Date().toISOString();
      const defaults: Array<{
        codigo: string;
        label: string;
        sigla: string;
        cor: string;
        icone: string;
        ordem: number;
      }> = [
        {
          codigo: 'VOO',
          label: 'Voo Operacional',
          sigla: 'V',
          cor: '#0EA5E9',
          icone: '✈',
          ordem: 1,
        },
        { codigo: 'VIM', label: 'Viagem', sigla: 'V', cor: '#3B82F6', icone: '🧳', ordem: 2 },
        {
          codigo: 'TSO',
          label: 'Treinamento Solo',
          sigla: 'T',
          cor: '#8B5CF6',
          icone: '📚',
          ordem: 3,
        },
        {
          codigo: 'SIM',
          label: 'Treinamento Simulador',
          sigla: 'S',
          cor: '#6366F1',
          icone: '🖥',
          ordem: 4,
        },
        { codigo: 'MED', label: 'Exame Médico', sigla: 'M', cor: '#EF4444', icone: '🏥', ordem: 5 },
        { codigo: 'CHK', label: 'Cheque', sigla: 'C', cor: '#F59E0B', icone: '✅', ordem: 6 },
        { codigo: 'REA', label: 'Reaquisição', sigla: 'R', cor: '#10B981', icone: '🔄', ordem: 7 },
        {
          codigo: 'TRB',
          label: 'Trabalho Administrativo',
          sigla: 'T',
          cor: '#6B7280',
          icone: '💼',
          ordem: 8,
        },
        { codigo: 'FOL', label: 'Folga', sigla: 'F', cor: '#22C55E', icone: '🏖', ordem: 9 },
        { codigo: 'SMH', label: 'Standby', sigla: 'S', cor: '#A855F7', icone: '📡', ordem: 10 },
        { codigo: 'FER', label: 'Férias', sigla: 'F', cor: '#14B8A6', icone: '🌴', ordem: 11 },
        { codigo: 'LIC', label: 'Licença', sigla: 'L', cor: '#64748B', icone: '📋', ordem: 12 },
      ];

      await c.env.DB.batch(
        defaults.map((item) =>
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO escalas_tipos_evento_config
               (id, empresa_id, codigo, label, sigla, cor, icone, ativo, ordem, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          ).bind(
            crypto.randomUUID(),
            empresaId,
            item.codigo,
            item.label,
            item.sigla,
            item.cor,
            item.icone,
            item.ordem,
            now,
            now,
          ),
        ),
      );
    }

    const rows = await c.env.DB.prepare(
      `SELECT id, codigo, label, COALESCE(sigla, '') AS sigla, cor, icone, ativo, ordem
       FROM escalas_tipos_evento_config
       WHERE empresa_id = ? AND deleted_at IS NULL
         AND (? = 0 OR ativo = 1)
       ORDER BY ordem ASC, label ASC`,
    )
      .bind(empresaId, apenasAtivos ? 1 : 0)
      .all();
    return c.json({ success: true, data: rows.results || [] });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// POST /api/escalas/tipos-evento-config
tiposEvento.post('/', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const body = await c.req.json();
    const parsed = TipoEventoConfigSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: parsed.error.flatten() }, 400);

    const d = parsed.data;
    const now = new Date().toISOString();
    const codigo = normalizeTipoEventoCodigo(d.codigo);
    const sigla = normalizeSigla(d.sigla, codigo);

    const existing = await c.env.DB.prepare(
      `SELECT id, deleted_at
       FROM escalas_tipos_evento_config
       WHERE empresa_id = ? AND UPPER(codigo) = ?
       LIMIT 1`,
    )
      .bind(empresaId, codigo)
      .first<{ id: string; deleted_at: string | null }>();

    if (existing?.id) {
      await c.env.DB.prepare(
        `UPDATE escalas_tipos_evento_config
         SET codigo = ?, label = ?, sigla = ?, cor = ?, icone = ?, ativo = ?, ordem = ?, deleted_at = NULL, updated_at = ?
         WHERE id = ?`,
      )
        .bind(codigo, d.label, sigla, d.cor, d.icone ?? null, d.ativo, d.ordem, now, existing.id)
        .run();

      return c.json(
        { success: true, data: { id: existing.id, restored: existing.deleted_at !== null } },
        existing.deleted_at ? 201 : 200,
      );
    }

    const id = crypto.randomUUID();

    await c.env.DB.prepare(
      `INSERT INTO escalas_tipos_evento_config
         (id, empresa_id, codigo, label, sigla, cor, icone, ativo, ordem, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        empresaId,
        codigo,
        d.label,
        sigla,
        d.cor,
        d.icone ?? null,
        d.ativo,
        d.ordem,
        now,
        now,
      )
      .run();

    return c.json({ success: true, data: { id } }, 201);
  } catch (e) {
    const msg = String(e);
    if (msg.includes('UNIQUE'))
      return c.json({ success: false, error: 'Código já cadastrado para esta empresa' }, 409);
    return c.json({ success: false, error: msg }, 500);
  }
});

// PUT /api/escalas/tipos-evento-config/:id
tiposEvento.put('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = TipoEventoConfigSchema.partial().safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: parsed.error.flatten() }, 400);

    const existing = await c.env.DB.prepare(
      `SELECT id, codigo FROM escalas_tipos_evento_config WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
      .bind(id, empresaId)
      .first<{ id: string; codigo: string }>();
    if (!existing) return c.json({ success: false, error: 'Tipo não encontrado' }, 404);

    const d = parsed.data;
    const fields: string[] = [];
    const vals: unknown[] = [];
    if (d.label !== undefined) {
      fields.push('label = ?');
      vals.push(d.label);
    }
    if (d.sigla !== undefined) {
      fields.push('sigla = ?');
      vals.push(normalizeSigla(d.sigla, existing.codigo));
    }
    if (d.cor !== undefined) {
      fields.push('cor = ?');
      vals.push(d.cor);
    }
    if (d.icone !== undefined) {
      fields.push('icone = ?');
      vals.push(d.icone);
    }
    if (d.ativo !== undefined) {
      fields.push('ativo = ?');
      vals.push(d.ativo);
    }
    if (d.ordem !== undefined) {
      fields.push('ordem = ?');
      vals.push(d.ordem);
    }
    if (fields.length === 0) return c.json({ success: true });

    fields.push('updated_at = ?');
    vals.push(new Date().toISOString());
    vals.push(id);

    await c.env.DB.prepare(
      `UPDATE escalas_tipos_evento_config SET ${fields.join(', ')} WHERE id = ?`,
    )
      .bind(...vals)
      .run();

    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// DELETE /api/escalas/tipos-evento-config/:id
tiposEvento.delete('/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaIdSafe(c);
    const id = c.req.param('id');
    await c.env.DB.prepare(
      `UPDATE escalas_tipos_evento_config SET deleted_at = ? WHERE id = ? AND empresa_id = ?`,
    )
      .bind(new Date().toISOString(), id, empresaId)
      .run();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default tiposEvento;
