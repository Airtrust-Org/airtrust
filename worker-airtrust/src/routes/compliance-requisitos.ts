/**
 * Requisitos de Compliance por Função
 *
 * CRUD para a tabela requisitos_compliance.
 * Cada requisito define que uma determinada função (ex: 'Comandante') exige
 * um recurso específico (qualificação, licença ou curso LMS) para estar conforme.
 *
 * Endpoints:
 *   GET    /api/compliance/requisitos                — listar todos (filtro por funcao)
 *   POST   /api/compliance/requisitos                — criar
 *   PUT    /api/compliance/requisitos/:id            — atualizar
 *   DELETE /api/compliance/requisitos/:id            — soft delete
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { ApiError } from '../middleware/error-handler';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth());

const RequisitoCriarSchema = z.object({
  funcao: z.string().min(1).max(200),
  tipo_recurso: z.enum(['qualificacao', 'licenca', 'curso_lms']),
  referencia: z.string().min(1).max(200),
  descricao: z.string().max(500).optional().nullable(),
  obrigatorio: z.number().int().min(0).max(1).default(1),
});

// GET /api/compliance/requisitos — listar
app.get('/requisitos', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const funcao = c.req.query('funcao');

  let sql = `
    SELECT r.*, lc.titulo AS lms_curso_titulo
    FROM requisitos_compliance r
    LEFT JOIN lms_cursos lc
      ON r.tipo_recurso = 'curso_lms'
     AND CAST(r.referencia AS INTEGER) = lc.id
     AND lc.deleted_at IS NULL
    WHERE r.empresa_id = ? AND r.deleted_at IS NULL
  `;
  const params: unknown[] = [empresaId];

  if (funcao) {
    sql += ' AND r.funcao = ?';
    params.push(funcao);
  }

  sql += ' ORDER BY r.funcao, r.tipo_recurso, r.referencia';

  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all();

  return c.json({ success: true, data: results || [] });
});

// GET /api/compliance/requisitos/funcoes — lista funções distintas com requisitos
app.get('/requisitos/funcoes', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  const { results } = await db
    .prepare(
      `SELECT DISTINCT funcao, COUNT(*) AS total_requisitos
       FROM requisitos_compliance
       WHERE empresa_id = ? AND deleted_at IS NULL
       GROUP BY funcao
       ORDER BY funcao`,
    )
    .bind(empresaId)
    .all();

  return c.json({ success: true, data: results || [] });
});

// POST /api/compliance/requisitos — criar
app.post('/requisitos', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  const body = await c.req.json<unknown>();
  const parsed = RequisitoCriarSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
  }

  const { funcao, tipo_recurso, referencia, descricao, obrigatorio } = parsed.data;

  // verificar duplicidade
  const existente = await db
    .prepare(
      `SELECT id FROM requisitos_compliance
       WHERE empresa_id = ? AND funcao = ? AND tipo_recurso = ? AND referencia = ? AND deleted_at IS NULL`,
    )
    .bind(empresaId, funcao, tipo_recurso, referencia)
    .first<{ id: number }>();

  if (existente) {
    throw new ApiError('Requisito idêntico já existe para esta função', 409);
  }

  const result = await db
    .prepare(
      `INSERT INTO requisitos_compliance (empresa_id, funcao, tipo_recurso, referencia, descricao, obrigatorio)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(empresaId, funcao, tipo_recurso, referencia, descricao ?? null, obrigatorio)
    .run();

  const created = await db
    .prepare('SELECT * FROM requisitos_compliance WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first();

  return c.json({ success: true, data: created }, 201);
});

// PUT /api/compliance/requisitos/:id — atualizar
app.put('/requisitos/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = Number(c.req.param('id'));

  const existing = await db
    .prepare(
      'SELECT id FROM requisitos_compliance WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(id, empresaId)
    .first<{ id: number }>();
  if (!existing) throw new ApiError('Requisito não encontrado', 404);

  const body = await c.req.json<unknown>();
  const parsed = RequisitoCriarSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
  }

  const { funcao, tipo_recurso, referencia, descricao, obrigatorio } = parsed.data;

  await db
    .prepare(
      `UPDATE requisitos_compliance
       SET funcao = ?, tipo_recurso = ?, referencia = ?, descricao = ?, obrigatorio = ?, updated_at = datetime('now')
       WHERE id = ? AND empresa_id = ?`,
    )
    .bind(funcao, tipo_recurso, referencia, descricao ?? null, obrigatorio, id, empresaId)
    .run();

  const updated = await db
    .prepare('SELECT * FROM requisitos_compliance WHERE id = ?')
    .bind(id)
    .first();

  return c.json({ success: true, data: updated });
});

// DELETE /api/compliance/requisitos/:id — soft delete
app.delete('/requisitos/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = Number(c.req.param('id'));

  const existing = await db
    .prepare(
      'SELECT id FROM requisitos_compliance WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(id, empresaId)
    .first<{ id: number }>();
  if (!existing) throw new ApiError('Requisito não encontrado', 404);

  await db
    .prepare(
      "UPDATE requisitos_compliance SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL",
    )
    .bind(id, empresaId)
    .run();

  return c.json({ success: true, data: { id, deleted: true } });
});

export default app;
