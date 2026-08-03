import { isProtectedFichaStatus } from './simuladores-shared-session-helpers';

export async function cleanupFailedSharedCreate(db: D1Database, sessaoId: number) {
  const linkId = String(sessaoId);
  await db.batch([
    db
      .prepare(
        'DELETE FROM simulador_segmento_atribuicoes WHERE segmento_id IN (SELECT id FROM simulador_agendamento_segmentos WHERE agendamento_id = ?)',
      )
      .bind(sessaoId),
    db
      .prepare(
        'DELETE FROM simulador_segmento_participantes WHERE segmento_id IN (SELECT id FROM simulador_agendamento_segmentos WHERE agendamento_id = ?)',
      )
      .bind(sessaoId),
    db
      .prepare('DELETE FROM simulador_agendamento_segmentos WHERE agendamento_id = ?')
      .bind(sessaoId),
    db
      .prepare(
        'DELETE FROM fichas_sessao_manobras WHERE ficha_id IN (SELECT id FROM fichas_sessao WHERE agendamento_slot_id = ?)',
      )
      .bind(sessaoId),
    db.prepare('DELETE FROM fichas_sessao WHERE agendamento_slot_id = ?').bind(sessaoId),
    db
      .prepare('DELETE FROM simulador_atribuicoes_curriculares WHERE agendamento_id = ?')
      .bind(sessaoId),
    db.prepare('DELETE FROM sessoes_checks WHERE sessao_id = ?').bind(sessaoId),
    db.prepare('DELETE FROM sessoes_participantes WHERE sessao_id = ?').bind(sessaoId),
    db
      .prepare('DELETE FROM qualificacoes_historico WHERE sessao_id = ? AND deleted_at IS NULL')
      .bind(sessaoId),
    db
      .prepare(
        `UPDATE escala_eventos
            SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE origem = 'simuladores'
            AND tripulacao_id = ?
            AND deleted_at IS NULL`,
      )
      .bind(linkId),
    db.prepare('DELETE FROM simulador_agendamentos WHERE id = ?').bind(sessaoId),
  ]);
}

type SharedAssignmentRow = {
  funcionario_id: string | number;
};

type SharedFichaRow = {
  status: string | null;
};

export type CancelSharedAssignmentResult =
  { outcome: 'not_found' } | { outcome: 'protected' } | { outcome: 'cancelled' };

export async function cancelSharedAssignment(
  db: D1Database,
  empresaId: number,
  sessaoId: number,
  atribuicaoId: number,
): Promise<CancelSharedAssignmentResult> {
  const atribuicao = await db
    .prepare(
      `SELECT sac.id, sac.agendamento_id, sac.participante_id, sp.funcionario_id
       FROM simulador_atribuicoes_curriculares sac
       INNER JOIN sessoes_participantes sp
         ON sp.id = sac.participante_id
        AND sp.deleted_at IS NULL
       WHERE sac.id = ?
         AND sac.agendamento_id = ?
         AND sac.empresa_id = ?
         AND sac.deleted_at IS NULL`,
    )
    .bind(atribuicaoId, sessaoId, empresaId)
    .first<SharedAssignmentRow>();

  if (!atribuicao) {
    return { outcome: 'not_found' };
  }

  const ficha = await db
    .prepare(
      `SELECT id, status
       FROM fichas_sessao
       WHERE atribuicao_curricular_id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(atribuicaoId, empresaId)
    .first<SharedFichaRow>();

  if (ficha && isProtectedFichaStatus(ficha.status)) {
    return { outcome: 'protected' };
  }

  await db.batch([
    db
      .prepare(
        `UPDATE simulador_atribuicoes_curriculares
         SET status = 'CANCELADA',
             deleted_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?
           AND empresa_id = ?`,
      )
      .bind(atribuicaoId, empresaId),
    db
      .prepare(
        `UPDATE simulador_agendamento_segmentos
         SET atribuicao_curricular_id = NULL,
             updated_at = datetime('now')
         WHERE agendamento_id = ?
           AND atribuicao_curricular_id = ?
           AND empresa_id = ?
           AND deleted_at IS NULL`,
      )
      .bind(sessaoId, atribuicaoId, empresaId),
    db
      .prepare(
        `UPDATE simulador_segmento_participantes
         SET atribuicao_curricular_id = NULL,
             updated_at = datetime('now')
         WHERE atribuicao_curricular_id = ?
           AND empresa_id = ?
           AND deleted_at IS NULL`,
      )
      .bind(atribuicaoId, empresaId),
    db
      .prepare(
        `UPDATE simulador_segmento_atribuicoes
         SET status = 'CANCELADA',
             deleted_at = datetime('now'),
             updated_at = datetime('now')
         WHERE atribuicao_curricular_id = ?
           AND empresa_id = ?
           AND deleted_at IS NULL`,
      )
      .bind(atribuicaoId, empresaId),
    db
      .prepare(
        `UPDATE fichas_sessao
         SET deleted_at = datetime('now'),
             updated_at = datetime('now')
         WHERE atribuicao_curricular_id = ?
           AND empresa_id = ?
           AND deleted_at IS NULL`,
      )
      .bind(atribuicaoId, empresaId),
    db
      .prepare(
        `UPDATE qualificacoes_historico
         SET deleted_at = datetime('now'),
             updated_at = datetime('now')
         WHERE sessao_id = ?
           AND funcionario_id = ?
           AND empresa_id = ?
           AND deleted_at IS NULL
           AND COALESCE(status, 'PLANEJADA') = 'PLANEJADA'`,
      )
      .bind(sessaoId, atribuicao.funcionario_id, empresaId),
  ]);

  return { outcome: 'cancelled' };
}
