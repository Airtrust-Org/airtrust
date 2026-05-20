/**
 * EVD — Escala de Voo Diária (PRC-OPS-009 §4.3)
 *
 * CRUD + validações operacionais:
 *   - Repouso mínimo 12h30 (§6.1.6)
 *   - Composição de tripulação (delegada a escalas-tripulacoes)
 *   - Vinculação com EST mensal (escala_id)
 *
 * Endpoints:
 *   GET    /api/evd?data=YYYY-MM-DD             — listar voos do dia
 *   GET    /api/evd/:id                          — detalhe
 *   POST   /api/evd                              — criar voo
 *   PUT    /api/evd/:id                          — atualizar voo
 *   DELETE /api/evd/:id                          — soft delete
 *   POST   /api/evd/:id/publicar                 — mudar status para PUBLICADA
 *   GET    /api/evd/semana?inicio=YYYY-MM-DD     — visão semanal
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import type { D1Database } from '@cloudflare/workers-types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';

const evdRoutes = new Hono<{ Bindings: Env }>();

evdRoutes.use('*', auth());

const REPOUSO_MINIMO_MIN = 12 * 60 + 30; // 12h30 em minutos (PRC-OPS-009 §6.1.6)

const evdCreateSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  escala_id: z.string().optional(),
  pic_id: z.number().int().optional(),
  sic_id: z.number().int().optional(),
  pic_funcao: z.string().optional(),
  sic_funcao: z.string().optional(),
  aeronave_prefixo: z.string().optional(),
  aeronave_modelo: z.string().optional(),
  hora_apresentacao: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  hora_decolagem_prevista: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  hora_pouso_previsto: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  hora_decolagem_real: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  hora_pouso_real: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  hora_corte_motor: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  origem: z.string().optional(),
  destino: z.string().optional(),
  tipo_missao: z.enum(['OFFSHORE', 'INSTRUCAO', 'CHECK', 'FERRY', 'OUTRO']).default('OFFSHORE'),
  observacoes: z.string().optional(),
});

// Helper: calcular repouso desde último corte motor
async function calcRepouso(
  db: D1Database,
  empresaId: number,
  pilotoId: number,
  dataVoo: string,
  horaApresentacao: string | undefined,
): Promise<{ minutos: number | null; ok: boolean }> {
  if (!horaApresentacao) return { minutos: null, ok: true };

  // Buscar último corte motor deste piloto (EVD ou FRMS jornada)
  const ultimoCorte = await db
    .prepare(
      `SELECT hora_corte_motor, data FROM (
         SELECT hora_corte_motor, data FROM escala_voo_diaria
         WHERE (pic_id = ? OR sic_id = ?) AND deleted_at IS NULL
           AND empresa_id = ? AND data < ?
         UNION ALL
         SELECT hora_corte_motor, data FROM frms_jornada
         WHERE CAST(tripulante_id AS INTEGER) = ? AND deleted_at IS NULL AND data < ?
       ) ORDER BY data DESC, hora_corte_motor DESC LIMIT 1`,
    )
    .bind(pilotoId, pilotoId, empresaId, dataVoo, pilotoId, dataVoo)
    .first<{ hora_corte_motor: string | null; data: string }>();

  if (!ultimoCorte?.hora_corte_motor) return { minutos: null, ok: true };

  const [ch, cm] = ultimoCorte.hora_corte_motor.split(':').map(Number);
  const [ah, am] = horaApresentacao.split(':').map(Number);

  // Se datas diferentes, calcular diferença em minutos
  const corteDate = new Date(`${ultimoCorte.data}T${ultimoCorte.hora_corte_motor}:00`);
  const apresDate = new Date(`${dataVoo}T${horaApresentacao}:00`);
  const diffMinutos = Math.floor((apresDate.getTime() - corteDate.getTime()) / 60000);

  return {
    minutos: diffMinutos > 0 ? diffMinutos : null,
    ok: diffMinutos >= REPOUSO_MINIMO_MIN,
  };
}

// GET /api/evd?data=YYYY-MM-DD
evdRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const data = c.req.query('data');

  if (!data) {
    return c.json({ success: false, error: 'Parâmetro obrigatório: data (YYYY-MM-DD)' }, 400);
  }

  const voos = await db
    .prepare(
      `SELECT
         e.*,
         fp.nome AS pic_nome, fp.guerra AS pic_guerra,
         fs.nome AS sic_nome, fs.guerra AS sic_guerra
       FROM escala_voo_diaria e
       LEFT JOIN funcionarios fp ON fp.id = e.pic_id
       LEFT JOIN funcionarios fs ON fs.id = e.sic_id
       WHERE e.empresa_id = ? AND e.data = ? AND e.deleted_at IS NULL
       ORDER BY e.hora_apresentacao ASC, e.hora_decolagem_prevista ASC`,
    )
    .bind(empresaId, data)
    .all();

  return c.json({ success: true, data: voos.results || [] });
});

// GET /api/evd/semana?inicio=YYYY-MM-DD
evdRoutes.get('/semana', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const inicio = c.req.query('inicio');

  if (!inicio) {
    return c.json({ success: false, error: 'Parâmetro obrigatório: inicio (YYYY-MM-DD)' }, 400);
  }

  // 7 dias a partir de inicio
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);
  const fimStr = fim.toISOString().slice(0, 10);

  const voos = await db
    .prepare(
      `SELECT
         e.*,
         fp.nome AS pic_nome, fp.guerra AS pic_guerra,
         fs.nome AS sic_nome, fs.guerra AS sic_guerra
       FROM escala_voo_diaria e
       LEFT JOIN funcionarios fp ON fp.id = e.pic_id
       LEFT JOIN funcionarios fs ON fs.id = e.sic_id
       WHERE e.empresa_id = ? AND e.data BETWEEN ? AND ? AND e.deleted_at IS NULL
       ORDER BY e.data ASC, e.hora_apresentacao ASC`,
    )
    .bind(empresaId, inicio, fimStr)
    .all();

  return c.json({ success: true, data: voos.results || [] });
});

// GET /api/evd/:id
evdRoutes.get('/:id', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');

  const voo = await db
    .prepare(
      `SELECT
         e.*,
         fp.nome AS pic_nome, fp.guerra AS pic_guerra,
         fs.nome AS sic_nome, fs.guerra AS sic_guerra
       FROM escala_voo_diaria e
       LEFT JOIN funcionarios fp ON fp.id = e.pic_id
       LEFT JOIN funcionarios fs ON fs.id = e.sic_id
       WHERE e.id = ? AND e.empresa_id = ? AND e.deleted_at IS NULL`,
    )
    .bind(id, empresaId)
    .first();

  if (!voo) return c.json({ success: false, error: 'Voo não encontrado' }, 404);
  return c.json({ success: true, data: voo });
});

// POST /api/evd
evdRoutes.post('/', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const body = await c.req.json();
  const parsed = evdCreateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
      400,
    );
  }

  const d = parsed.data;
  const warnings: string[] = [];

  // Validação de repouso para PIC
  if (d.pic_id) {
    const repPic = await calcRepouso(db, empresaId, d.pic_id, d.data, d.hora_apresentacao);
    if (repPic.minutos !== null && !repPic.ok) {
      warnings.push(
        `PIC: repouso insuficiente (${Math.floor(repPic.minutos / 60)}h${repPic.minutos % 60}m < 12h30 mínimo)`,
      );
    }
  }

  // Validação de repouso para SIC
  if (d.sic_id) {
    const repSic = await calcRepouso(db, empresaId, d.sic_id, d.data, d.hora_apresentacao);
    if (repSic.minutos !== null && !repSic.ok) {
      warnings.push(
        `SIC: repouso insuficiente (${Math.floor(repSic.minutos / 60)}h${repSic.minutos % 60}m < 12h30 mínimo)`,
      );
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Calc repouso for storage
  let repousoMinutos: number | null = null;
  let repousoOk = 1;
  if (d.pic_id && d.hora_apresentacao) {
    const r = await calcRepouso(db, empresaId, d.pic_id, d.data, d.hora_apresentacao);
    repousoMinutos = r.minutos;
    repousoOk = r.ok ? 1 : 0;
  }

  await db
    .prepare(
      `INSERT INTO escala_voo_diaria (
         id, empresa_id, escala_id, data, status,
         pic_id, sic_id, pic_funcao, sic_funcao,
         aeronave_prefixo, aeronave_modelo,
         hora_apresentacao, hora_decolagem_prevista, hora_pouso_previsto,
         hora_decolagem_real, hora_pouso_real, hora_corte_motor,
         repouso_anterior_minutos, repouso_minimo_ok,
         origem, destino, tipo_missao, observacoes,
         criado_por, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'RASCUNHO',
         ?, ?, ?, ?,
         ?, ?,
         ?, ?, ?,
         ?, ?, ?,
         ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?)`,
    )
    .bind(
      id,
      empresaId,
      d.escala_id || null,
      d.data,
      d.pic_id || null,
      d.sic_id || null,
      d.pic_funcao || null,
      d.sic_funcao || null,
      d.aeronave_prefixo || null,
      d.aeronave_modelo || null,
      d.hora_apresentacao || null,
      d.hora_decolagem_prevista || null,
      d.hora_pouso_previsto || null,
      d.hora_decolagem_real || null,
      d.hora_pouso_real || null,
      d.hora_corte_motor || null,
      repousoMinutos,
      repousoOk,
      d.origem || null,
      d.destino || null,
      d.tipo_missao,
      d.observacoes || null,
      null,
      now,
      now,
    )
    .run();

  return c.json({ success: true, data: { id, warnings } }, 201);
});

// PUT /api/evd/:id
evdRoutes.put('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await db
    .prepare(
      'SELECT id, status FROM escala_voo_diaria WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(id, empresaId)
    .first<{ id: string; status: string }>();

  if (!existing) return c.json({ success: false, error: 'Voo não encontrado' }, 404);

  const fields: string[] = [];
  const values: unknown[] = [];

  const allowed = [
    'data',
    'pic_id',
    'sic_id',
    'pic_funcao',
    'sic_funcao',
    'aeronave_prefixo',
    'aeronave_modelo',
    'hora_apresentacao',
    'hora_decolagem_prevista',
    'hora_pouso_previsto',
    'hora_decolagem_real',
    'hora_pouso_real',
    'hora_corte_motor',
    'origem',
    'destino',
    'tipo_missao',
    'observacoes',
  ];

  for (const key of allowed) {
    if (key in body) {
      fields.push(`${key} = ?`);
      values.push(body[key] ?? null);
    }
  }

  if (fields.length === 0) {
    return c.json({ success: false, error: 'Nenhum campo para atualizar' }, 400);
  }

  fields.push('updated_at = ?');
  values.push(new Date().toISOString().replace('T', ' ').slice(0, 19));
  values.push(id);
  values.push(empresaId);

  await db
    .prepare(
      `UPDATE escala_voo_diaria SET ${fields.join(', ')} WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(...values)
    .run();

  return c.json({ success: true });
});

// DELETE /api/evd/:id
evdRoutes.delete('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const res = await db
    .prepare(
      'UPDATE escala_voo_diaria SET deleted_at = ?, updated_at = ? WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(now, now, id, empresaId)
    .run();

  if (!res.meta?.changes) return c.json({ success: false, error: 'Voo não encontrado' }, 404);
  return c.json({ success: true });
});

// POST /api/evd/:id/publicar
evdRoutes.post('/:id/publicar', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');

  const voo = await db
    .prepare(
      'SELECT id, status, pic_id, sic_id, repouso_minimo_ok FROM escala_voo_diaria WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(id, empresaId)
    .first<{
      id: string;
      status: string;
      pic_id: number | null;
      sic_id: number | null;
      repouso_minimo_ok: number;
    }>();

  if (!voo) return c.json({ success: false, error: 'Voo não encontrado' }, 404);
  if (voo.status === 'PUBLICADA') return c.json({ success: false, error: 'Voo já publicado' }, 400);

  // Block publication if rest violation
  if (voo.repouso_minimo_ok === 0) {
    return c.json(
      {
        success: false,
        error: 'Não é possível publicar: violação de repouso mínimo 12h30 (PRC-OPS-009 §6.1.6)',
      },
      400,
    );
  }

  // Check tripulação
  if (!voo.pic_id || !voo.sic_id) {
    return c.json({ success: false, error: 'Tripulação incompleta (PIC e SIC obrigatórios)' }, 400);
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  await db
    .prepare(
      "UPDATE escala_voo_diaria SET status = 'PUBLICADA', aprovado_em = ?, updated_at = ? WHERE id = ? AND empresa_id = ?",
    )
    .bind(now, now, id, empresaId)
    .run();

  return c.json({ success: true });
});

export default evdRoutes;
