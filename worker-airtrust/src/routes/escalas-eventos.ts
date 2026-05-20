/**
 * ESCALAS — Eventos (POST/GET/PUT/DELETE)
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { verificarConflitosEscala } from '../utils/escala-engine';
import { getEmpresaIdSafe, getEscalaVerificada, parseBody, EventoSchema } from './escalas-shared';

const eventos = new Hono<{ Bindings: Env }>();

async function auditarEvento(
  db: D1Database,
  params: {
    escala_id: string;
    acao: string;
    evento_id: string;
    realizado_por: string;
    valor_anterior?: string;
    valor_novo?: string;
  },
) {
  const now = new Date().toISOString();
  try {
    await Promise.all([
      db
        .prepare(
          `INSERT INTO escala_auditoria (id, escala_id, acao, realizado_por, detalhes, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          params.escala_id,
          params.acao,
          params.realizado_por,
          JSON.stringify({
            evento_id: params.evento_id,
            valor_anterior: params.valor_anterior,
            valor_novo: params.valor_novo,
          }),
          now,
        )
        .run(),
      db
        .prepare(
          `INSERT INTO auditoria_avancada_v2
           (id, empresa_id, usuario_id, acao, tabela, registro_id, valor_anterior, valor_novo, created_at)
           VALUES (?, (SELECT empresa_id FROM escalas_mensais WHERE id = ?), ?, ?, 'escala_eventos', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          params.escala_id,
          params.realizado_por,
          params.acao,
          params.evento_id,
          params.valor_anterior || null,
          params.valor_novo || null,
          now,
        )
        .run(),
    ]);
  } catch (err) {
    console.error('audit_evento_error', err);
  }
}

type EventoConflitante = {
  id: string;
  origem?: string | null;
};

function getManagedEventLockMessage(origem: string | null | undefined) {
  if (origem === 'simuladores') {
    return 'Este evento é gerenciado pelo módulo Simuladores e só pode ser alterado por lá';
  }

  if (origem === 'funcionario_ferias') {
    return 'Este evento é gerenciado pelo módulo Funcionários e só pode ser alterado por lá';
  }

  return null;
}

async function replaceConflictingEvents(
  db: D1Database,
  escalaId: string,
  conflicts: EventoConflitante[],
) {
  if (conflicts.length === 0) {
    return { replaced: 0 };
  }

  const blockedConflict = conflicts.find((conflict) => getManagedEventLockMessage(conflict.origem));
  if (blockedConflict) {
    const message = getManagedEventLockMessage(blockedConflict.origem);
    return { replaced: 0, blockedMessage: message };
  }

  const now = new Date().toISOString();
  const ids = conflicts.map((conflict) => conflict.id);
  const placeholders = ids.map(() => '?').join(', ');

  await db
    .prepare(
      `UPDATE escala_eventos
          SET deleted_at = ?, updated_at = ?
        WHERE escala_id = ?
          AND id IN (${placeholders})
          AND deleted_at IS NULL`,
    )
    .bind(now, now, escalaId, ...ids)
    .run();

  return { replaced: ids.length };
}

// POST /:id/eventos — adicionar evento/alocação
eventos.post('/:id/eventos', auth(), requireRole('admin', 'manager'), async (c) => {
  const { id: escala_id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userId = String((c as unknown as { get: (key: string) => unknown }).get('userId') || '');
  const body = await c.req.json();
  const parsed = parseBody(EventoSchema, body);
  if (!parsed.ok) return c.json({ success: false, error: parsed.error }, 400);

  try {
    const escala = await getEscalaVerificada(db, escala_id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const d = parsed.data;

    const conflitos = await verificarConflitosEscala(db, {
      escala_id,
      funcionario_id: d.funcionario_id,
      data_inicio: d.data_inicio,
      data_fim: d.data_fim,
    });

    if (conflitos.length > 0) {
      const replacement = await replaceConflictingEvents(
        db,
        escala_id,
        conflitos as EventoConflitante[],
      );

      if (replacement.blockedMessage) {
        return c.json(
          {
            success: false,
            error: replacement.blockedMessage,
            code: 'EVENTO_GERENCIADO_EXTERNAMENTE',
            conflitos,
          },
          409,
        );
      }
    }

    const eventoId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO escala_eventos
         (id, escala_id, tripulacao_id, funcionario_id, tipo_evento, data_inicio, data_fim,
          turno, local, aeronave, simulador_id, certificacao_id, gerado_automaticamente,
          motivo_automatico, status, observacoes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?)`,
      )
      .bind(
        eventoId,
        escala_id,
        d.tripulacao_id || null,
        d.funcionario_id,
        d.tipo_evento,
        d.data_inicio,
        d.data_fim,
        d.turno || 'dia_todo',
        d.local || null,
        d.aeronave || null,
        d.simulador_id || null,
        d.certificacao_id || null,
        d.status,
        d.observacoes || null,
        userId,
        now,
        now,
      )
      .run();

    await auditarEvento(db, {
      escala_id,
      acao: 'CRIAR_EVENTO',
      evento_id: eventoId,
      realizado_por: userId,
      valor_novo: JSON.stringify({
        funcionario_id: d.funcionario_id,
        tipo_evento: d.tipo_evento,
        data_inicio: d.data_inicio,
        data_fim: d.data_fim,
        status: d.status,
      }),
    });

    return c.json({ success: true, data: { id: eventoId } }, 201);
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// GET /:id/eventos — listar eventos
eventos.get('/:id/eventos', auth(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const result = await db
      .prepare(
        `SELECT ee.*,
                f.nome as funcionario_nome, f.matricula as funcionario_matricula,
                f.cargo as funcionario_cargo
         FROM escala_eventos ee
         JOIN escalas_mensais em ON em.id = ee.escala_id
         LEFT JOIN funcionarios f ON ee.funcionario_id = f.id AND (f.empresa_id IS NULL OR f.empresa_id = em.empresa_id)
         WHERE ee.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND ee.deleted_at IS NULL
         ORDER BY ee.data_inicio, f.nome`,
      )
      .bind(id, empresaId)
      .all();
    return c.json({ success: true, data: result.results });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// PUT /:id/eventos/:eventoId — atualizar evento
eventos.put('/:id/eventos/:eventoId', auth(), requireRole('admin', 'manager'), async (c) => {
  const { id, eventoId } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const body = await c.req.json();
  const parsed = parseBody(EventoSchema.partial(), body);
  if (!parsed.ok) return c.json({ success: false, error: parsed.error }, 400);

  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const eventoAtual = await db
      .prepare(
        `SELECT id, funcionario_id, data_inicio, data_fim, origem
           FROM escala_eventos
          WHERE id = ? AND escala_id = ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(eventoId, id)
      .first<{
        id: string;
        funcionario_id: string;
        data_inicio: string;
        data_fim: string;
        origem?: string | null;
      }>();

    if (!eventoAtual) {
      return c.json({ success: false, error: 'Evento não encontrado' }, 404);
    }

    const lockMessage = getManagedEventLockMessage(eventoAtual.origem);
    if (lockMessage) {
      return c.json(
        { success: false, error: lockMessage, code: 'EVENTO_GERENCIADO_EXTERNAMENTE' },
        409,
      );
    }

    const d = parsed.data;
    const conflitos = await verificarConflitosEscala(db, {
      escala_id: id,
      funcionario_id: eventoAtual.funcionario_id,
      data_inicio: d.data_inicio ?? eventoAtual.data_inicio,
      data_fim: d.data_fim ?? eventoAtual.data_fim,
      excluir_evento_id: eventoId,
    });

    if (conflitos.length > 0) {
      const replacement = await replaceConflictingEvents(db, id, conflitos as EventoConflitante[]);

      if (replacement.blockedMessage) {
        return c.json(
          {
            success: false,
            error: replacement.blockedMessage,
            code: 'EVENTO_GERENCIADO_EXTERNAMENTE',
            conflitos,
          },
          409,
        );
      }
    }

    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (d.tipo_evento !== undefined) {
      fields.push('tipo_evento = ?');
      values.push(d.tipo_evento);
    }
    if (d.data_inicio !== undefined) {
      fields.push('data_inicio = ?');
      values.push(d.data_inicio);
    }
    if (d.data_fim !== undefined) {
      fields.push('data_fim = ?');
      values.push(d.data_fim);
    }
    if (d.turno !== undefined) {
      fields.push('turno = ?');
      values.push(d.turno);
    }
    if (d.local !== undefined) {
      fields.push('local = ?');
      values.push(d.local);
    }
    if (d.aeronave !== undefined) {
      fields.push('aeronave = ?');
      values.push(d.aeronave);
    }
    if (d.status !== undefined) {
      fields.push('status = ?');
      values.push(d.status);
    }
    if (d.observacoes !== undefined) {
      fields.push('observacoes = ?');
      values.push(d.observacoes);
    }

    if (fields.length === 0) return c.json({ success: true });

    fields.push('updated_at = ?');
    values.push(now);
    values.push(eventoId);
    values.push(id);

    await db
      .prepare(`UPDATE escala_eventos SET ${fields.join(', ')} WHERE id = ? AND escala_id = ?`)
      .bind(...values)
      .run();

    await auditarEvento(db, {
      escala_id: id,
      acao: 'EDITAR_EVENTO',
      evento_id: eventoId,
      realizado_por: String(
        (c as unknown as { get: (key: string) => unknown }).get('userId') || '',
      ),
      valor_anterior: JSON.stringify(eventoAtual),
      valor_novo: JSON.stringify(d),
    });

    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// DELETE /:id/eventos/:eventoId — soft delete evento
eventos.delete('/:id/eventos/:eventoId', auth(), requireRole('admin', 'manager'), async (c) => {
  const { id, eventoId } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const now = new Date().toISOString();
  try {
    const escala = await getEscalaVerificada(db, id, empresaId);
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const eventoAtual = await db
      .prepare(
        `SELECT id, origem
           FROM escala_eventos
          WHERE id = ? AND escala_id = ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(eventoId, id)
      .first<{ id: string; origem: string | null }>();

    if (!eventoAtual) {
      return c.json({ success: false, error: 'Evento não encontrado' }, 404);
    }

    const lockMessage = getManagedEventLockMessage(eventoAtual.origem);
    if (lockMessage) {
      return c.json(
        { success: false, error: lockMessage, code: 'EVENTO_GERENCIADO_EXTERNAMENTE' },
        409,
      );
    }

    await db
      .prepare(
        `UPDATE escala_eventos SET deleted_at = ?, updated_at = ? WHERE id = ? AND escala_id = ?`,
      )
      .bind(now, now, eventoId, id)
      .run();

    const userId = String((c as unknown as { get: (key: string) => unknown }).get('userId') || '');
    await auditarEvento(db, {
      escala_id: id,
      acao: 'REMOVER_EVENTO',
      evento_id: eventoId,
      realizado_por: userId,
      valor_anterior: JSON.stringify(eventoAtual),
    });

    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: String(e) }, 500);
  }
});

export default eventos;
