/**
 * SGSO — Auditorias e Não Conformidades
 * Sub-router mounted at /api/sgso via sgso.route('/', ...)
 *
 *   GET    /auditorias
 *   POST   /auditorias
 *   GET    /auditorias/:id
 *   PATCH  /auditorias/:id/item
 *   POST   /auditorias/:id/concluir
 *   GET    /nao-conformidades
 *   POST   /nao-conformidades
 *   PATCH  /nao-conformidades/:id
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { createLogger, toError } from '../utils/logger';
import type { Context } from 'hono';

type AppCtx = Context<{ Bindings: Env; Variables: { userId?: string } }>;

const app = new Hono<{ Bindings: Env; Variables: { userId?: string } }>();
const requireSgsoManager = requireRole('admin', 'manager');

// These handlers live in the parent SGSO router, which mounts this sub-router first.
// Registering the guards here keeps every regulated mutation behind the same RBAC policy.
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

// ─────────────────────────────────────────────────────────────
// AUDITORIAS
// ─────────────────────────────────────────────────────────────

// GET /api/sgso/auditorias
app.get('/auditorias', async (c) => {
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
         LEFT JOIN funcionarios f ON f.id = a.auditor_id AND f.deleted_at IS NULL
         WHERE ${where}
         ORDER BY a.data_programada DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...params, limitNum, offset)
      .all<Record<string, unknown>>();

    return c.json({
      success: true,
      data: rows.results,
      pagination: { page: pageNum, limit: limitNum, total: total?.n ?? 0 },
    });
  } catch {
    return c.json({ success: false, error: 'Erro ao listar auditorias', code: 'SGSO_ERROR' }, 500);
  }
});

// POST /api/sgso/auditorias
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
      titulo: z.string().min(3),
      descricao: z.string().optional(),
      data_programada: z.string().optional(),
      auditor_id: z.number().int().optional(),
      auditado_setor: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }
    const d = parsed.data;

    const id = uuid();
    const ts = now();
    await db
      .prepare(
        `INSERT INTO sgso_auditorias
         (id, empresa_id, tipo, titulo, descricao, data_programada, auditor_id, auditado_setor, status, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,'PROGRAMADA',?,?,?)`,
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
        uid,
        ts,
        ts,
      )
      .run();

    return c.json({ success: true, data: { id } }, 201);
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao criar auditoria', 'SGSO_AUDITORIA_CREATE_ERROR');
  }
});

// GET /api/sgso/auditorias/:id
app.get('/auditorias/:id', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const db = c.env.DB;
    const { id } = c.req.param();

    const auditoria = await db
      .prepare(
        `SELECT a.*, f.nome AS auditor_nome
         FROM sgso_auditorias a
         LEFT JOIN funcionarios f ON f.id = a.auditor_id AND f.deleted_at IS NULL
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
         LEFT JOIN funcionarios f ON f.id = ai.verificado_por
         WHERE ai.auditoria_id = ? AND ai.empresa_id = ?
         ORDER BY ai.numero_item ASC`,
      )
      .bind(id, empresaId)
      .all<Record<string, unknown>>();

    return c.json({ success: true, data: { ...auditoria, itens: itens.results } });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao buscar auditoria', 'SGSO_AUDITORIA_GET_ERROR');
  }
});

// PATCH /api/sgso/auditorias/:id/item
app.patch('/auditorias/:id/item', requireSgsoManager, async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const uid = getUid(c);
    const db = c.env.DB;
    const { id } = c.req.param();
    const body = await c.req.json();

    const schema = z.object({
      item_id: z.number().int().optional(),
      descricao: z.string().optional(),
      numero_item: z.number().int().optional(),
      rbac_referencia: z.string().optional(),
      criterio_aceitacao: z.string().optional(),
      resultado: z
        .enum(['CONFORME', 'NC_MAJOR', 'NC_MINOR', 'OBSERVACAO', 'NAO_APLICAVEL'])
        .optional(),
      evidencia: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: 'Dados inválidos' }, 400);
    }
    const d = parsed.data;
    const ts = now();

    if (d.item_id) {
      // Atualizar item existente
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
      params.push(d.item_id, empresaId);
      await db
        .prepare(
          `UPDATE sgso_auditoria_itens SET ${sets.join(', ')} WHERE id = ? AND empresa_id = ?`,
        )
        .bind(...params)
        .run();

      // Se NC, criar não conformidade automaticamente
      if (d.resultado === 'NC_MAJOR' || d.resultado === 'NC_MINOR') {
        const item = await db
          .prepare('SELECT descricao, rbac_referencia FROM sgso_auditoria_itens WHERE id = ?')
          .bind(d.item_id)
          .first<{ descricao: string; rbac_referencia: string }>();
        if (item) {
          await db
            .prepare(
              `INSERT INTO sgso_nao_conformidades
               (empresa_id, auditoria_id, auditoria_item_id, tipo, descricao, rbac_referencia, status, created_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,'ABERTA',?,?,?)`,
            )
            .bind(
              empresaId,
              id,
              d.item_id,
              d.resultado === 'NC_MAJOR' ? 'MAJOR' : 'MINOR',
              item.descricao,
              item.rbac_referencia ?? null,
              uid,
              ts,
              ts,
            )
            .run();
        }
      }
    } else {
      // Criar novo item
      const result = await db
        .prepare(
          `INSERT INTO sgso_auditoria_itens
           (auditoria_id, empresa_id, numero_item, descricao, rbac_referencia, criterio_aceitacao, resultado, evidencia, verificado_por, verificado_em, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          id,
          empresaId,
          d.numero_item ?? null,
          d.descricao ?? '',
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
      return c.json({ success: true, data: { id: result.meta.last_row_id } });
    }

    // Recalcular métricas da auditoria
    const metricas = await db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN resultado = 'CONFORME' THEN 1 ELSE 0 END) AS conformes,
           SUM(CASE WHEN resultado = 'NC_MAJOR' THEN 1 ELSE 0 END) AS nc_major,
           SUM(CASE WHEN resultado = 'NC_MINOR' THEN 1 ELSE 0 END) AS nc_minor,
           SUM(CASE WHEN resultado = 'OBSERVACAO' THEN 1 ELSE 0 END) AS observacoes
         FROM sgso_auditoria_itens WHERE auditoria_id = ? AND empresa_id = ?`,
      )
      .bind(id, empresaId)
      .first<{
        total: number;
        conformes: number;
        nc_major: number;
        nc_minor: number;
        observacoes: number;
      }>();

    if (metricas) {
      const pct = metricas.total > 0 ? (metricas.conformes / metricas.total) * 100 : null;
      await db
        .prepare(
          `UPDATE sgso_auditorias
           SET total_itens=?, itens_conformes=?, itens_nc_major=?, itens_nc_minor=?, itens_observacao=?, percentual_conformidade=?, updated_at=?
           WHERE id=? AND empresa_id=?`,
        )
        .bind(
          metricas.total,
          metricas.conformes,
          metricas.nc_major,
          metricas.nc_minor,
          metricas.observacoes,
          pct,
          ts,
          id,
          empresaId,
        )
        .run();
    }

    return c.json({ success: true });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao responder item', 'SGSO_AUDITORIA_ITEM_UPDATE_ERROR');
  }
});

// POST /api/sgso/auditorias/:id/concluir
app.post('/auditorias/:id/concluir', requireSgsoManager, async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const db = c.env.DB;
    const { id } = c.req.param();
    const { observacoes_gerais } = (await c.req.json().catch(() => ({}))) as {
      observacoes_gerais?: string;
    };

    const ts = now();
    await db
      .prepare(
        `UPDATE sgso_auditorias
         SET status = 'CONCLUIDA', data_realizada = ?, observacoes_gerais = ?, updated_at = ?
         WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(ts.slice(0, 10), observacoes_gerais ?? null, ts, id, empresaId)
      .run();

    return c.json({ success: true });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao concluir auditoria', 'SGSO_AUDITORIA_FINISH_ERROR');
  }
});

// ─────────────────────────────────────────────────────────────
// NÃO CONFORMIDADES
// ─────────────────────────────────────────────────────────────

// GET /api/sgso/nao-conformidades
app.get('/nao-conformidades', async (c) => {
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
                nc.prazo_resolucao, nc.created_at,
                f.nome AS responsavel_nome,
                a.titulo AS auditoria_titulo
         FROM sgso_nao_conformidades nc
         LEFT JOIN funcionarios f ON f.id = nc.responsavel_id AND f.deleted_at IS NULL
         LEFT JOIN sgso_auditorias a ON a.id = nc.auditoria_id
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

// POST /api/sgso/nao-conformidades
app.post('/nao-conformidades', requireSgsoManager, async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const uid = getUid(c);
    const db = c.env.DB;
    const body = await c.req.json();

    const schema = z.object({
      tipo: z.enum(['MAJOR', 'MINOR', 'OBSERVACAO']),
      descricao: z.string().min(5),
      rbac_referencia: z.string().optional(),
      causa_raiz: z.string().optional(),
      responsavel_id: z.number().int().optional(),
      prazo_resolucao: z.string().optional(),
      auditoria_id: z.string().optional(),
      relato_id: z.string().optional(),
      barreira_id: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
        400,
      );
    }
    const d = parsed.data;

    const ts = now();
    const result = await db
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
      )
      .run();

    // Auto-degrade barrier when a MAJOR NC is opened against a specific barrier
    if (d.tipo === 'MAJOR' && d.barreira_id) {
      await db
        .prepare(
          `UPDATE sgso_bowtie_barreiras
           SET status_saude = CASE WHEN status_saude = 'OPERANTE' THEN 'DEGRADADA' ELSE status_saude END,
               updated_at = ?
           WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(ts, d.barreira_id, empresaId)
        .run();

      await db
        .prepare(
          `INSERT INTO sgso_bowtie_barreira_historico
           (barreira_id, empresa_id, status_anterior, status_novo, motivo, alterado_por, alterado_em)
           SELECT id, empresa_id,
             CASE WHEN status_saude = 'DEGRADADA' THEN 'OPERANTE' ELSE status_saude END,
             'DEGRADADA',
             'NC MAJOR aberta automaticamente',
             ?, ?
           FROM sgso_bowtie_barreiras
           WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
             AND status_saude = 'DEGRADADA'`,
        )
        .bind(uid, ts, d.barreira_id, empresaId)
        .run();
    }

    return c.json({ success: true, data: { id: result.meta.last_row_id } }, 201);
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao criar NC', 'SGSO_NC_CREATE_ERROR');
  }
});

// PATCH /api/sgso/nao-conformidades/:id
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
      causa_raiz: z.string().optional(),
      responsavel_id: z.number().int().optional(),
      prazo_resolucao: z.string().optional(),
      evidencia_fechamento: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: 'Dados inválidos' }, 400);
    }
    const d = parsed.data;

    const ts = now();
    const sets: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [ts];

    if (d.status) {
      sets.push('status = ?');
      params.push(d.status);
    }
    if (d.causa_raiz) {
      sets.push('causa_raiz = ?');
      params.push(d.causa_raiz);
    }
    if (d.responsavel_id) {
      sets.push('responsavel_id = ?');
      params.push(d.responsavel_id);
    }
    if (d.prazo_resolucao) {
      sets.push('prazo_resolucao = ?');
      params.push(d.prazo_resolucao);
    }
    if (d.evidencia_fechamento) {
      sets.push('evidencia_fechamento = ?');
      params.push(d.evidencia_fechamento);
    }
    if (d.status === 'FECHADA') {
      sets.push('fechada_por = ?', 'fechada_em = ?');
      params.push(uid, ts);
    }

    params.push(parseInt(id), empresaId);
    await db
      .prepare(
        `UPDATE sgso_nao_conformidades SET ${sets.join(', ')} WHERE id = ? AND empresa_id = ?`,
      )
      .bind(...params)
      .run();

    return c.json({ success: true });
  } catch (err) {
    return sgsoErrorResponse(c, err, 'Erro ao atualizar NC', 'SGSO_NC_UPDATE_ERROR');
  }
});

export default app;
