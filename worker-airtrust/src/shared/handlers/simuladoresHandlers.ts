import { registerHandler } from '../eventProcessor';

registerHandler('simuladores', 'FUNCIONARIO_INATIVADO', async (db, _tipo, payload) => {
  if (!payload.funcionario_id || !payload.empresa_id) return;

  // Defense-in-depth: never trust the payload's funcionario_id alone. Confirm it
  // actually belongs to the tenant that owns this domain event before writing.
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
         AND deleted_at IS NULL
         AND funcionario_id IN (
           SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
         )`,
    )
    .bind(Number(payload.funcionario_id), Number(payload.funcionario_id), Number(payload.empresa_id))
    .run();
});
