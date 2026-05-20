import { registerHandler } from '../eventProcessor';

registerHandler('hospedagem', 'TRIPULANTE_ALOCADO', async (db, _tipo, payload) => {
  if (!payload.base_destino || !payload.base_origem) return;
  if (payload.base_destino === payload.base_origem) return;
  if (!payload.funcionario_id) return;

  await db
    .prepare(
      `INSERT INTO hospedagem_sugestoes
        (id, empresa_id, funcionario_id, escala_id, base, data_inicio, data_fim, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      crypto.randomUUID(),
      Number(payload.empresa_id),
      String(payload.funcionario_id),
      payload.escala_id ? String(payload.escala_id) : null,
      String(payload.base_destino),
      payload.data_inicio ? String(payload.data_inicio) : null,
      payload.data_fim ? String(payload.data_fim) : null,
    )
    .run();
});

registerHandler('hospedagem', 'FUNCIONARIO_INATIVADO', async (db, _tipo, payload) => {
  if (!payload.funcionario_id) return;

  await db
    .prepare(
      `UPDATE hospedagens
       SET status = 'cancelado',
           observacoes = COALESCE(observacoes,'') || ' [Cancelado: funcionário inativado]',
           updated_at = CURRENT_TIMESTAMP
       WHERE funcionario_id = ?
         AND status IN ('reservado', 'confirmado')
         AND deleted_at IS NULL`,
    )
    .bind(Number(payload.funcionario_id))
    .run();
});
