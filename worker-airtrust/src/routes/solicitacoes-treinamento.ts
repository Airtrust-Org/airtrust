/**
 * Solicitações de Treinamento — PRG-OPS-001
 *
 * Workflow: SOLICITADA → APROVADA_GESTOR → APROVADA_OPS → AGENDADA → CONCLUIDA
 *
 * Endpoints:
 *   GET    /api/treinamentos/solicitacoes          — listar (com filtros)
 *   GET    /api/treinamentos/solicitacoes/:id       — detalhe
 *   POST   /api/treinamentos/solicitacoes           — criar solicitação
 *   POST   /api/treinamentos/solicitacoes/:id/aprovar-gestor  — aprovar como gestor
 *   POST   /api/treinamentos/solicitacoes/:id/aprovar-ops     — aprovar como ops
 *   POST   /api/treinamentos/solicitacoes/:id/rejeitar        — rejeitar
 *   POST   /api/treinamentos/solicitacoes/:id/agendar         — agendar (data)
 *   POST   /api/treinamentos/solicitacoes/:id/concluir        — marcar como concluída
 *   GET    /api/treinamentos/solicitacoes/stats               — estatísticas
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import {
  sincronizarSolicitacaoAgendadaComTreinamentoPlanejado,
  sincronizarSolicitacaoConcluidaComTreinamentoPlanejado,
} from '../services/treinamentos-planejados-integration';

const solicitacoesRoutes = new Hono<{ Bindings: Env }>();

solicitacoesRoutes.use('*', auth());

const createSchema = z.object({
  solicitante_id: z.number().int(),
  qualificacao_id: z.number().int().optional(),
  tipo_treinamento: z.enum(['INICIAL', 'RECORRENTE', 'SEMESTRAL', 'UPGRADE', 'ESPECIFICO']),
  titulo: z.string().min(3).max(200),
  descricao: z.string().optional(),
  justificativa: z.string().optional(),
  prioridade: z.enum(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']).default('NORMAL'),
  data_prevista: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// GET /api/treinamentos/solicitacoes?status=...&solicitante_id=...
solicitacoesRoutes.get('/solicitacoes', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const status = c.req.query('status');
  const solicitanteId = c.req.query('solicitante_id');

  let sql = `SELECT s.*, f.nome AS solicitante_nome, f.guerra AS solicitante_guerra,
                    qt.nome AS qualificacao_nome, qt.codigo AS qualificacao_codigo
             FROM solicitacoes_treinamento s
             LEFT JOIN funcionarios f ON f.id = s.solicitante_id
             LEFT JOIN qualificacoes_tipos qt ON qt.id = s.qualificacao_id
             WHERE s.empresa_id = ? AND s.deleted_at IS NULL`;
  const params: unknown[] = [empresaId];

  if (status) {
    sql += ' AND s.status = ?';
    params.push(status);
  }
  if (solicitanteId) {
    sql += ' AND s.solicitante_id = ?';
    params.push(Number(solicitanteId));
  }

  sql += ' ORDER BY s.created_at DESC LIMIT 200';

  const results = await db
    .prepare(sql)
    .bind(...params)
    .all();
  return c.json({ success: true, data: results.results || [] });
});

// GET /api/treinamentos/solicitacoes/stats
solicitacoesRoutes.get('/solicitacoes/stats', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  const stats = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'SOLICITADA' THEN 1 ELSE 0 END) AS solicitadas,
         SUM(CASE WHEN status = 'APROVADA_GESTOR' THEN 1 ELSE 0 END) AS aprovadas_gestor,
         SUM(CASE WHEN status = 'APROVADA_OPS' THEN 1 ELSE 0 END) AS aprovadas_ops,
         SUM(CASE WHEN status = 'AGENDADA' THEN 1 ELSE 0 END) AS agendadas,
         SUM(CASE WHEN status = 'CONCLUIDA' THEN 1 ELSE 0 END) AS concluidas,
         SUM(CASE WHEN status = 'REJEITADA' THEN 1 ELSE 0 END) AS rejeitadas
       FROM solicitacoes_treinamento
       WHERE empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(empresaId)
    .first();

  return c.json({ success: true, data: stats });
});

// GET /api/treinamentos/solicitacoes/:id
solicitacoesRoutes.get('/solicitacoes/:id', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');

  const item = await db
    .prepare(
      `SELECT s.*, f.nome AS solicitante_nome, f.guerra AS solicitante_guerra,
              qt.nome AS qualificacao_nome, qt.codigo AS qualificacao_codigo
       FROM solicitacoes_treinamento s
       LEFT JOIN funcionarios f ON f.id = s.solicitante_id
       LEFT JOIN qualificacoes_tipos qt ON qt.id = s.qualificacao_id
       WHERE s.id = ? AND s.empresa_id = ? AND s.deleted_at IS NULL`,
    )
    .bind(id, empresaId)
    .first();

  if (!item) return c.json({ success: false, error: 'Solicitação não encontrada' }, 404);
  return c.json({ success: true, data: item });
});

// POST /api/treinamentos/solicitacoes
solicitacoesRoutes.post('/solicitacoes', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const body = await c.req.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { success: false, error: 'Dados inválidos', details: parsed.error.flatten() },
      400,
    );
  }

  const d = parsed.data;
  const id = crypto.randomUUID();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  await db
    .prepare(
      `INSERT INTO solicitacoes_treinamento (
         id, empresa_id, solicitante_id, qualificacao_id,
         tipo_treinamento, titulo, descricao, justificativa,
         prioridade, data_prevista, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SOLICITADA', ?, ?)`,
    )
    .bind(
      id,
      empresaId,
      d.solicitante_id,
      d.qualificacao_id || null,
      d.tipo_treinamento,
      d.titulo,
      d.descricao || null,
      d.justificativa || null,
      d.prioridade,
      d.data_prevista || null,
      now,
      now,
    )
    .run();

  return c.json({ success: true, data: { id } }, 201);
});

// Workflow transitions

// POST /api/treinamentos/solicitacoes/:id/aprovar-gestor
solicitacoesRoutes.post(
  '/solicitacoes/:id/aprovar-gestor',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const id = c.req.param('id');

    const item = await db
      .prepare(
        'SELECT id, status FROM solicitacoes_treinamento WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .first<{ id: string; status: string }>();

    if (!item) return c.json({ success: false, error: 'Não encontrada' }, 404);
    if (item.status !== 'SOLICITADA') {
      return c.json(
        { success: false, error: `Status atual "${item.status}" não permite esta ação` },
        400,
      );
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    await db
      .prepare(
        "UPDATE solicitacoes_treinamento SET status = 'APROVADA_GESTOR', aprovado_gestor_em = ?, updated_at = ? WHERE id = ?",
      )
      .bind(now, now, id)
      .run();

    return c.json({ success: true });
  },
);

// POST /api/treinamentos/solicitacoes/:id/aprovar-ops
solicitacoesRoutes.post(
  '/solicitacoes/:id/aprovar-ops',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const id = c.req.param('id');

    const item = await db
      .prepare(
        'SELECT id, status FROM solicitacoes_treinamento WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .first<{ id: string; status: string }>();

    if (!item) return c.json({ success: false, error: 'Não encontrada' }, 404);
    if (item.status !== 'APROVADA_GESTOR') {
      return c.json(
        { success: false, error: `Status atual "${item.status}" não permite esta ação` },
        400,
      );
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    await db
      .prepare(
        "UPDATE solicitacoes_treinamento SET status = 'APROVADA_OPS', aprovado_ops_em = ?, updated_at = ? WHERE id = ?",
      )
      .bind(now, now, id)
      .run();

    return c.json({ success: true });
  },
);

// POST /api/treinamentos/solicitacoes/:id/rejeitar
solicitacoesRoutes.post(
  '/solicitacoes/:id/rejeitar',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const id = c.req.param('id');
    const { motivo } = (await c.req.json()) as { motivo?: string };

    const item = await db
      .prepare(
        'SELECT id, status FROM solicitacoes_treinamento WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
      )
      .bind(id, empresaId)
      .first<{ id: string; status: string }>();

    if (!item) return c.json({ success: false, error: 'Não encontrada' }, 404);
    if (item.status === 'CONCLUIDA' || item.status === 'REJEITADA') {
      return c.json({ success: false, error: 'Status final, não pode ser alterado' }, 400);
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    await db
      .prepare(
        "UPDATE solicitacoes_treinamento SET status = 'REJEITADA', motivo_rejeicao = ?, rejeitado_em = ?, updated_at = ? WHERE id = ?",
      )
      .bind(motivo || null, now, now, id)
      .run();

    return c.json({ success: true });
  },
);

// POST /api/treinamentos/solicitacoes/:id/agendar
solicitacoesRoutes.post('/solicitacoes/:id/agendar', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const id = c.req.param('id');
  const { data_prevista, sessao_simulador_id } = (await c.req.json()) as {
    data_prevista?: string;
    sessao_simulador_id?: string;
  };

  const item = await db
    .prepare(
      'SELECT id, status FROM solicitacoes_treinamento WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(id, empresaId)
    .first<{ id: string; status: string }>();

  if (!item) return c.json({ success: false, error: 'Não encontrada' }, 404);
  if (item.status !== 'APROVADA_OPS' && item.status !== 'APROVADA_GESTOR') {
    return c.json({ success: false, error: 'Precisa estar aprovada para agendar' }, 400);
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  await db
    .prepare(
      "UPDATE solicitacoes_treinamento SET status = 'AGENDADA', data_prevista = ?, sessao_simulador_id = ?, updated_at = ? WHERE id = ?",
    )
    .bind(data_prevista || null, sessao_simulador_id || null, now, id)
    .run();

  await sincronizarSolicitacaoAgendadaComTreinamentoPlanejado({
    db,
    empresaId,
    solicitacaoId: id,
    dataPrevista: data_prevista || null,
  });

  return c.json({ success: true });
});

// POST /api/treinamentos/solicitacoes/:id/concluir
solicitacoesRoutes.post(
  '/solicitacoes/:id/concluir',
  requireRole('admin', 'manager'),
  async (c) => {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const id = c.req.param('id');

    const item = await db
      .prepare(
        `SELECT s.id, s.status, s.solicitante_id, s.qualificacao_id, s.tipo_treinamento,
                qt.codigo AS qualificacao_codigo, qt.nome AS qualificacao_nome,
                qt.categoria AS qualificacao_categoria, qt.validade AS qualificacao_validade
         FROM solicitacoes_treinamento s
         LEFT JOIN qualificacoes_tipos qt ON qt.id = s.qualificacao_id AND qt.deleted_at IS NULL
         WHERE s.id = ? AND s.empresa_id = ? AND s.deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .first<{
        id: string;
        status: string;
        solicitante_id: number;
        qualificacao_id: number | null;
        tipo_treinamento: string;
        qualificacao_codigo: string | null;
        qualificacao_nome: string | null;
        qualificacao_categoria: string | null;
        qualificacao_validade: number | null;
      }>();

    if (!item) return c.json({ success: false, error: 'Não encontrada' }, 404);

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const dataRealizada = now.slice(0, 10);

    await db
      .prepare(
        "UPDATE solicitacoes_treinamento SET status = 'CONCLUIDA', data_realizada = ?, updated_at = ? WHERE id = ?",
      )
      .bind(dataRealizada, now, id)
      .run();

    const trainingSync = await sincronizarSolicitacaoConcluidaComTreinamentoPlanejado({
      db,
      empresaId,
      solicitacaoId: id,
      dataRealizada,
    });

    // Gerar qualificação quando a solicitação é conclusa e tem qualificacao_id
    if (item.qualificacao_id && item.qualificacao_codigo && !trainingSync.qualificacaoHistoricoId) {
      try {
        const validadeMeses =
          typeof item.qualificacao_validade === 'number' && item.qualificacao_validade > 0
            ? item.qualificacao_validade
            : 12;
        const dataVencimento = new Date(dataRealizada);
        dataVencimento.setMonth(dataVencimento.getMonth() + validadeMeses);
        const dataVencimentoStr = dataVencimento.toISOString().slice(0, 10);

        await db
          .prepare(
            `INSERT INTO qualificacoes_historico (
               funcionario_id, qualificacao_id, qualificacao_codigo, tipo_codigo, codigo,
               categoria, data_conclusao, data_vencimento, validade_meses, observacoes,
               empresa_id, tipo, tipo_treinamento, status, origem_tipo, created_at, updated_at
             ) VALUES (?, ?, ?, 'TREINAMENTO', ?, ?, ?, ?, ?, ?, ?, 'PRESENCIAL', ?, 'CONCLUIDA', 'PRESENCIAL', datetime('now'), datetime('now'))`,
          )
          .bind(
            item.solicitante_id,
            item.qualificacao_id,
            item.qualificacao_codigo,
            item.qualificacao_codigo,
            item.qualificacao_categoria ?? 'TREINAMENTO',
            dataRealizada,
            dataVencimentoStr,
            validadeMeses,
            `Origem: Solicitação de Treinamento #${item.id}`,
            empresaId,
            item.tipo_treinamento ?? 'RECORRENTE',
          )
          .run();
      } catch (qualErr) {
        console.error('[SOLICITACAO] Erro ao gerar qualificação ao concluir:', qualErr);
        // não bloqueia a conclusão
      }
    }

    return c.json({ success: true });
  },
);

export default solicitacoesRoutes;
