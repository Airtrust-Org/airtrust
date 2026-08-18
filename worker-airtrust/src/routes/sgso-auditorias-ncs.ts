/**
 * SGSO — Auditorias e Não Conformidades
 * Sub-router mounted at /api/sgso via sgso.route('/', ...)
 */

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { createLogger, toError } from '../utils/logger';

type AppCtx = Context<{ Bindings: Env; Variables: { userId?: string } }>;
type AuditStatus = 'PROGRAMADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';

const app = new Hono<{ Bindings: Env; Variables: { userId?: string } }>();
const requireSgsoManager = requireRole('admin', 'manager');

app.use('/relatos/:id/status', requireSgsoManager);
app.use('/relatos/:id/avaliacao-risco', requireSgsoManager);
app.use('/relatos/:id/acoes', requireSgsoManager);
app.use('/acoes/:id', requireSgsoManager);

function getUid(c: AppCtx): number {
  return Number(c.get('userId') ?? 0);
}

function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function sgsoErrorResponse(
  c: AppCtx,
  error: unknown,
  message: string,
  code: string,
  status: number = 500,
) {
  const logger = createLogger(c, 'SgsoRoutes');
  logger.error(message, toError(error), { route: c.req.path, status });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return c.json({ success: false, error: message, code }, status as any);
}

