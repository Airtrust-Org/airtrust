import { registerHandler } from '../eventProcessor';

registerHandler('qualificacoes', 'DOCUMENTO_CMA_DETECTADO', async (db, _tipo, payload) => {
  if (!payload.funcionario_id || !payload.empresa_id) return;

  // Defense-in-depth: verify the referenced funcionario actually belongs to the
  // event's own tenant before stamping a pendência record for it.
  const funcionario = await db
    .prepare('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
    .bind(String(payload.funcionario_id), Number(payload.empresa_id))
    .first<{ id: string }>();
  if (!funcionario) return;

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
