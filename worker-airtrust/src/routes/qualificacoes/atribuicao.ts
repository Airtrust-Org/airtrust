/**
 * QUALIFICACOES - MÓDULO ATRIBUIÇÃO
 * Endpoints para atribuir e renovar qualificações
 *
 * Endpoints:
 * - POST / - Atribuir qualificação a funcionário
 * - POST /renovar - Iniciar renovação
 * - PUT /renovacoes/:id - Atualizar renovação
 * - DELETE /renovacoes/:id - Cancelar renovação
 * - GET /renovacoes - Listar renovações
 */

import { Hono } from 'hono';
import type { Env } from '../../types';
import { auth } from '../../middleware/auth';
import { getTenantContext } from '../../middleware/tenant';
import { requireRole } from '../../middleware/rbac';
import { z } from 'zod';

const router = new Hono<{ Bindings: Env }>();

// ===== SCHEMAS =====
const atribuirSchema = z.object({
  funcionario_id: z.number().int().positive(),
  qualificacao_id: z.number().int().positive(),
  tipo_id: z.number().int().positive().optional(), // alias para qualificacao_id
  data_realizacao: z.string().min(1),
  data_vencimento: z.string(),
  instrutor: z.string().max(200).optional(),
  observacoes: z.string().optional(),
  observacao: z.string().optional(), // alias para observacoes
});

const renovarSchema = z.object({
  qualificacao_historico_id: z.number().int().positive(),
  data_renovacao_solicitada: z.string(),
  observacoes: z.string().optional(),
});

const updateRenovacaoSchema = z.object({
  data_renovacao_solicitada: z.string().optional(),
  status: z.enum(['pendente', 'aprovada', 'rejeitada']).optional(),
  observacoes: z.string().optional(),
});

function safe(fn: (c: any) => Promise<Response> | Response) {
  return async (c: any) => {
    try {
      return await fn(c);
    } catch (e) {
      const errorMessage = (e as Error).message || String(e);
      console.error('[ATRIBUICAO_ERROR]', errorMessage, (e as Error).stack);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  };
}

async function logAuditoria(db: D1Database, entidade: string, entidade_id: string, acao: string) {
  try {
    const auditTable = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_avancada_v2' LIMIT 1",
      )
      .first();
    if (auditTable) {
      await db
        .prepare(
          "INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, origem) VALUES (?, ?, ?, 'api')",
        )
        .bind(entidade, entidade_id, acao)
        .run();
    }
  } catch (e) {
    console.warn('[AUDITORIA] falha:', (e as Error).message);
  }
}

async function funcionarioPertenceEmpresa(
  db: D1Database,
  funcionarioId: number,
  empresaId: number,
) {
  return db
    .prepare(
      'SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
    )
    .bind(funcionarioId, empresaId)
    .first();
}

async function qualificacaoPertenceEmpresa(
  db: D1Database,
  qualificacaoHistoricoId: number | string,
  empresaId: number,
) {
  return db
    .prepare(
      `SELECT qh.id
       FROM qualificacoes_historico qh
       INNER JOIN funcionarios f ON f.id = qh.funcionario_id
       WHERE qh.id = ?
         AND qh.deleted_at IS NULL
         AND f.deleted_at IS NULL
         AND f.empresa_id = ?
       LIMIT 1`,
    )
    .bind(qualificacaoHistoricoId, empresaId)
    .first();
}

async function renovacaoPertenceEmpresa(
  db: D1Database,
  renovacaoId: number | string,
  empresaId: number,
) {
  return db
    .prepare(
      `SELECT qr.id
       FROM qualificacoes_renovacoes qr
       INNER JOIN qualificacoes_historico qh ON qh.id = qr.qualificacao_historico_id
       INNER JOIN funcionarios f ON f.id = qh.funcionario_id
       WHERE qr.id = ?
         AND qr.deleted_at IS NULL
         AND qh.deleted_at IS NULL
         AND f.deleted_at IS NULL
         AND f.empresa_id = ?
       LIMIT 1`,
    )
    .bind(renovacaoId, empresaId)
    .first();
}

// ===== ENDPOINTS =====

/**
 * POST /
 * Atribuir qualificação a funcionário
 */