async function getAuditOrNull(
  db: D1Database,
  id: string,
  empresaId: number,
): Promise<{ id: string; status: AuditStatus } | null> {
  return db
    .prepare(
      `SELECT id, status
         FROM sgso_auditorias
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(id, empresaId)
    .first<{ id: string; status: AuditStatus }>();
}

function isAuditWritable(status: AuditStatus): boolean {
  return status === 'PROGRAMADA' || status === 'EM_ANDAMENTO';
}

async function recalculateAuditMetrics(
  db: D1Database,
  id: string,
  empresaId: number,
  ts: string,
): Promise<void> {
  const metrics = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN resultado = 'CONFORME' THEN 1 ELSE 0 END) AS conformes,
         SUM(CASE WHEN resultado = 'NC_MAJOR' THEN 1 ELSE 0 END) AS nc_major,
         SUM(CASE WHEN resultado = 'NC_MINOR' THEN 1 ELSE 0 END) AS nc_minor,
         SUM(CASE WHEN resultado = 'OBSERVACAO' THEN 1 ELSE 0 END) AS observacoes,
         SUM(CASE WHEN resultado IS NOT NULL THEN 1 ELSE 0 END) AS respondidos
       FROM sgso_auditoria_itens
      WHERE auditoria_id = ? AND empresa_id = ?`,
    )
    .bind(id, empresaId)
    .first<{
      total: number;
      conformes: number | null;
      nc_major: number | null;
      nc_minor: number | null;
      observacoes: number | null;
      respondidos: number | null;
    }>();

  if (!metrics) return;
  const total = Number(metrics.total || 0);
  const conformes = Number(metrics.conformes || 0);
  const pct = total > 0 ? (conformes / total) * 100 : null;
  const status = Number(metrics.respondidos || 0) > 0 ? 'EM_ANDAMENTO' : 'PROGRAMADA';

  const result = await db
    .prepare(
      `UPDATE sgso_auditorias
          SET total_itens = ?, itens_conformes = ?, itens_nc_major = ?,
              itens_nc_minor = ?, itens_observacao = ?, percentual_conformidade = ?,
              status = CASE WHEN status IN ('PROGRAMADA', 'EM_ANDAMENTO') THEN ? ELSE status END,
              updated_at = ?
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(
      total,
      conformes,
      Number(metrics.nc_major || 0),
      Number(metrics.nc_minor || 0),
      Number(metrics.observacoes || 0),
      pct,
      status,
      ts,
      id,
      empresaId,
    )
    .run();

  if ((result.meta?.changes ?? 0) !== 1) {
    throw new Error('Auditoria não encontrada ao recalcular métricas');
  }
}

// ─────────────────────────────────────────────────────────────
// AUDITORIAS
// ─────────────────────────────────────────────────────────────

app.get('/auditorias', requireSgsoManager, async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const db = c.env.DB;
    const { status, page = '1', limit = '20' } = c.req.query();
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let where = 'a.empresa_id = ? AND a.deleted_at IS NULL';
    const params: (string | number)[] = [empresaId];
    if (status) {
      where += ' AND a.status = ?';
      params.push(status);
    }

    const total = await db
      .prepare(`SELECT COUNT(*) as n FROM sgso_auditorias a WHERE ${where}`)
      .bind(...params)
      .first<{ n: number }>();

    const rows = await db
      .prepare(
        `SELECT a.id, a.tipo, a.titulo, a.status, a.data_programada, a.data_realizada,
                a.percentual_conformidade, a.total_itens, a.itens_conformes,
                a.itens_nc_major, a.itens_nc_minor,
                f.nome AS auditor_nome
           FROM sgso_auditorias a
           LEFT JOIN funcionarios f
             ON f.id = a.auditor_id AND f.empresa_id = a.empresa_id
          WHERE ${where}
          ORDER BY COALESCE(a.data_programada, a.created_at) DESC
          LIMIT ? OFFSET ?`,
      )
      .bind(...params, limitNum, offset)
      .all<Record<string, unknown>>();

    return c.json({
      success: true,
      data: rows.results,
      pagination: { page: pageNum, limit: limitNum, total: total?.n ?? 0 },
    });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao listar auditorias', 'SGSO_AUDITORIA_LIST_ERROR');
  }
});

app.post('/auditorias', requireSgsoManager, async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const uid = getUid(c);
    const db = c.env.DB;
    const body = await c.req.json();

    const schema = z.object({
      tipo: z.enum([
        'INTERNA',
        'EXTERNA',
        'RAMP_CHECK',
        'OPERACIONAL',
        'MANUTENCAO',
        'REVISAO_SGO',
        'FORNECEDORES',
      ]),
      titulo: z.string().trim().min(3),
      descricao: z.string().trim().optional(),
      data_programada: z.string().optional(),
      auditor_id: z.number().int().positive().optional(),
      auditado_setor: z.string().trim().optional(),
      itens: z
        .array(
          z.object({
            numero_item: z.number().int().positive(),
            descricao: z.string().trim().min(3),
            rbac_referencia: z.string().trim().optional(),
            criterio_aceitacao: z.string().trim().optional(),
          }),
        )
        .max(500)
        .optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }
    const d = parsed.data;

    if (d.auditor_id) {
      const auditor = await db
        .prepare(
          `SELECT id FROM funcionarios
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
        )
        .bind(d.auditor_id, empresaId)
        .first();
      if (!auditor) {
        return c.json({ success: false, error: 'Auditor não pertence à empresa' }, 400);
      }
    }

    const id = uuid();
    const ts = now();
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO sgso_auditorias
           (id, empresa_id, tipo, titulo, descricao, data_programada, auditor_id,
            auditado_setor, status, total_itens, created_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,'PROGRAMADA',?,?,?,?)`,
        )
        .bind(
          id,
          empresaId,
          d.tipo,
          d.titulo,
          d.descricao ?? null,
          d.data_programada ?? null,
          d.auditor_id ?? null,
          d.auditado_setor ?? null,
          d.itens?.length ?? 0,
          uid,
          ts,
          ts,
        ),
    ];

    for (const item of d.itens ?? []) {
      statements.push(
        db
          .prepare(
            `INSERT INTO sgso_auditoria_itens
             (auditoria_id, empresa_id, numero_item, descricao, rbac_referencia,
              criterio_aceitacao, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?)`,
          )
          .bind(
            id,
            empresaId,
            item.numero_item,
            item.descricao,
            item.rbac_referencia ?? null,
            item.criterio_aceitacao ?? null,
            ts,
            ts,
          ),
      );
    }

    await db.batch(statements);
    return c.json({ success: true, data: { id } }, 201);
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao criar auditoria', 'SGSO_AUDITORIA_CREATE_ERROR');
  }
});

app.get('/auditorias/:id', requireSgsoManager, async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const db = c.env.DB;
    const { id } = c.req.param();

    const auditoria = await db
      .prepare(
        `SELECT a.*, f.nome AS auditor_nome
           FROM sgso_auditorias a
           LEFT JOIN funcionarios f
             ON f.id = a.auditor_id AND f.empresa_id = a.empresa_id
          WHERE a.id = ? AND a.empresa_id = ? AND a.deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first<Record<string, unknown>>();

    if (!auditoria) {
      return c.json(
        { success: false, error: 'Auditoria não encontrada', code: 'SGSO_AUDITORIA_NOT_FOUND' },
        404,
      );
    }

    const itens = await db
      .prepare(
        `SELECT ai.*, f.nome AS verificado_por_nome
           FROM sgso_auditoria_itens ai
           LEFT JOIN funcionarios f
             ON f.id = ai.verificado_por AND f.empresa_id = ai.empresa_id
          WHERE ai.auditoria_id = ? AND ai.empresa_id = ?
          ORDER BY ai.numero_item ASC, ai.id ASC`,
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();

    return c.json({ success: true, data: { ...auditoria, itens: itens.results } });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao buscar auditoria', 'SGSO_AUDITORIA_GET_ERROR');
  }
});

