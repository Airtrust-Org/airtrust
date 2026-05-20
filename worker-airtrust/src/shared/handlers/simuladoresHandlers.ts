import { registerHandler } from '../eventProcessor';

registerHandler('simuladores', 'FUNCIONARIO_INATIVADO', async (db, _tipo, payload) => {
  if (!payload.funcionario_id) return;

  await db
    .prepare(
      `UPDATE simulador_agendamentos
       SET status = 'CANCELADO',
           observacoes = COALESCE(observacoes,'') || ' [Cancelado: funcionário inativado]',
           updated_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT sessao_id
         FROM sessoes_participantes
         WHERE funcionario_id = ?
           AND deleted_at IS NULL
       )
         AND UPPER(COALESCE(status, 'AGENDADO')) IN ('PENDENTE', 'AGENDADO')
         AND deleted_at IS NULL`,
    )
    .bind(Number(payload.funcionario_id))
    .run();
});
