/**
 * QUALIFICACOES — MÓDULO FORMATOS
 * Gestão de formatos/modalidades de qualificação.
 *
 * Formato = modalidade de execução/registro de uma qualificação.
 * Exemplos: EAD, Presencial, Remoto, Voo, Simulador, Prático, Documental.
 * Não confundir com tipo_conteudo do LMS (scorm/h5p/pdf/pptx/video = mídia técnica).
 *
 * Endpoints:
 *   GET    /formatos         - Lista formatos da empresa
 *   GET    /formatos/:id     - Detalhe de um formato
 *   POST   /formatos         - Cria formato (admin)
 *   PUT    /formatos/:id     - Atualiza formato (admin)
 *   DELETE /formatos/:id     - Soft delete (admin)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../types';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { getTenantContext } from '../../middleware/tenant';
import { ApiError } from '../../middleware/error-handler';

type FormatoRow = {
  id: number;
  nome: string;
  codigo: string;
  descricao: string | null;
  cor: string | null;
  ativo: number;
  empresa_id: number;
  created_at: string;
  updated_at: string | null;
  total_tipos?: number | null;
};

const createFormatoSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório (mínimo 2 caracteres)'),
  codigo: z.string().min(1, 'Código obrigatório').regex(/^[A-Z0-9_]+$/, 'Código deve ser maiúsculo sem espaços (A-Z, 0-9, _)'),
  descricao: z.string().nullable().optional(),
  cor: z.string().nullable().optional(),
  ativo: z.union([z.boolean(), z.number()]).optional().default(true),
});

const updateFormatoSchema = z.object({
  nome: z.string().min(2).optional(),
  descricao: z.string().nullable().optional(),
  cor: z.string().nullable().optional(),
  ativo: z.union([z.boolean(), z.number()]).optional(),
});

const router = new Hono<{ Bindings: Env }>();

function safe(fn: (c: any) => Promise<Response> | Response) {
  return async (c: any) => {
    try {
      return await fn(c);
    } catch (e) {
      if (e instanceof ApiError) {
        const status = e.statusCode as 400 | 403 | 404 | 409;
        const clientMsg = e.message;
        return c.json({ success: false, error: clientMsg, code: e.code }, status);
      }
      console.error('[FORMATOS_ERROR]', (e as Error).message || String(e));
      return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
    }
  };
}

async function hasFormatosTable(db: D1Database): Promise<boolean> {
  const tbl = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='qualificacoes_formatos' LIMIT 1")
    .first<{ name: string }>();
  return Boolean(tbl?.name);
}

router.get(
  '/',
  auth(),
  safe(async (c) => {
    const db: D1Database = c.env.DB;
    const { empresaId } = getTenantContext(c);

    if (!(await hasFormatosTable(db))) {
      return c.json({ success: true, data: [], meta: { count: 0, migration_pending: true } });
    }

    const search = String(c.req.query('search') || '').trim();
    const conditions = ['f.empresa_id = ?', 'f.deleted_at IS NULL'];
    const bindings: unknown[] = [empresaId];

    if (search) {
      conditions.push('(f.nome LIKE ? OR f.codigo LIKE ?)');
      const like = `%${search}%`;
      bindings.push(like, like);
    }

    const { results } = await db
      .prepare(
        `SELECT f.id, f.nome, f.codigo, f.descricao, f.cor, f.ativo, f.empresa_id,
                f.created_at, f.updated_at,
                (SELECT COUNT(*) FROM qualificacoes_tipos qt
                  WHERE qt.formato_id = f.id AND qt.deleted_at IS NULL) AS total_tipos
           FROM qualificacoes_formatos f
          WHERE ${conditions.join(' AND ')}
          ORDER BY f.nome ASC`,
      )
      .bind(...bindings)
      .all<FormatoRow>();

    return c.json({ success: true, data: results || [], meta: { count: (results || []).length } });
  }),
);

router.get(
  '/:id',
  auth(),
  safe(async (c) => {
    const db: D1Database = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');

    if (!(await hasFormatosTable(db))) {
      return c.json({ success: false, error: 'Migration pendente' }, 503);
    }

    const row = await db
      .prepare(
        `SELECT f.id, f.nome, f.codigo, f.descricao, f.cor, f.ativo, f.empresa_id,
                f.created_at, f.updated_at,
                (SELECT COUNT(*) FROM qualificacoes_tipos qt
                  WHERE qt.formato_id = f.id AND qt.deleted_at IS NULL) AS total_tipos
           FROM qualificacoes_formatos f
          WHERE f.id = ? AND f.empresa_id = ? AND f.deleted_at IS NULL LIMIT 1`,
      )
      .bind(id, empresaId)
      .first<FormatoRow>();

    if (!row) return c.json({ success: false, error: 'Formato não encontrado' }, 404);
    return c.json({ success: true, data: row });
  }),
);

router.post(
  '/',
  auth(),
  requireRole('admin'),
  safe(async (c) => {
    const db: D1Database = c.env.DB;
    const { empresaId } = getTenantContext(c);

    if (!(await hasFormatosTable(db))) {
      return c.json({ success: false, error: 'Migration 0412 não aplicada' }, 503);
    }

    const parsed = createFormatoSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ success: false, error: 'Validação falhou', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const { nome, codigo, descricao, cor, ativo } = parsed.data;

    const existing = await db
      .prepare('SELECT id FROM qualificacoes_formatos WHERE empresa_id = ? AND codigo = ? AND deleted_at IS NULL LIMIT 1')
      .bind(empresaId, codigo)
      .first<{ id: number }>();

    if (existing) {
      return c.json({ success: false, error: 'Código de formato já existe' }, 409);
    }

    const result = await db
      .prepare(
        `INSERT INTO qualificacoes_formatos (nome, codigo, descricao, cor, ativo, empresa_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(nome.trim(), codigo, descricao || null, cor || null, ativo ? 1 : 0, empresaId)
      .run();

    const created = await db
      .prepare('SELECT id, nome, codigo, descricao, cor, ativo, empresa_id, created_at, updated_at FROM qualificacoes_formatos WHERE id = ? AND empresa_id = ? LIMIT 1')
      .bind(result.meta.last_row_id, empresaId)
      .first<FormatoRow>();

    return c.json({ success: true, data: created, message: 'Formato criado com sucesso' }, 201);
  }),
);

router.put(
  '/:id',
  auth(),
  requireRole('admin'),
  safe(async (c) => {
    const db: D1Database = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');

    if (!(await hasFormatosTable(db))) {
      return c.json({ success: false, error: 'Migration 0412 não aplicada' }, 503);
    }

    const existing = await db
      .prepare('SELECT id FROM qualificacoes_formatos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(id, empresaId)
      .first<{ id: number }>();

    if (!existing) return c.json({ success: false, error: 'Formato não encontrado' }, 404);

    const parsed = updateFormatoSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ success: false, error: 'Validação falhou', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const data = parsed.data;
    const parts: string[] = ["updated_at = datetime('now')"];
    const binds: unknown[] = [];

    if (data.nome !== undefined) { parts.push('nome = ?'); binds.push(data.nome.trim()); }
    if (data.descricao !== undefined) { parts.push('descricao = ?'); binds.push(data.descricao || null); }
    if (data.cor !== undefined) { parts.push('cor = ?'); binds.push(data.cor || null); }
    if (data.ativo !== undefined) { parts.push('ativo = ?'); binds.push(data.ativo ? 1 : 0); }

    await db
      .prepare(`UPDATE qualificacoes_formatos SET ${parts.join(', ')} WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`)
      .bind(...binds, id, empresaId)
      .run();

    const updated = await db
      .prepare('SELECT id, nome, codigo, descricao, cor, ativo, empresa_id, created_at, updated_at FROM qualificacoes_formatos WHERE id = ? AND empresa_id = ? LIMIT 1')
      .bind(id, empresaId)
      .first<FormatoRow>();

    return c.json({ success: true, data: updated, message: 'Formato atualizado' });
  }),
);

router.delete(
  '/:id',
  auth(),
  requireRole('admin'),
  safe(async (c) => {
    const db: D1Database = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');

    if (!(await hasFormatosTable(db))) {
      return c.json({ success: false, error: 'Migration 0412 não aplicada' }, 503);
    }

    const existing = await db
      .prepare('SELECT id, codigo FROM qualificacoes_formatos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(id, empresaId)
      .first<{ id: number; codigo: string }>();

    if (!existing) return c.json({ success: false, error: 'Formato não encontrado' }, 404);

    const emUso = await db
      .prepare('SELECT COUNT(*) AS cnt FROM qualificacoes_tipos WHERE formato_id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(id, empresaId)
      .first<{ cnt: number }>();

    if ((emUso?.cnt ?? 0) > 0) {
      return c.json(
        { success: false, error: `Este formato está em uso por ${emUso!.cnt} modelo(s) de qualificação e não pode ser removido.` },
        409,
      );
    }

    await db
      .prepare("UPDATE qualificacoes_formatos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ?")
      .bind(id, empresaId)
      .run();

    return c.json({ success: true, message: 'Formato removido com sucesso' });
  }),
);

export default router;
