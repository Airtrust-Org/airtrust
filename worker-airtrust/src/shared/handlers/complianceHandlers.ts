import { registerHandler } from '../eventProcessor';

const complianceEvents = [
  'CMA_CRIADO',
  'CMA_RENOVADO',
  'CMA_REVOGADO',
  'CMA_VENCENDO_30D',
  'CMA_VENCENDO_7D',
  'CMA_VENCIDO',
  'FRMS_STATUS_CRITICO',
  'SIMULADOR_REALIZADO',
  'TRIPULANTE_ALOCADO',
  'TRIPULANTE_REMOVIDO',
  'ESCALA_PUBLICADA',
  'DOCUMENTO_ENVIADO',
  'DOCUMENTO_EXCLUIDO',
] as const;

for (const eventType of complianceEvents) {
  registerHandler('compliance', eventType, async (db, tipo, payload) => {
    await db
      .prepare(
        `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_novos, origem, created_at)
         VALUES ('compliance_eventos', ?, ?, ?, 'event_processor', CURRENT_TIMESTAMP)`,
      )
      .bind(
        tipo,
        String(payload.funcionario_id ?? payload.escala_id ?? crypto.randomUUID()),
        JSON.stringify(payload),
      )
      .run();
  });
}
