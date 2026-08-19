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
      // TEN-EVENT-004 (Tenant Readiness Matrix V3): ESCALA_PUBLICADA is a
      // corporate/batch job, not tied to a single employee — origem_usuario_id
      // identifies the USER who published the schedule (a different id space
      // than funcionarios.id; the same collision class already fixed for FRMS
      // in resolveFuncionarioId). It must stay only in the domain_events
      // payload/audit trail, never be written into funcionario_id here.
      null,
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
