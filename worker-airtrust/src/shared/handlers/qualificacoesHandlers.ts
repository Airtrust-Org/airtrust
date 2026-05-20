import { registerHandler } from '../eventProcessor';

registerHandler('qualificacoes', 'DOCUMENTO_CMA_DETECTADO', async (db, _tipo, payload) => {
  if (!payload.funcionario_id) return;

  await db
    .prepare(
      `INSERT INTO qualificacoes_pendencias
        (id, empresa_id, funcionario_id, tipo, documento_r2_key, status, created_at, updated_at)
       VALUES (?, ?, ?, 'CMA_DOCUMENTO_NOVO', ?, 'pendente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      crypto.randomUUID(),
      Number(payload.empresa_id),
      String(payload.funcionario_id),
      payload.r2_key ? String(payload.r2_key) : null,
    )
    .run();
});
