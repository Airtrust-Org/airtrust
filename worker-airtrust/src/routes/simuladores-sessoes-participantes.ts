/**
 * SIMULADORES — Participantes e Checks de sessão
 * Extraído de simuladores-sessoes.ts
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { removeManagedEscalaEvents } from '../shared/syncEscalaEventosExternos';
import {
  requireAdminForDelete,
  syncSessaoEscalaEventos,
  filtrarChecksCompativeisComModelo,
  getSimuladorModeloAeronave,
  resolveTemplateIdSessao,
} from './simuladores-shared';

const app = new Hono<{ Bindings: Env }>();

// ==========================================================================
// PARTICIPANTES
// ==========================================================================

app.get('/sessoes/:id/participantes', async (c) => {
  try {
    const id = c.req.param('id');
    const p = await c.env.DB.prepare(
      'SELECT sp.*,f.nome as funcionario_nome FROM sessoes_participantes sp LEFT JOIN funcionarios f ON sp.funcionario_id=f.id WHERE sp.sessao_id=? AND sp.deleted_at IS NULL',
    )
      .bind(id)
      .all();
    return c.json({ success: true, data: p.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post('/sessoes/:id/participantes', async (c) => {
  try {
    const sid = c.req.param('id');
    const b = await c.req.json();
    if (!b.funcionario_id || !b.funcao)
      return c.json({ success: false, error: 'funcionario_id,funcao obrigatórios' }, 400);
    const partUuid = crypto.randomUUID();
    const r = await c.env.DB.prepare(
      'INSERT INTO sessoes_participantes(uuid,sessao_id,funcionario_id,funcao,status)VALUES(?,?,?,?,?)',
    )
      .bind(partUuid, sid, b.funcionario_id, b.funcao, b.status || 'CONFIRMADO')
      .run();
    const p = await c.env.DB.prepare(
      'SELECT * FROM sessoes_participantes WHERE id=? AND deleted_at IS NULL',
    )
      .bind(r.meta.last_row_id)
      .first();

    const sessao = await c.env.DB.prepare(
      `SELECT id, simulador_id, data, status, nome, tipo_sessao, observacoes, empresa_id
         FROM simulador_agendamentos
        WHERE id = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
      .bind(sid)
      .first<{
        id: string;
        simulador_id: number | null;
        data: string;
        status: string | null;
        nome: string | null;
        tipo_sessao: string | null;
        observacoes: string | null;
        empresa_id: number | null;
      }>();

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
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.put('/participantes/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const b = await c.req.json();
    const a = await c.env.DB.prepare(
      'SELECT * FROM sessoes_participantes WHERE id=? AND deleted_at IS NULL',
    )
      .bind(id)
      .first();
    if (!a) return c.json({ success: false, error: 'Não encontrado' }, 404);
    await c.env.DB.prepare(
      "UPDATE sessoes_participantes SET funcao=?,presente=?,updated_at=datetime('now')WHERE id=?",
    )
      .bind(b.funcao || a.funcao, b.presente !== undefined ? b.presente : a.presente, id)
      .run();
    const u = await c.env.DB.prepare(
      'SELECT * FROM sessoes_participantes WHERE id=? AND deleted_at IS NULL',
    )
      .bind(id)
      .first();
    return c.json({ success: true, data: u });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.delete('/participantes/:id', async (c) => {
  try {
    const denied = requireAdminForDelete(c);
    if (denied) return denied;

    const id = c.req.param('id');
    const participante = await c.env.DB.prepare(
      `SELECT id, sessao_id, funcionario_id
         FROM sessoes_participantes
        WHERE id=? AND deleted_at IS NULL`,
    )
      .bind(id)
      .first<{ id: string; sessao_id: string | number; funcionario_id: string | number }>();

    if (!participante) return c.json({ success: false, error: 'Participante não encontrado' }, 404);

    await c.env.DB.prepare("UPDATE sessoes_participantes SET deleted_at=datetime('now')WHERE id=?")
      .bind(id)
      .run();

    await removeManagedEscalaEvents({
      db: c.env.DB,
      funcionarioId: participante.funcionario_id,
      origem: 'simuladores',
      linkId: `sim_sessao:${participante.sessao_id}`,
    });

    return c.json({ success: true, message: 'Removido' });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ==========================================================================
// CHECKS COM EXAMINADORES
// ==========================================================================

// GET /api/simuladores/sessoes/:id/checks - Listar checks de uma sessão
app.get('/sessoes/:id/checks', async (c) => {
  try {
    const id = c.req.param('id');
    const sessao = await c.env.DB.prepare(
      `SELECT sa.simulador_id, sa.template_id, sa.nome, sa.tipo_sessao
       FROM simulador_agendamentos sa
       WHERE sa.id = ? AND sa.deleted_at IS NULL`,
    )
      .bind(id)
      .first<{ simulador_id: number; template_id: number | null; nome: string | null; tipo_sessao: string | null }>();

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
      LEFT JOIN sessoes_checks_resultados scr ON sc.id = scr.sessao_check_id AND scr.deleted_at IS NULL
      WHERE sc.sessao_id = ? AND sc.deleted_at IS NULL
      ORDER BY qt.codigo`,
    )
      .bind(id)
      .all();

    if ((result.results || []).length > 0) {
      return c.json({ success: true, data: result.results });
    }

    const modeloAeronaveSessao = await getSimuladorModeloAeronave(c.env.DB, sessao.simulador_id);
    const templateIdSessao =
      sessao.template_id ||
      (await resolveTemplateIdSessao(c.env.DB, {
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
       ORDER BY qt.codigo`,
    )
      .bind(templateIdSessao)
      .all<{ qualificacao_tipo_id: number; codigo: string; nome: string; descricao: string | null }>();

    const checksCompativeis = filtrarChecksCompativeisComModelo(
      fallback.results || [],
      modeloAeronaveSessao,
    );

    return c.json({ success: true, data: checksCompativeis });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export default app;