router.post(
  '/',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const body = await c.req.json();

    const parsed = atribuirSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Validação falhou', details: parsed.error.flatten().fieldErrors },
        400,
      );
    }

    const data = parsed.data;

    // Suportar tanto qualificacao_id quanto tipo_id (alias)
    const tipoId = data.tipo_id || data.qualificacao_id;
    const observacoes = data.observacoes || data.observacao;

    // Verificar se funcionário existe
    const func = await db
      .prepare(
        'SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(data.funcionario_id, tenantCtx.empresaId)
      .first();
    if (!func) {
      return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);
    }

    // Verificar se tipo existe
    const tipo = await db
      .prepare('SELECT id FROM qualificacoes_tipos WHERE id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(tipoId)
      .first();
    if (!tipo) {
      return c.json({ success: false, error: 'Tipo de qualificação não encontrado' }, 404);
    }

    // Validar datas
    if (new Date(data.data_vencimento) <= new Date(data.data_realizacao)) {
      return c.json(
        { success: false, error: 'data_vencimento deve ser posterior à data_realizacao' },
        400,
      );
    }

    // Data futura deve nascer como PLANEJADA para aparecer corretamente no histórico.
    const hojeIso = new Date();
    hojeIso.setUTCHours(0, 0, 0, 0);
    const conclusaoIso = new Date(`${data.data_realizacao}T00:00:00Z`);
    const statusQualificacao = conclusaoIso > hojeIso ? 'PLANEJADA' : 'CONCLUIDA';

    // Inserir novo registro no histórico (data_realizacao vira data_conclusao no banco)
    const result = await db
      .prepare(
        `INSERT INTO qualificacoes_historico 
         (funcionario_id, qualificacao_id, data_conclusao, data_vencimento, instrutor, observacoes, status, renovada, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'), NULL)`,
      )
      .bind(
        data.funcionario_id,
        tipoId,
        data.data_realizacao, // data_realizacao da API → data_conclusao no banco
        data.data_vencimento,
        data.instrutor || null,
        observacoes || null,
        statusQualificacao,
      )
      .run();

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Falha ao atribuir qualificação' }, 500);
    }

    const newId = result.meta.last_row_id;
    await logAuditoria(db, 'qualificacoes_historico', String(newId), 'ATRIBUIR');

    return c.json(
      { success: true, data: { id: newId }, message: 'Qualificação atribuída com sucesso' },
      201,
    );
  }),
);

/**
 * POST /renovar
 * Iniciar renovação de qualificação
 */
router.post(
  '/renovar',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const body = await c.req.json();

    const parsed = renovarSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Validação falhou', details: parsed.error.flatten().fieldErrors },
        400,
      );
    }

    const data = parsed.data;

    // Verificar se qualificação existe
    const qual = await db
      .prepare(
        `SELECT qh.id
         FROM qualificacoes_historico qh
         INNER JOIN funcionarios f ON f.id = qh.funcionario_id
         WHERE qh.id = ?
           AND qh.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND f.empresa_id = ?
         LIMIT 1`,
      )
      .bind(data.qualificacao_historico_id, tenantCtx.empresaId)
      .first();
    if (!qual) {
      return c.json({ success: false, error: 'Qualificação não encontrada' }, 404);
    }

    // Criar registro de renovação
    const result = await db
      .prepare(
        `INSERT INTO qualificacoes_renovacoes 
         (qualificacao_historico_id, data_renovacao_solicitada, status, observacoes, created_at, updated_at, deleted_at)
         VALUES (?, ?, 'pendente', ?, datetime('now'), datetime('now'), NULL)`,
      )
      .bind(
        data.qualificacao_historico_id,
        data.data_renovacao_solicitada,
        data.observacoes || null,
      )
      .run();

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Falha ao criar renovação' }, 500);
    }

    const newId = result.meta.last_row_id;
    await logAuditoria(db, 'qualificacoes_renovacoes', String(newId), 'CREATE');

    return c.json(
      { success: true, data: { id: newId }, message: 'Renovação criada com sucesso' },
      201,
    );
  }),
);

/**
 * GET /renovacoes
 * Listar renovações
 */
