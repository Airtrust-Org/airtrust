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

const MSG_PUBLISH_CREW_REQUIRED = 'PIC e SIC são obrigatórios para publicar.';
const MSG_PIC_SIC_SAME = 'PIC e SIC não podem ser o mesmo tripulante.';
const MSG_DUPLICATE_CREW =
  'Tripulante já alocado em outra escala diária na mesma data/intervalo.';
const MSG_REST_INVALID = 'Repouso mínimo não atendido.';

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

type EvdTripulacaoConflitoRow = {
  id: string;
  pic_id: number | null;
  sic_id: number | null;
  hora_apresentacao: string | null;
  hora_decolagem_prevista: string | null;
  hora_pouso_previsto: string | null;
};

type EvdTimeWindowSource = {
  hora_apresentacao?: string | null;
  hora_decolagem_prevista?: string | null;
  hora_pouso_previsto?: string | null;
};

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hh, mm] = value.split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return hh * 60 + mm;
}

function buildTimeWindow(source: EvdTimeWindowSource): { start: number; end: number } | null {
  const start =
    parseTimeToMinutes(source.hora_apresentacao) ??
    parseTimeToMinutes(source.hora_decolagem_prevista);
  const endRaw =
    parseTimeToMinutes(source.hora_pouso_previsto) ??
    parseTimeToMinutes(source.hora_decolagem_prevista) ??
    parseTimeToMinutes(source.hora_apresentacao);

  if (start == null || endRaw == null) return null;
  let end = endRaw;
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function timeWindowsOverlap(
  a: EvdTimeWindowSource,
  b: EvdTimeWindowSource,
): boolean {
  const wa = buildTimeWindow(a);
  const wb = buildTimeWindow(b);
  // Regra conservadora: se faltarem horários suficientes, considera sobreposição.
  if (!wa || !wb) return true;
  return wa.start < wb.end && wb.start < wa.end;
}

async function hasCrewConflict(params: {
  db: D1Database;
  empresaId: number;
  data: string;
  picId: number | null;
  sicId: number | null;
  window: EvdTimeWindowSource;
  excludeId?: string;
}): Promise<boolean> {
  const crewIds = [params.picId, params.sicId].filter(
    (id): id is number => typeof id === 'number' && Number.isFinite(id),
  );
  if (crewIds.length === 0) return false;

  const placeholders = crewIds.map(() => '?').join(', ');
  const bindings: unknown[] = [params.empresaId, params.data, ...crewIds, ...crewIds];
  let excludeSql = '';
  if (params.excludeId) {
    excludeSql = 'AND id != ?';
    bindings.push(params.excludeId);
  }

  const rows = await params.db
    .prepare(
      `SELECT id, pic_id, sic_id, hora_apresentacao, hora_decolagem_prevista, hora_pouso_previsto
         FROM escala_voo_diaria
        WHERE empresa_id = ?
          AND data = ?
          AND deleted_at IS NULL
          AND UPPER(COALESCE(status, 'RASCUNHO')) != 'CANCELADA'
          AND (
            pic_id IN (${placeholders})
            OR sic_id IN (${placeholders})
          )
          ${excludeSql}`,
    )
    .bind(...bindings)
    .all<EvdTripulacaoConflitoRow>();

  for (const row of rows.results || []) {
    const overlap = timeWindowsOverlap(params.window, row);
    if (!overlap) continue;
    const sameCrew =
      crewIds.includes(Number(row.pic_id)) || crewIds.includes(Number(row.sic_id));
    if (sameCrew) return true;
  }
  return false;
}

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
  if (d.pic_id && d.sic_id && d.pic_id === d.sic_id) {
    return c.json({ success: false, error: MSG_PIC_SIC_SAME }, 400);
  }

  const hasConflict = await hasCrewConflict({
    db,
    empresaId,
    data: d.data,
    picId: d.pic_id ?? null,
    sicId: d.sic_id ?? null,
    window: {
      hora_apresentacao: d.hora_apresentacao,
      hora_decolagem_prevista: d.hora_decolagem_prevista,
      hora_pouso_previsto: d.hora_pouso_previsto,
    },
  });
  if (hasConflict) {
    return c.json({ success: false, error: MSG_DUPLICATE_CREW }, 409);
  }

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

  const nextPicId =
    'pic_id' in body ? (body.pic_id == null ? null : Number(body.pic_id)) : null;
  const nextSicId =
    'sic_id' in body ? (body.sic_id == null ? null : Number(body.sic_id)) : null;
  if (
    typeof nextPicId === 'number' &&
    typeof nextSicId === 'number' &&
    Number.isFinite(nextPicId) &&
    Number.isFinite(nextSicId) &&
    nextPicId === nextSicId
  ) {
    return c.json({ success: false, error: MSG_PIC_SIC_SAME }, 400);
  }

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
      `SELECT id, status, data, pic_id, sic_id, repouso_minimo_ok,
              hora_apresentacao, hora_decolagem_prevista, hora_pouso_previsto
         FROM escala_voo_diaria
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, empresaId)
    .first<{
      id: string;
      status: string;
      data: string;
      pic_id: number | null;
      sic_id: number | null;
      repouso_minimo_ok: number;
      hora_apresentacao: string | null;
      hora_decolagem_prevista: string | null;
      hora_pouso_previsto: string | null;
    }>();

  if (!voo) return c.json({ success: false, error: 'Voo não encontrado' }, 404);
  if (voo.status === 'PUBLICADA') return c.json({ success: false, error: 'Voo já publicado' }, 400);

  if (!voo.pic_id || !voo.sic_id) {
    return c.json({ success: false, error: MSG_PUBLISH_CREW_REQUIRED }, 400);
  }

  if (voo.pic_id === voo.sic_id) {
    return c.json({ success: false, error: MSG_PIC_SIC_SAME }, 400);
  }

  const conflictOnPublish = await hasCrewConflict({
    db,
    empresaId,
    data: voo.data,
    picId: voo.pic_id,
    sicId: voo.sic_id,
    window: {
      hora_apresentacao: voo.hora_apresentacao,
      hora_decolagem_prevista: voo.hora_decolagem_prevista,
      hora_pouso_previsto: voo.hora_pouso_previsto,
    },
    excludeId: voo.id,
  });
  if (conflictOnPublish) {
    return c.json({ success: false, error: MSG_DUPLICATE_CREW }, 409);
  }

  // Block publication if rest violation
  if (voo.repouso_minimo_ok === 0) {
    return c.json({ success: false, error: MSG_REST_INVALID }, 400);
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
