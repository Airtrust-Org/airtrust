/**
 * QUALIFICACOES RECLASS ROUTES
 * Infraestrutura para recuperação manual da diversidade perdida.
 * Endpoints:
 *  - GET /api/qualificacoes/reclass/queue        (lista pendentes)
 *  - GET /api/qualificacoes/reclass/progresso    (stats fila)
 *  - PATCH /api/qualificacoes/reclass/:historicoId (aplicar reclassificação)
 *  - GET /api/qualificacoes/reclass/sugestoes/:historicoId (placeholder heurísticas futuras)
 */

import { Hono } from 'hono';
import type { Env, ApiResponse, QualificacaoReclassQueueItem } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
// Simple CSV escape
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const app = new Hono<{ Bindings: Env }>();

// GET /queue - lista pendentes
app.get('/queue', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const limit = Math.min(parseInt(c.req.query('limit') || '200'), 500);
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0);
  const search = (c.req.query('search') || '').trim().toLowerCase();

  const baseSql = `SELECT 
      q.id,
      q.historico_id,
      q.current_codigo,
      q.target_tipo_id,
      q.status,
      q.reason,
      q.created_at,
      q.updated_at,
      h.funcionario_id,
      f.nome AS funcionario_nome,
      h.data_conclusao,
      h.data_vencimento,
      h.numero_certificado
    FROM qualificacoes_historico_reclass_queue q
    JOIN qualificacoes_historico h ON h.id = q.historico_id
    LEFT JOIN funcionarios f ON f.id = h.funcionario_id
    WHERE q.status = 'PENDING'
      AND h.deleted_at IS NULL
      AND (f.deleted_at IS NULL OR f.deleted_at IS NULL)`; // redundância defensiva

  let finalSql = baseSql + ' ORDER BY h.data_conclusao DESC LIMIT ? OFFSET ?';
  let bindings: unknown[] = [limit, offset];
  if (search) {
    finalSql =
      baseSql +
      ' AND (LOWER(f.nome) LIKE ? OR CAST(h.funcionario_id AS TEXT) LIKE ?) ORDER BY h.data_conclusao DESC LIMIT ? OFFSET ?';
    bindings = [`%${search}%`, `%${search}%`, limit, offset];
  }

  const { results } = await db
    .prepare(finalSql)
    .bind(...bindings)
    .all<QualificacaoReclassQueueItem>();
  const countRow = await db
    .prepare(
      "SELECT COUNT(*) as total FROM qualificacoes_historico_reclass_queue WHERE status='PENDING'",
    )
    .first<{ total: number }>();

  const response: ApiResponse<{ items: QualificacaoReclassQueueItem[]; total: number }> = {
    success: true,
    data: { items: results || [], total: countRow?.total || 0 },
  };
  return c.json(response);
});

// GET /progresso - métricas
app.get('/progresso', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const stats = await db
    .prepare(
      `SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status='PENDING' THEN 1 END) AS pendentes,
        SUM(CASE WHEN status='APPLIED' THEN 1 END) AS aplicadas,
        SUM(CASE WHEN status='SKIPPED' THEN 1 END) AS ignoradas
      FROM qualificacoes_historico_reclass_queue`,
    )
    .first<{
      total: number;
      pendentes: number;
      aplicadas: number;
      ignoradas: number;
    }>();
  return c.json({ success: true, data: stats });
});

// PATCH /:historicoId - aplicar reclassificação
app.patch('/:historicoId', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const historicoIdRaw = c.req.param('historicoId');
  const historicoId = parseInt(historicoIdRaw, 10);
  if (isNaN(historicoId)) {
    return c.json({ success: false, error: 'historicoId inválido' }, 400);
  }
  let body: { target_tipo_id?: string; reason?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'JSON inválido' }, 400);
  }
  if (!body.target_tipo_id) {
    return c.json({ success: false, error: 'target_tipo_id é obrigatório' }, 400);
  }
  // Validar existência do tipo
  const tipoExists = await db
    .prepare('SELECT id FROM qualificacoes_tipos WHERE id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(body.target_tipo_id)
    .first();
  if (!tipoExists) {
    return c.json({ success: false, error: 'Tipo alvo não encontrado' }, 404);
  }
  // Validar existência fila
  const queueRow = await db
    .prepare(
      'SELECT id, status FROM qualificacoes_historico_reclass_queue WHERE historico_id = ? LIMIT 1',
    )
    .bind(historicoId)
    .first<{ id: number; status: string }>();
  if (!queueRow) {
    return c.json({ success: false, error: 'Registro não está na fila' }, 404);
  }
  if (queueRow.status !== 'PENDING') {
    return c.json({ success: false, error: 'Registro já processado' }, 409);
  }
  // Aplicar - trigger cuidará da atualização em qualificacoes_historico
  const upd = await db
    .prepare(
      `UPDATE qualificacoes_historico_reclass_queue
       SET target_tipo_id = ?, status='APPLIED', reason = COALESCE(?, reason), updated_at = datetime('now')
       WHERE historico_id = ? AND status='PENDING'`,
    )
    .bind(body.target_tipo_id, body.reason || null, historicoId)
    .run();
  if (upd.meta.changes === 0) {
    return c.json({ success: false, error: 'Falha ao aplicar reclassificação' }, 500);
  }
  // Retornar linha atualizada do histórico
  const updatedHistorico = await db
    .prepare(
      `SELECT h.id, h.funcionario_id, h.qualificacao_id, h.codigo, h.categoria, h.data_conclusao, h.data_vencimento
       FROM qualificacoes_historico h WHERE h.id = ? LIMIT 1`,
    )
    .bind(historicoId)
    .first();
  return c.json({ success: true, data: updatedHistorico, message: 'Reclassificação aplicada' });
});