app.patch('/auditorias/:id/item', requireSgsoManager, async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const uid = getUid(c);
    const db = c.env.DB;
    const { id } = c.req.param();
    const body = await c.req.json();

    const audit = await getAuditOrNull(db, id, empresaId);
    if (!audit) {
      return c.json({ success: false, error: 'Auditoria não encontrada' }, 404);
    }
    if (!isAuditWritable(audit.status)) {
      return c.json(
        { success: false, error: 'Auditoria concluída ou cancelada não pode ser alterada' },
        409,
      );
    }

    const schema = z.object({
      item_id: z.number().int().positive().optional(),
      descricao: z.string().trim().min(3).optional(),
      numero_item: z.number().int().positive().optional(),
      rbac_referencia: z.string().trim().optional(),
      criterio_aceitacao: z.string().trim().optional(),
      resultado: z
        .enum(['CONFORME', 'NC_MAJOR', 'NC_MINOR', 'OBSERVACAO', 'NAO_APLICAVEL'])
        .optional(),
      evidencia: z.string().trim().optional(),
      expected_updated_at: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: 'Dados inválidos' }, 400);
    }
    const d = parsed.data;
    const ts = now();

    let itemId: number;
    if (d.item_id) {
      const sets: string[] = ['updated_at = ?'];
      const params: (string | number | null)[] = [ts];
      if (d.resultado) {
        sets.push('resultado = ?', 'verificado_por = ?', 'verificado_em = ?');
        params.push(d.resultado, uid, ts);
      }
      if (d.evidencia !== undefined) {
        sets.push('evidencia = ?');
        params.push(d.evidencia);
      }
      if (d.descricao !== undefined) {
        sets.push('descricao = ?');
        params.push(d.descricao);
      }
      if (d.numero_item !== undefined) {
        sets.push('numero_item = ?');
        params.push(d.numero_item);
      }
      if (d.rbac_referencia !== undefined) {
        sets.push('rbac_referencia = ?');
        params.push(d.rbac_referencia);
      }
      if (d.criterio_aceitacao !== undefined) {
        sets.push('criterio_aceitacao = ?');
        params.push(d.criterio_aceitacao);
      }

      let where = 'id = ? AND auditoria_id = ? AND empresa_id = ?';
      params.push(d.item_id, id, empresaId);
      if (d.expected_updated_at) {
        where += ' AND updated_at = ?';
        params.push(d.expected_updated_at);
      }

      const update = await db
        .prepare(`UPDATE sgso_auditoria_itens SET ${sets.join(', ')} WHERE ${where}`)
        .bind(...params)
        .run();
      if ((update.meta?.changes ?? 0) !== 1) {
        return c.json(
          {
            success: false,
            error: d.expected_updated_at
              ? 'O item foi alterado por outra pessoa. Recarregue antes de salvar.'
              : 'Item não encontrado',
            code: d.expected_updated_at ? 'SGSO_CONCURRENT_UPDATE' : 'SGSO_ITEM_NOT_FOUND',
          },
          d.expected_updated_at ? 409 : 404,
        );
      }
      itemId = d.item_id;
    } else {
      if (!d.descricao || !d.numero_item) {
        return c.json(
          { success: false, error: 'Descrição e número do item são obrigatórios' },
          400,
        );
      }
      const insert = await db
        .prepare(
          `INSERT INTO sgso_auditoria_itens
           (auditoria_id, empresa_id, numero_item, descricao, rbac_referencia,
            criterio_aceitacao, resultado, evidencia, verificado_por, verificado_em,
            created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          id,
          empresaId,
          d.numero_item,
          d.descricao,
          d.rbac_referencia ?? null,
          d.criterio_aceitacao ?? null,
          d.resultado ?? null,
          d.evidencia ?? null,
          d.resultado ? uid : null,
          d.resultado ? ts : null,
          ts,
          ts,
        )
        .run();
      itemId = Number(insert.meta.last_row_id);
    }

    if (d.resultado === 'NC_MAJOR' || d.resultado === 'NC_MINOR') {
      const item = await db
        .prepare(
          `SELECT descricao, rbac_referencia
             FROM sgso_auditoria_itens
            WHERE id = ? AND auditoria_id = ? AND empresa_id = ?`,
        )
        .bind(itemId, id, empresaId)
        .first<{ descricao: string; rbac_referencia: string | null }>();
      if (!item) throw new Error('Item não encontrado após gravação');

      const existingNc = await db
        .prepare(
          `SELECT id FROM sgso_nao_conformidades
            WHERE auditoria_item_id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
        )
        .bind(itemId, empresaId)
        .first<{ id: number }>();

      if (existingNc) {
        await db
          .prepare(
            `UPDATE sgso_nao_conformidades
                SET tipo = ?, descricao = ?, rbac_referencia = ?, updated_at = ?
              WHERE id = ? AND empresa_id = ?`,
          )
          .bind(
            d.resultado === 'NC_MAJOR' ? 'MAJOR' : 'MINOR',
            item.descricao,
            item.rbac_referencia,
            ts,
            existingNc.id,
            empresaId,
          )
          .run();
      } else {
        await db
          .prepare(
            `INSERT INTO sgso_nao_conformidades
             (empresa_id, auditoria_id, auditoria_item_id, tipo, descricao,
              rbac_referencia, status, created_by, created_at, updated_at)
             VALUES (?,?,?,?,?,?,'ABERTA',?,?,?)`,
          )
          .bind(
            empresaId,
            id,
            itemId,
            d.resultado === 'NC_MAJOR' ? 'MAJOR' : 'MINOR',
            item.descricao,
            item.rbac_referencia,
            uid,
            ts,
            ts,
          )
          .run();
      }
    }

    await recalculateAuditMetrics(db, id, empresaId, ts);
    return c.json({ success: true, data: { item_id: itemId } });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao responder item', 'SGSO_AUDITORIA_ITEM_UPDATE_ERROR');
  }
});

