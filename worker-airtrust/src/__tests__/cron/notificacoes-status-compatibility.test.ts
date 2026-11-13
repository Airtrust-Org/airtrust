import { describe, expect, it } from 'vitest';
import { buildQualificacoesParaNotificarQuery } from '../../cron/notificacoes';

describe('notificacoes cron status compatibility', () => {
  it('filtra alertas automaticos para a categoria/formato EAD', () => {
    const sql = buildQualificacoesParaNotificarQuery();
    expect(sql).toContain("UPPER(TRIM(COALESCE(qf.codigo, ''))) = 'EAD'");
    expect(sql).toContain("IN ('EAD', 'TREINAMENTO EAD')");
  });

  it('exclui variantes canonica e legada de qualificacao cancelada', () => {
    const sql = buildQualificacoesParaNotificarQuery();

    expect(sql).toContain("UPPER(COALESCE(qh.status, 'CONCLUIDA')) <> 'CANCELADA'");
    expect(sql).toContain("UPPER(COALESCE(qh.status, 'CONCLUIDA')) <> 'CANCELADO'");
  });
});
