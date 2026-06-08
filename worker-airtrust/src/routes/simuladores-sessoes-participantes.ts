/**
 * SIMULADORES — Participantes e Checks de sessão
 * Extraído de simuladores-sessoes.ts
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { getTenantContext } from '../middleware/tenant';
import { removeManagedEscalaEvents } from '../shared/syncEscalaEventosExternos';
import {
  requireAdminForDelete,
  syncSessaoEscalaEventos,
  filtrarChecksCompativeisComModelo,
  getSimuladorModeloAeronave,
  resolveTemplateIdSessao,
} from './simuladores-shared';

const app = new Hono<{ Bindings: Env }>();

type SessaoScoped = {
  id: string;
  simulador_id: number | null;
  data: string;
  status: string | null;
  nome: string | null;
  tipo_sessao: string | null;
  observacoes: string | null;
  empresa_id: number | null;
  template_id?: number | null;
};

type ParticipanteScoped = {
  id: string | number;
  sessao_id: string | number;
  funcionario_id: string | number;
  funcao?: string | null;
  presente?: number | null;
};

async function getSessaoScoped(
  db: D1Database,
  sessaoId: string,
  empresaId: number,
): Promise<SessaoScoped | null> {
  return db
    .prepare(
      `SELECT id, simulador_id, data, status, nome, tipo_sessao, observacoes, empresa_id, template_id
         FROM simulador_agendamentos
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(sessaoId, empresaId)
    .first<SessaoScoped>();
}

async function getParticipanteScoped(
  db: D1Database,
  participanteId: string,
  empresaId: number,
): Promise<ParticipanteScoped | null> {
  return db
    .prepare(
      `SELECT sp.id, sp.sessao_id, sp.funcionario_id, sp.funcao, sp.presente
         FROM sessoes_participantes sp
         INNER JOIN simulador_agendamentos sa
           ON sa.id = sp.sessao_id
          AND sa.empresa_id = ?
          AND sa.deleted_at IS NULL
        WHERE sp.id = ? AND sp.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(empresaId, participanteId)
    .first<ParticipanteScoped>();
}

async function hasFuncionarioScoped(
  db: D1Database,
  funcionarioId: string | number,
  empresaId: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT id
         FROM funcionarios
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<{ id: string | number }>();

  return Boolean(row);
}

// ==========================================================================
// PARTICIPANTES
// ==========================================================================

app.get('/sessoes/:id/participantes', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');
    const sessao = await getSessaoScoped(c.env.DB, id, empresaId);
    if (!sessao) return c.json({ success: false, error: 'Sessão não encontrada' }, 404);

    const p = await c.env.DB.prepare(
      `SELECT sp.*, f.nome AS funcionario_nome
         FROM sessoes_participantes sp
         INNER JOIN simulador_agendamentos sa
           ON sa.id = sp.sessao_id
          AND sa.empresa_id = ?
          AND sa.deleted_at IS NULL
         LEFT JOIN funcionarios f
           ON sp.funcionario_id = f.id
          AND f.empresa_id = ?
          AND f.deleted_at IS NULL
        WHERE sp.sessao_id = ? AND sp.deleted_at IS NULL`,
    )
      .bind(empresaId, empresaId, id)
      .all();
    return c.json({ success: true, data: p.results });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.post('/sessoes/:id/participantes', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const sid = c.req.param('id');
    const b = await c.req.json();
    if (!b.funcionario_id || !b.funcao)
      return c.json({ success: false, error: 'funcionario_id,funcao obrigatórios' }, 400);

    const sessao = await getSessaoScoped(c.env.DB, sid, empresaId);
    if (!sessao) return c.json({ success: false, error: 'Sessão não encontrada' }, 404);

    const funcionarioValido = await hasFuncionarioScoped(c.env.DB, b.funcionario_id, empresaId);
    if (!funcionarioValido) {
      return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);
    }

    const partUuid = crypto.randomUUID();
    const r = await c.env.DB.prepare(
      'INSERT INTO sessoes_participantes(uuid,sessao_id,funcionario_id,funcao,status)VALUES(?,?,?,?,?)',
    )
      .bind(partUuid, sid, b.funcionario_id, b.funcao, b.status || 'CONFIRMADO')
      .run();
    const p = await getParticipanteScoped(c.env.DB, String(r.meta.last_row_id), empresaId);

    if (sessao) {
      await syncSessaoEscalaEventos(c.env.DB, {
        empresaId: sessao.empresa_id,
        sessaoId: sessao.id,
        simuladorId: sessao.simulador_id,
        data: sessao.data,
        status: sessao.status,
        temaSessao: sessao.nome,
        tipoSessao: sessao.tipo_sessao,
        observacoes: sessao.observacoes,
        participantes: [{ funcionario_id: b.funcionario_id }],
        createdBy: String((c as any).get('userId') || 'system'),
      });
    }

    return c.json({ success: true, data: p }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.put('/participantes/:id', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');
    const b = await c.req.json();
    const a = await getParticipanteScoped(c.env.DB, id, empresaId);
    if (!a) return c.json({ success: false, error: 'Não encontrado' }, 404);
    await c.env.DB.prepare(
      `UPDATE sessoes_participantes
          SET funcao=?,
              presente=?,
              updated_at=datetime('now')
        WHERE id=?
          AND sessao_id=?
          AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1
              FROM simulador_agendamentos sa
             WHERE sa.id = sessoes_participantes.sessao_id
               AND sa.empresa_id = ?
               AND sa.deleted_at IS NULL
          )`,
    )
      .bind(
        b.funcao || a.funcao,
        b.presente !== undefined ? b.presente : a.presente,
        id,
        a.sessao_id,
        empresaId,
      )
      .run();
    const u = await getParticipanteScoped(c.env.DB, id, empresaId);
    return c.json({ success: true, data: u });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

app.delete('/participantes/:id', async (c) => {
  try {
    const denied = requireAdminForDelete(c);
    if (denied) return denied;

    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');
    const participante = await getParticipanteScoped(c.env.DB, id, empresaId);

    if (!participante) return c.json({ success: false, error: 'Participante não encontrado' }, 404);

    await c.env.DB.prepare(
      `UPDATE sessoes_participantes
          SET deleted_at=datetime('now')
        WHERE id=?
          AND sessao_id=?
          AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1
              FROM simulador_agendamentos sa
             WHERE sa.id = sessoes_participantes.sessao_id
               AND sa.empresa_id = ?
               AND sa.deleted_at IS NULL
          )`,
    )
      .bind(id, participante.sessao_id, empresaId)
      .run();

    await removeManagedEscalaEvents({
      db: c.env.DB,
      funcionarioId: participante.funcionario_id,
      origem: 'simuladores',
      linkId: `sim_sessao:${participante.sessao_id}`,
    });

    return c.json({ success: true, message: 'Removido' });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

// ==========================================================================
// CHECKS COM EXAMINADORES
// ==========================================================================

// GET /api/simuladores/sessoes/:id/checks - Listar checks de uma sessão
app.get('/sessoes/:id/checks', async (c) => {
  try {
    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');
    const sessao = await getSessaoScoped(c.env.DB, id, empresaId);

    if (!sessao) {
      return c.json({ success: false, error: 'Sessão não encontrada' }, 404);
    }

    const result = await c.env.DB.prepare(
      `SELECT
        sc.id,
        sc.qualificacao_tipo_id,
        qt.codigo,
        qt.nome,
        qt.descricao,
        scr.aprovado,
        scr.observacoes
      FROM sessoes_checks sc
      INNER JOIN qualificacoes_tipos qt ON sc.qualificacao_tipo_id = qt.id
                                       AND qt.deleted_at IS NULL
                                       AND qt.ativo = 1
                                       AND qt.empresa_id = ?
      LEFT JOIN sessoes_checks_resultados scr ON sc.id = scr.sessao_check_id AND scr.deleted_at IS NULL
      WHERE sc.sessao_id = ? AND sc.deleted_at IS NULL
      ORDER BY qt.codigo`,
    )
      .bind(empresaId, id)
      .all();

    if ((result.results || []).length > 0) {
      return c.json({ success: true, data: result.results });
    }

    const modeloAeronaveSessao = await getSimuladorModeloAeronave(c.env.DB, sessao.simulador_id);
    const templateIdSessao =
      sessao.template_id ||
      (await resolveTemplateIdSessao(c.env.DB, {
        empresaId,
        temaSessao: sessao.nome,
        tipoSessaoCodigo: sessao.tipo_sessao,
        modeloAeronave: modeloAeronaveSessao,
      }));

    if (!templateIdSessao) {
      return c.json({ success: true, data: [] });
    }

    const fallback = await c.env.DB.prepare(
      `SELECT msc.qualificacao_tipo_id, qt.codigo, qt.nome, qt.descricao
       FROM modelos_sessao_checks msc
       INNER JOIN qualificacoes_tipos qt ON qt.id = msc.qualificacao_tipo_id
       WHERE msc.modelo_id = ?
         AND msc.deleted_at IS NULL
         AND qt.deleted_at IS NULL
         AND qt.ativo = 1
         AND qt.empresa_id = ?
       ORDER BY qt.codigo`,
    )
      .bind(templateIdSessao, empresaId)
      .all<{ qualificacao_tipo_id: number; codigo: string; nome: string; descricao: string | null }>();

    const checksCompativeis = filtrarChecksCompativeisComModelo(
      fallback.results || [],
      modeloAeronaveSessao,
    );

    return c.json({ success: true, data: checksCompativeis });
  } catch (e: any) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
