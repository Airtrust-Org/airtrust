import { registerHandler } from '../eventProcessor';

registerHandler('pasta_virtual', 'ESCALA_PUBLICADA', async (db, _tipo, payload) => {
  const escalaId = String(payload.escala_id ?? '');
  if (!escalaId) return;

  const nomeArquivo = `ESCALA-${payload.empresa_id}-${payload.mes ?? 'XX'}-${payload.ano ?? 'XXXX'}-${escalaId.slice(0, 8)}.pdf`;
  await db
    .prepare(
      `INSERT INTO pasta_virtual_jobs
        (id, empresa_id, funcionario_id, referencia_id, referencia_tipo, tipo_documento, nome_arquivo, status_geracao, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'escala', 'ESCALA_PUBLICADA', ?, 'pendente_geracao', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      crypto.randomUUID(),
      Number(payload.empresa_id),
      payload.origem_usuario_id ? String(payload.origem_usuario_id) : null,
      escalaId,
      nomeArquivo,
    )
    .run();
});

registerHandler('pasta_virtual', 'SIMULADOR_REALIZADO', async (db, _tipo, payload) => {
  if (!payload.funcionario_id) return;
  const nomeArquivo = `SIM-${String(payload.funcionario_id).slice(0, 8)}-${payload.data_realizacao ?? 'XXXX'}.pdf`;

  await db
    .prepare(
      `INSERT INTO pasta_virtual_jobs
        (id, empresa_id, funcionario_id, referencia_id, referencia_tipo, tipo_documento, nome_arquivo, status_geracao, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'simulador', 'SIMULADOR_REALIZADO', ?, 'pendente_geracao', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      crypto.randomUUID(),
      Number(payload.empresa_id),
      String(payload.funcionario_id),
      payload.simulador_sessao_id || payload.sessao_id
        ? String(payload.simulador_sessao_id ?? payload.sessao_id)
        : null,
      nomeArquivo,
    )
    .run();
});