app.post('/auditorias/:id/concluir', requireSgsoManager, async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const db = c.env.DB;
    const { id } = c.req.param();
    const { observacoes_gerais, expected_updated_at } = (await c.req.json().catch(() => ({}))) as {
      observacoes_gerais?: string;
      expected_updated_at?: string;
    };

    const audit = await getAuditOrNull(db, id, empresaId);
    if (!audit) return c.json({ success: false, error: 'Auditoria não encontrada' }, 404);
    if (audit.status === 'CONCLUIDA') {
      return c.json({ success: false, error: 'Auditoria já foi concluída' }, 409);
    }
    if (audit.status === 'CANCELADA') {
      return c.json({ success: false, error: 'Auditoria cancelada não pode ser concluída' }, 409);
    }

    const completion = await db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN resultado IS NULL THEN 1 ELSE 0 END) AS pendentes
           FROM sgso_auditoria_itens
          WHERE auditoria_id = ? AND empresa_id = ?`,
      )
      .bind(id, empresaId)
      .first<{ total: number; pendentes: number | null }>();

    if (!completion || Number(completion.total || 0) === 0) {
      return c.json(
        { success: false, error: 'Adicione pelo menos um item antes de concluir a auditoria' },
        409,
      );
    }
    if (Number(completion.pendentes || 0) > 0) {
      return c.json(
        {
          success: false,
          error: `Existem ${completion.pendentes} item(ns) sem resultado`,
          code: 'SGSO_AUDITORIA_ITENS_PENDENTES',
        },
        409,
      );
    }

    const ts = now();
    let where =
      "id = ? AND empresa_id = ? AND deleted_at IS NULL AND status IN ('PROGRAMADA','EM_ANDAMENTO')";
    const params: Array<string | number | null> = [
      ts.slice(0, 10),
      observacoes_gerais?.trim() || null,
      ts,
      id,
      empresaId,
    ];
    if (expected_updated_at) {
      where += ' AND updated_at = ?';
      params.push(expected_updated_at);
    }

    const result = await db
      .prepare(
        `UPDATE sgso_auditorias
            SET status = 'CONCLUIDA', data_realizada = ?, observacoes_gerais = ?, updated_at = ?
          WHERE ${where}`,
      )
      .bind(...params)
      .run();

    if ((result.meta?.changes ?? 0) !== 1) {
      return c.json(
        {
          success: false,
          error: expected_updated_at
            ? 'A auditoria foi alterada por outra pessoa. Recarregue antes de concluir.'
            : 'Auditoria não pôde ser concluída',
          code: expected_updated_at ? 'SGSO_CONCURRENT_UPDATE' : 'SGSO_AUDITORIA_FINISH_FAILED',
        },
        409,
      );
    }

    return c.json({ success: true });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao concluir auditoria', 'SGSO_AUDITORIA_FINISH_ERROR');
  }
});

// ─────────────────────────────────────────────────────────────
// NÃO CONFORMIDADES
// ─────────────────────────────────────────────────────────────

app.get('/nao-conformidades', requireSgsoManager, async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const db = c.env.DB;
    const { status, tipo, page = '1', limit = '20' } = c.req.query();
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let where = 'nc.empresa_id = ? AND nc.deleted_at IS NULL';
    const params: (string | number)[] = [empresaId];
    if (status) {
      where += ' AND nc.status = ?';
      params.push(status);
    }
    if (tipo) {
      where += ' AND nc.tipo = ?';
      params.push(tipo);
    }

    const total = await db
      .prepare(`SELECT COUNT(*) as n FROM sgso_nao_conformidades nc WHERE ${where}`)
      .bind(...params)
      .first<{ n: number }>();

    const rows = await db
      .prepare(
        `SELECT nc.id, nc.tipo, nc.status, nc.descricao, nc.rbac_referencia,
                nc.prazo_resolucao, nc.created_at, nc.updated_at,
                f.nome AS responsavel_nome, a.titulo AS auditoria_titulo
           FROM sgso_nao_conformidades nc
           LEFT JOIN funcionarios f
             ON f.id = nc.responsavel_id AND f.empresa_id = nc.empresa_id
           LEFT JOIN sgso_auditorias a
             ON a.id = nc.auditoria_id AND a.empresa_id = nc.empresa_id
          WHERE ${where}
          ORDER BY nc.created_at DESC
          LIMIT ? OFFSET ?`,
      )
      .bind(...params, limitNum, offset)
      .all<Record<string, unknown>>();

    return c.json({
      success: true,
      data: rows.results,
      pagination: { page: pageNum, limit: limitNum, total: total?.n ?? 0 },
    });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao listar NCs', 'SGSO_NC_LIST_ERROR');
  }
});

app.post('/nao-conformidades', requireSgsoManager, async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const uid = getUid(c);
    const db = c.env.DB;
    const body = await c.req.json();

    const schema = z.object({
      tipo: z.enum(['MAJOR', 'MINOR', 'OBSERVACAO']),
      descricao: z.string().trim().min(5),
      rbac_referencia: z.string().trim().optional(),
      causa_raiz: z.string().trim().optional(),
      responsavel_id: z.number().int().positive().optional(),
      prazo_resolucao: z.string().optional(),
      auditoria_id: z.string().trim().min(1).optional(),
      relato_id: z.string().trim().min(1).optional(),
      barreira_id: z.string().trim().min(1).optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }
    const d = parsed.data;

    if (d.responsavel_id) {
      const owner = await db
        .prepare(
          'SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
        )
        .bind(d.responsavel_id, empresaId)
        .first();
      if (!owner) return c.json({ success: false, error: 'Responsável inválido' }, 400);
    }

    // Optional foreign references are tenant-owned too. Validate all of them before
    // the first write so an invalid/cross-tenant reference cannot leave a partial NC.
    if (d.auditoria_id) {
      const auditoria = await db
        .prepare(
          'SELECT id FROM sgso_auditorias WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
        )
        .bind(d.auditoria_id, empresaId)
        .first();
      if (!auditoria) return c.json({ success: false, error: 'Auditoria inválida' }, 400);
    }

    if (d.relato_id) {
      const relato = await db
        .prepare(
          'SELECT id FROM sgso_relatos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
        )
        .bind(d.relato_id, empresaId)
        .first();
      if (!relato) return c.json({ success: false, error: 'Relato inválido' }, 400);
    }

    let barreira: { id: string; status_saude: string | null } | null = null;
    if (d.barreira_id) {
      barreira = await db
        .prepare(
          `SELECT id, status_saude
             FROM sgso_bowtie_barreiras
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(d.barreira_id, empresaId)
        .first<{ id: string; status_saude: string | null }>();
      if (!barreira) return c.json({ success: false, error: 'Barreira inválida' }, 400);
    }

    const ts = now();
    const statements = [
      db
        .prepare(
          `INSERT INTO sgso_nao_conformidades
           (empresa_id, auditoria_id, relato_id, tipo, descricao, rbac_referencia, causa_raiz,
            responsavel_id, prazo_resolucao, status, created_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,'ABERTA',?,?,?)`,
        )
        .bind(
          empresaId,
          d.auditoria_id ?? null,
          d.relato_id ?? null,
          d.tipo,
          d.descricao,
          d.rbac_referencia ?? null,
          d.causa_raiz ?? null,
          d.responsavel_id ?? null,
          d.prazo_resolucao ?? null,
          uid,
          ts,
          ts,
        ),
    ];

    if (d.tipo === 'MAJOR' && d.barreira_id && barreira?.status_saude === 'OPERANTE') {
      // Keep the NC, barrier transition and its history in one D1 batch. The
      // status predicate prevents duplicate/false OPERANTE -> DEGRADADA history
      // if another request changed the barrier between validation and the batch.
      statements.push(
        db
          .prepare(
            `INSERT INTO sgso_bowtie_barreira_historico
             (barreira_id, empresa_id, status_anterior, status_novo, motivo, alterado_por, alterado_em)
             SELECT id, empresa_id, 'OPERANTE', 'DEGRADADA',
                    'NC MAJOR aberta automaticamente', ?, ?
               FROM sgso_bowtie_barreiras
              WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
                AND status_saude = 'OPERANTE'`,
          )
          .bind(uid, ts, d.barreira_id, empresaId),
      );
      statements.push(
        db
          .prepare(
            `UPDATE sgso_bowtie_barreiras
                SET status_saude = 'DEGRADADA',
                    updated_at = ?
              WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
                AND status_saude = 'OPERANTE'`,
          )
          .bind(ts, d.barreira_id, empresaId),
      );
    }

    const [result] = await db.batch(statements);
    return c.json({ success: true, data: { id: result.meta.last_row_id } }, 201);
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao criar NC', 'SGSO_NC_CREATE_ERROR');
  }
});