router.get(
  '/renovacoes',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const limit = Math.min(parseInt(c.req.query('limit') || '100'), 500);
    const status = c.req.query('status');

    let sql = `SELECT qr.*
      FROM qualificacoes_renovacoes qr
      INNER JOIN qualificacoes_historico qh ON qh.id = qr.qualificacao_historico_id
      INNER JOIN funcionarios f ON f.id = qh.funcionario_id
      WHERE qr.deleted_at IS NULL
        AND qh.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?`;
    const binds: unknown[] = [];
    binds.push(tenantCtx.empresaId);

    if (status && ['pendente', 'aprovada', 'rejeitada'].includes(status)) {
      sql += ' AND status = ?';
      binds.push(status);
    }

    sql += ' ORDER BY data_renovacao_solicitada DESC LIMIT ?';
    binds.push(limit);

    const { results } = await db
      .prepare(sql)
      .bind(...binds)
      .all();

    return c.json({ success: true, data: results || [], meta: { count: (results || []).length } });
  }),
);

/**
 * PUT /renovacoes/:id
 * Atualizar renovação
 */
router.put(
  '/renovacoes/:id',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const id = c.req.param('id');
    const body = await c.req.json();

    const parsed = updateRenovacaoSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: 'Validação falhou' }, 400);
    }

    const data = parsed.data;

    // Verificar se existe
    const existing = await renovacaoPertenceEmpresa(db, id, tenantCtx.empresaId);
    if (!existing) {
      return c.json({ success: false, error: 'Renovação não encontrada' }, 404);
    }

    const updateParts: string[] = [];
    const binds: unknown[] = [];

    if (data.data_renovacao_solicitada) {
      updateParts.push('data_renovacao_solicitada = ?');
      binds.push(data.data_renovacao_solicitada);
    }
    if (data.status) {
      updateParts.push('status = ?');
      binds.push(data.status);
    }
    if (data.observacoes !== undefined) {
      updateParts.push('observacoes = ?');
      binds.push(data.observacoes || null);
    }

    if (updateParts.length === 0) {
      return c.json({ success: false, error: 'Nada para atualizar' }, 400);
    }

    updateParts.push("updated_at = datetime('now')");
    const sql = `UPDATE qualificacoes_renovacoes
      SET ${updateParts.join(', ')}
      WHERE id = ?
        AND qualificacao_historico_id IN (
          SELECT qh.id
          FROM qualificacoes_historico qh
          INNER JOIN funcionarios f ON f.id = qh.funcionario_id
          WHERE qh.deleted_at IS NULL
            AND f.deleted_at IS NULL
            AND f.empresa_id = ?
        )`;
    binds.push(id, tenantCtx.empresaId);

    const result = await db
      .prepare(sql)
      .bind(...binds)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Falha ao atualizar renovação' }, 500);
    }

    await logAuditoria(db, 'qualificacoes_renovacoes', id, 'UPDATE');

    return c.json({ success: true, data: { id }, message: 'Renovação atualizada' });
  }),
);

/**
 * DELETE /renovacoes/:id
 * Cancelar renovação (soft delete)
 */
router.delete(
  '/renovacoes/:id',
  auth(),
  requireRole('admin', 'manager'),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const id = c.req.param('id');

    const existing = await renovacaoPertenceEmpresa(db, id, tenantCtx.empresaId);
    if (!existing) {
      return c.json({ success: false, error: 'Renovação não encontrada' }, 404);
    }

    const result = await db
      .prepare(
        `UPDATE qualificacoes_renovacoes
         SET deleted_at = datetime('now')
         WHERE id = ?
           AND qualificacao_historico_id IN (
             SELECT qh.id
             FROM qualificacoes_historico qh
             INNER JOIN funcionarios f ON f.id = qh.funcionario_id
             WHERE qh.deleted_at IS NULL
               AND f.deleted_at IS NULL
               AND f.empresa_id = ?
           )`,
      )
      .bind(id, tenantCtx.empresaId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Falha ao cancelar renovação' }, 500);
    }

    await logAuditoria(db, 'qualificacoes_renovacoes', id, 'DELETE');

    return c.json({ success: true, message: 'Renovação cancelada' });
  }),
);

export default router;
