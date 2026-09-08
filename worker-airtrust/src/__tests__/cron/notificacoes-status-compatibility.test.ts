import { describe, expect, it } from 'vitest';
import { buildQualificacoesParaNotificarQuery } from '../../cron/notificacoes';

describe('notificacoes cron status compatibility', () => {
  it('exclui variantes canonica e legada de qualificacao cancelada', () => {
    const sql = buildQualificacoesParaNotificarQuery();

    expect(sql).toContain("UPPER(COALESCE(qh.status, 'CONCLUIDA')) <> 'CANCELADA'");
    expect(sql).toContain("UPPER(COALESCE(qh.status, 'CONCLUIDA')) <> 'CANCELADO'");
  });
});