app.patch('/nao-conformidades/:id', requireSgsoManager, async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const uid = getUid(c);
    const db = c.env.DB;
    const { id } = c.req.param();
    const body = await c.req.json();

    const schema = z.object({
      status: z
        .enum(['ABERTA', 'EM_RESOLUCAO', 'AGUARDANDO_VERIFICACAO', 'FECHADA', 'CANCELADA'])
        .optional(),
      causa_raiz: z.string().trim().optional(),
      responsavel_id: z.number().int().positive().optional(),
      prazo_resolucao: z.string().optional(),
      evidencia_fechamento: z.string().trim().optional(),
      expected_updated_at: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: 'Dados inválidos' }, 400);
    const d = parsed.data;

    if (d.status === 'FECHADA' && !d.evidencia_fechamento) {
      return c.json(
        { success: false, error: 'Evidência de fechamento é obrigatória para fechar a NC' },
        400,
      );
    }
    if (d.responsavel_id) {
      const owner = await db
        .prepare(
          'SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
        )
        .bind(d.responsavel_id, empresaId)
        .first();
      if (!owner) return c.json({ success: false, error: 'Responsável inválido' }, 400);
    }

    const ts = now();
    const sets: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [ts];
    if (d.status) {
      sets.push('status = ?');
      params.push(d.status);
    }
    if (d.causa_raiz !== undefined) {
      sets.push('causa_raiz = ?');
      params.push(d.causa_raiz);
    }
    if (d.responsavel_id !== undefined) {
      sets.push('responsavel_id = ?');
      params.push(d.responsavel_id);
    }
    if (d.prazo_resolucao !== undefined) {
      sets.push('prazo_resolucao = ?');
      params.push(d.prazo_resolucao);
    }
    if (d.evidencia_fechamento !== undefined) {
      sets.push('evidencia_fechamento = ?');
      params.push(d.evidencia_fechamento);
    }
    if (d.status === 'FECHADA') {
      sets.push('fechada_por = ?', 'fechada_em = ?');
      params.push(uid, ts);
    }

    let where = 'id = ? AND empresa_id = ? AND deleted_at IS NULL';
    params.push(parseInt(id), empresaId);
    if (d.expected_updated_at) {
      where += ' AND updated_at = ?';
      params.push(d.expected_updated_at);
    }

    const result = await db
      .prepare(`UPDATE sgso_nao_conformidades SET ${sets.join(', ')} WHERE ${where}`)
      .bind(...params)
      .run();

    if ((result.meta?.changes ?? 0) !== 1) {
      return c.json(
        {
          success: false,
          error: d.expected_updated_at
            ? 'A NC foi alterada por outra pessoa. Recarregue antes de salvar.'
            : 'Não conformidade não encontrada',
          code: d.expected_updated_at ? 'SGSO_CONCURRENT_UPDATE' : 'SGSO_NC_NOT_FOUND',
        },
        d.expected_updated_at ? 409 : 404,
      );
    }

    return c.json({ success: true });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao atualizar NC', 'SGSO_NC_UPDATE_ERROR');
  }
});

export default app;
