/**
 * Rotas de Hospedagem
 * Gerenciamento de acomodações de tripulantes (hotel, plataforma, base)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, ApiResponse } from '../types';
import { notFound, badRequest } from '../middleware/error-handler';
import { registrarAuditoria } from '../utils/auditoria';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth());

// ─── Schemas ────────────────────────────────────────────────────────────────

const HospedagemCreateSchema = z.object({
  funcionario_id: z.number().int().positive(),
  tipo: z.enum(['HOTEL', 'PLATAFORMA', 'BASE', 'OUTRO']),
  local: z.string().min(1).max(200),
  cidade: z.string().max(100).optional().nullable(),
  estado: z.string().max(50).optional().nullable(),
  data_checkin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_checkout: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  numero_quarto: z.string().max(20).optional().nullable(),
  custo_diaria: z.number().nonnegative().optional().nullable(),
  moeda: z.string().length(3).default('BRL'),
  escala_id: z.number().int().positive().optional().nullable(),
  observacoes: z.string().max(1000).optional().nullable(),
});

const HospedagemUpdateSchema = HospedagemCreateSchema.partial().omit({ funcionario_id: true });

// ─── List ── GET /api/hospedagem ─────────────────────────────────────────────

app.get('/', async (c) => {
  const db = c.env.DB;
  const empresa_id = getEmpresaId(c);

  const funcionario_id = c.req.query('funcionario_id');
  const tipo = c.req.query('tipo');
  const data_inicio = c.req.query('data_inicio');
  const data_fim = c.req.query('data_fim');
  const ativo = c.req.query('ativo'); // '1' = sem checkout, '0' = checkout já efetuado

  let query = `
    SELECT
      h.id, h.funcionario_id, h.tipo, h.local, h.cidade, h.estado,
      h.data_checkin, h.data_checkout, h.numero_quarto,
      h.custo_diaria, h.moeda, h.escala_id, h.observacoes,
      h.created_at, h.updated_at,
      f.nome   AS funcionario_nome,
      f.matricula AS funcionario_matricula
    FROM hospedagem h
    LEFT JOIN funcionarios f ON h.funcionario_id = f.id
    WHERE h.deleted_at IS NULL
      AND h.empresa_id = ?
  `;
  const bindings: unknown[] = [empresa_id];

  if (funcionario_id) {
    query += ' AND h.funcionario_id = ?';
    bindings.push(parseInt(funcionario_id));
  }
  if (tipo) {
    query += ' AND h.tipo = ?';
    bindings.push(tipo.toUpperCase());
  }
  if (data_inicio) {
    query += ' AND h.data_checkin >= ?';
    bindings.push(data_inicio);
  }
  if (data_fim) {
    query += ' AND h.data_checkin <= ?';
    bindings.push(data_fim);
  }
  if (ativo === '1') {
    query += ' AND h.data_checkout IS NULL';
  } else if (ativo === '0') {
    query += ' AND h.data_checkout IS NOT NULL';
  }

  query += ' ORDER BY h.data_checkin DESC LIMIT 500';

  const result = await db
    .prepare(query)
    .bind(...bindings)
    .all();

  const response: ApiResponse = { success: true, data: result.results ?? [] };
  return c.json(response);
});

// ─── Single ── GET /api/hospedagem/:id ───────────────────────────────────────

app.get('/:id', async (c) => {
  const db = c.env.DB;
  const empresa_id = getEmpresaId(c);
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) return badRequest('ID inválido');

  const row = await db
    .prepare(
      `
    SELECT h.*, f.nome AS funcionario_nome, f.matricula AS funcionario_matricula
    FROM hospedagem h
    LEFT JOIN funcionarios f ON h.funcionario_id = f.id
    WHERE h.id = ? AND h.empresa_id = ? AND h.deleted_at IS NULL
  `,
    )
    .bind(id, empresa_id)
    .first();

  if (!row) return notFound('Hospedagem não encontrada');

  return c.json({ success: true, data: row } as ApiResponse);
});

// ─── Dashboard stats ── GET /api/hospedagem/stats ────────────────────────────

app.get('/stats/resumo', async (c) => {
  const db = c.env.DB;
  const empresa_id = getEmpresaId(c);

  const stats = await db
    .prepare(
      `
    SELECT
      COUNT(*)                                           AS total,
      SUM(CASE WHEN data_checkout IS NULL THEN 1 ELSE 0 END)  AS ativos,
      SUM(CASE WHEN tipo = 'HOTEL'      AND deleted_at IS NULL THEN 1 ELSE 0 END) AS total_hotel,
      SUM(CASE WHEN tipo = 'PLATAFORMA' AND deleted_at IS NULL THEN 1 ELSE 0 END) AS total_plataforma,
      SUM(CASE WHEN tipo = 'BASE'       AND deleted_at IS NULL THEN 1 ELSE 0 END) AS total_base,
      SUM(CASE WHEN tipo = 'OUTRO'      AND deleted_at IS NULL THEN 1 ELSE 0 END) AS total_outro
    FROM hospedagem
    WHERE empresa_id = ? AND deleted_at IS NULL
  `,
    )
    .bind(empresa_id)
    .first();

  return c.json({ success: true, data: stats } as ApiResponse);
});

// ─── Create ── POST /api/hospedagem ──────────────────────────────────────────

app.post('/', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresa_id = getEmpresaId(c);
  const body = await c.req.json();

  const parsed = HospedagemCreateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
  }
  const d = parsed.data;

  // Validate funcionário exists in same empresa
  const func = await db
    .prepare('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
    .bind(d.funcionario_id, empresa_id)
    .first();
  if (!func) return badRequest('Funcionário não encontrado');

  // Date logic
  if (d.data_checkout && d.data_checkout < d.data_checkin) {
    return badRequest('Data de checkout não pode ser anterior ao checkin');
  }

  const result = await db
    .prepare(
      `
    INSERT INTO hospedagem
      (empresa_id, funcionario_id, tipo, local, cidade, estado,
       data_checkin, data_checkout, numero_quarto, custo_diaria, moeda,
       escala_id, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .bind(
      empresa_id,
      d.funcionario_id,
      d.tipo,
      d.local,
      d.cidade ?? null,
      d.estado ?? null,
      d.data_checkin,
      d.data_checkout ?? null,
      d.numero_quarto ?? null,
      d.custo_diaria ?? null,
      d.moeda,
      d.escala_id ?? null,
      d.observacoes ?? null,
    )
    .run();

  const id = result.meta.last_row_id;
  const created = await db.prepare('SELECT * FROM hospedagem WHERE id = ?').bind(id).first();

  await registrarAuditoria({
    db,
    tabela: 'hospedagem',
    acao: 'INSERT',
    registro_id: String(id),
    dados_novos: created,
  });

  return c.json(
    { success: true, data: { id }, message: 'Hospedagem registrada com sucesso' } as ApiResponse<{
      id: number;
    }>,
    201,
  );
});

// ─── Update ── PUT /api/hospedagem/:id ───────────────────────────────────────

app.put('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresa_id = getEmpresaId(c);
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) return badRequest('ID inválido');

  const existing = await db
    .prepare('SELECT * FROM hospedagem WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
    .bind(id, empresa_id)
    .first();
  if (!existing) return notFound('Hospedagem não encontrada');

  const body = await c.req.json();
  const parsed = HospedagemUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join('; '));
  }
  const d = parsed.data;

  const updates: string[] = ["updated_at = datetime('now')"];
  const bindings: unknown[] = [];

  const fields: Array<[string, unknown]> = [
    ['tipo', d.tipo],
    ['local', d.local],
    ['cidade', d.cidade],
    ['estado', d.estado],
    ['data_checkin', d.data_checkin],
    ['data_checkout', d.data_checkout],
    ['numero_quarto', d.numero_quarto],
    ['custo_diaria', d.custo_diaria],
    ['moeda', d.moeda],
    ['escala_id', d.escala_id],
    ['observacoes', d.observacoes],
  ];

  for (const [col, val] of fields) {
    if (val !== undefined) {
      updates.push(`${col} = ?`);
      bindings.push(val ?? null);
    }
  }

  await db
    .prepare(`UPDATE hospedagem SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...bindings, id)
    .run();

  const updated = await db.prepare('SELECT * FROM hospedagem WHERE id = ?').bind(id).first();
  await registrarAuditoria({
    db,
    tabela: 'hospedagem',
    acao: 'UPDATE',
    registro_id: String(id),
    dados_anteriores: existing,
    dados_novos: updated,
  });

  return c.json({ success: true, message: 'Hospedagem atualizada com sucesso' } as ApiResponse);
});

// ─── Checkout rápido ── PATCH /api/hospedagem/:id/checkout ──────────────────

interface HospedagemRow {
  id: number;
  data_checkin: string;
  data_checkout: string | null;
}

app.patch('/:id/checkout', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresa_id = getEmpresaId(c);
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) return badRequest('ID inválido');

  const existing = await db
    .prepare('SELECT * FROM hospedagem WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
    .bind(id, empresa_id)
    .first<HospedagemRow>();
  if (!existing) return notFound('Hospedagem não encontrada');
  if (existing.data_checkout) return badRequest('Checkout já realizado');

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const data_checkout = (body.data_checkout as string) ?? new Date().toISOString().split('T')[0];

  if (data_checkout < existing.data_checkin) {
    return badRequest('Data de checkout anterior ao checkin');
  }

  await db
    .prepare("UPDATE hospedagem SET data_checkout = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(data_checkout, id)
    .run();

  return c.json({ success: true, message: 'Checkout registrado' } as ApiResponse);
});

// ─── Delete (soft) ── DELETE /api/hospedagem/:id ─────────────────────────────

app.delete('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresa_id = getEmpresaId(c);
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) return badRequest('ID inválido');

  const existing = await db
    .prepare('SELECT * FROM hospedagem WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
    .bind(id, empresa_id)
    .first();
  if (!existing) return notFound('Hospedagem não encontrada');

  await db
    .prepare(
      "UPDATE hospedagem SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    )
    .bind(id)
    .run();

  await registrarAuditoria({
    db,
    tabela: 'hospedagem',
    acao: 'DELETE',
    registro_id: String(id),
    dados_anteriores: existing,
  });

  return c.json({ success: true, message: 'Hospedagem removida' } as ApiResponse);
});

export default app;
