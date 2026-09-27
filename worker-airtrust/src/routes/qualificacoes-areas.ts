import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

type AreaRow = {
  id: number;
  empresa_id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo: number;
  created_at: string;
  updated_at: string | null;
};

function normalizeCode(value: unknown, fallbackName: string): string {
  const source = String(value || '').trim() || fallbackName;
  return source
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}
app.get('/', async (c) => {
  const empresaId = getEmpresaId(c);
  const apenasAtivas = c.req.query('ativo') === '1';
  const conditions = ['empresa_id = ?', 'deleted_at IS NULL'];
  if (apenasAtivas) conditions.push('ativo = 1');

  const result = await c.env.DB.prepare(
    `SELECT id, empresa_id, codigo, nome, descricao, ativo, created_at, updated_at
         FROM qualificacoes_areas
        WHERE ${conditions.join(' AND ')}
        ORDER BY nome COLLATE NOCASE ASC`,
  )
    .bind(empresaId)
    .all<AreaRow>();

  return c.json({
    success: true,
    data: (result.results || []).map((row) => ({ ...row, ativo: Number(row.ativo) === 1 })),
  });
});

app.post('/', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaId(c);
  const body = (await c.req.json()) as Record<string, unknown>;
  const nome = String(body.nome || '').trim();
  if (!nome) return c.json({ success: false, error: 'Nome é obrigatório' }, 400);
  const codigo = normalizeCode(body.codigo, nome);
  if (!codigo) return c.json({ success: false, error: 'Código é obrigatório' }, 400);

  const duplicate = await c.env.DB.prepare(
    `SELECT id FROM qualificacoes_areas
        WHERE empresa_id = ? AND deleted_at IS NULL
          AND (UPPER(TRIM(nome)) = UPPER(TRIM(?)) OR UPPER(TRIM(codigo)) = UPPER(TRIM(?)))
        LIMIT 1`,
  )
    .bind(empresaId, nome, codigo)
    .first();
  if (duplicate) {
    return c.json({ success: false, error: 'Área da qualificação já existe' }, 409);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO qualificacoes_areas
         (empresa_id, codigo, nome, descricao, ativo, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'), NULL)`,
  )
    .bind(
      empresaId,
      codigo,
      nome,
      body.descricao == null ? null : String(body.descricao).trim() || null,
    )
    .run();

  const created = await c.env.DB.prepare(
    `SELECT id, empresa_id, codigo, nome, descricao, ativo, created_at, updated_at
         FROM qualificacoes_areas WHERE id = ? AND empresa_id = ? LIMIT 1`,
  )
    .bind(result.meta.last_row_id, empresaId)
    .first<AreaRow>();

  return c.json({ success: true, data: created ? { ...created, ativo: true } : null }, 201);
});

app.put('/:id', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getEmpresaId(c);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }
  const body = (await c.req.json()) as Record<string, unknown>;
  const current = await c.env.DB.prepare(
    `SELECT id, empresa_id, nome, codigo, descricao, ativo, created_at, updated_at
         FROM qualificacoes_areas
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
  )
    .bind(id, empresaId)
    .first<AreaRow>();
  if (!current) {
    return c.json({ success: false, error: 'Área da qualificação não encontrada' }, 404);
  }
  const nome = body.nome === undefined ? current.nome : String(body.nome || '').trim();
  if (!nome) return c.json({ success: false, error: 'Nome é obrigatório' }, 400);
  const codigo = body.codigo === undefined ? current.codigo : normalizeCode(body.codigo, nome);
  const descricao =
    body.descricao === undefined ? current.descricao : String(body.descricao || '').trim() || null;
  const ativo = body.ativo === undefined ? Number(current.ativo) : body.ativo ? 1 : 0;

  if (ativo === 0 && Number(current.ativo) === 1) {
    const referenced = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM qualificacoes_tipos
        WHERE empresa_id = ? AND area_id = ? AND deleted_at IS NULL`,
    )
      .bind(empresaId, id)
      .first<{ total: number }>();
    if (Number(referenced?.total || 0) > 0) {
      return c.json(
        { success: false, error: 'Área em uso por modelos de qualificação não pode ser inativada' },
        409,
      );
    }
  }

  const duplicate = await c.env.DB.prepare(
    `SELECT id FROM qualificacoes_areas
        WHERE empresa_id = ? AND id <> ? AND deleted_at IS NULL
          AND (UPPER(TRIM(nome)) = UPPER(TRIM(?)) OR UPPER(TRIM(codigo)) = UPPER(TRIM(?)))
        LIMIT 1`,
  )
    .bind(empresaId, id, nome, codigo)
    .first();
  if (duplicate) {
    return c.json({ success: false, error: 'Área da qualificação já existe' }, 409);
  }

  await c.env.DB.prepare(
    `UPDATE qualificacoes_areas
          SET nome = ?, codigo = ?, descricao = ?, ativo = ?, updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
  )
    .bind(nome, codigo, descricao, ativo, id, empresaId)
    .run();
  const updated = await c.env.DB.prepare(
    `SELECT id, empresa_id, codigo, nome, descricao, ativo, created_at, updated_at
         FROM qualificacoes_areas WHERE id = ? AND empresa_id = ? LIMIT 1`,
  )
    .bind(id, empresaId)
    .first<AreaRow>();

  return c.json({
    success: true,
    data: updated ? { ...updated, ativo: Number(updated.ativo) === 1 } : null,
  });
});

app.delete('/:id', requireRole('admin'), async (c) => {
  const empresaId = getEmpresaId(c);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  const referenced = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM qualificacoes_tipos
        WHERE empresa_id = ? AND area_id = ? AND deleted_at IS NULL`,
  )
    .bind(empresaId, id)
    .first<{ total: number }>();

  if (Number(referenced?.total || 0) > 0) {
    return c.json(
      { success: false, error: 'Área vinculada a modelos de qualificação e não pode ser excluída' },
      409,
    );
  }

  const result = await c.env.DB.prepare(
    `UPDATE qualificacoes_areas
          SET ativo = 0, deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
  )
    .bind(id, empresaId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ success: false, error: 'Área da qualificação não encontrada' }, 404);
  }
  return c.json({ success: true });
});

export default app;
