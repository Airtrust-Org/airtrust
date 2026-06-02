import { describe, expect, it } from 'vitest';

import { buildAlertasVencimentosQualificacoesQuery } from '../../routes/alertas';

function compactSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('alertas/vencimentos query', () => {
  it('exclui renovadas e prioriza apenas a versao mais recente da qualificacao', () => {
    const sql = compactSql(
      buildAlertasVencimentosQualificacoesQuery('COALESCE(qh.data_vencimento, qh.data_conclusao)'),
    );

    expect(sql).toContain('COALESCE(qh.renovada, 0) = 0');
    expect(sql).toContain("UPPER(COALESCE(qh.status, 'CONCLUIDA')) <> 'CANCELADA'");
    expect(sql).toContain("UPPER(COALESCE(qh.status, 'CONCLUIDA')) <> 'CANCELADO'");
    expect(sql).toContain("UPPER(COALESCE(qh.status, 'CONCLUIDA')) <> 'RENOVADA'");
    expect(sql).toContain("UPPER(COALESCE(qh_new.status, 'CONCLUIDA')) <> 'PLANEJADA'");
    expect(sql).toContain('AND NOT EXISTS ( SELECT 1 FROM qualificacoes_historico qh_new');
    expect(sql).toContain("COALESCE(qh_new.renovada, 0) = 0");
  });
});