// GET /sugestoes/:historicoId - heurísticas simples
// Estratégia: pegar categoria (sempre TREINAMENTO no colapso atual), listar tipos da mesma categoria
// e ranquear por validade_meses DESC + ocorrência do código no campo observações (se houver)
app.get('/sugestoes/:historicoId', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const historicoIdRaw = c.req.param('historicoId');
  const historicoId = parseInt(historicoIdRaw, 10);
  if (isNaN(historicoId)) return c.json({ success: false, error: 'historicoId inválido' }, 400);
  // Obter linha base
  const base = await db
    .prepare(
      `SELECT h.id, h.observacoes, h.numero_certificado, h.categoria, h.data_conclusao, h.data_vencimento
       FROM qualificacoes_historico h WHERE h.id = ? LIMIT 1`,
    )
    .bind(historicoId)
    .first<{
      id: number;
      observacoes: string | null;
      numero_certificado: string | null;
      categoria: string | null;
      data_conclusao: string | null;
      data_vencimento: string | null;
    }>();
  if (!base) return c.json({ success: false, error: 'Histórico não encontrado' }, 404);
  const categoria = base.categoria || 'TREINAMENTO';
  // Coletar tipos da mesma categoria
  const { results: tipos } = await db
    .prepare(
      `SELECT id, nome, codigo, categoria, validade
       FROM qualificacoes_tipos WHERE deleted_at IS NULL AND categoria = ? ORDER BY validade DESC, nome ASC LIMIT 200`,
    )
    .bind(categoria)
    .all<{
      id: string;
      nome: string;
      codigo: string;
      categoria: string;
      validade: number | null;
    }>();
  const obs = (base.observacoes || '').toLowerCase();
  const cert = (base.numero_certificado || '').toLowerCase();
  // Scoring
  const scored = (tipos || []).map((t) => {
    let score = 0;
    if (typeof t.validade === 'number') score += t.validade * 2; // peso validade
    // match por código / partes no obs ou certificado
    const codeLower = t.codigo.toLowerCase();
    if (obs.includes(codeLower)) score += 15;
    if (cert.includes(codeLower)) score += 10;
    // Palavras do nome
    const nomeParts = t.nome.toLowerCase().split(/\s+/).filter(Boolean);
    for (const p of nomeParts) {
      if (obs.includes(p)) score += 2;
      if (cert.includes(p)) score += 1;
    }
    return { ...t, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 10);
  return c.json({ success: true, data: top, meta: { total_avaliados: scored.length } });
});

// GET /queue/export - exportar pendentes
app.get('/queue/export', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const format = (c.req.query('format') || 'csv').toLowerCase();
  const { results } = await db
    .prepare(
      `SELECT q.id as queue_id, q.historico_id, q.current_codigo, h.funcionario_id, f.nome as funcionario_nome,
              h.data_conclusao, h.data_vencimento, h.numero_certificado, h.observacoes
       FROM qualificacoes_historico_reclass_queue q
       JOIN qualificacoes_historico h ON h.id = q.historico_id
       LEFT JOIN funcionarios f ON f.id = h.funcionario_id
       WHERE q.status='PENDING'
       ORDER BY h.data_conclusao DESC`,
    )
    .all();
  if (format === 'json') {
    return c.json({ success: true, data: results || [] });
  }
  // CSV
  const header = [
    'queue_id',
    'historico_id',
    'current_codigo',
    'funcionario_id',
    'funcionario_nome',
    'data_conclusao',
    'data_vencimento',
    'numero_certificado',
    'observacoes',
  ];
  const lines = [header.join(',')];
  for (const r of results || []) {
    lines.push(header.map((h) => csvEscape((r as Record<string, unknown>)[h])).join(','));
  }
  const csv = lines.join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="reclass_queue_pending.csv"',
    },
  });
});

export default app;
