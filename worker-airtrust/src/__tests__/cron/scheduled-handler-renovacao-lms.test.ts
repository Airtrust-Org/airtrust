import { describe, expect, it } from 'vitest';

import { buildQualificacoesEadRenovacaoAutomaticaQuery } from '../../cron/scheduled-handler';

function compactSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('renovacao automatica LMS por qualificacao EAD', () => {
  it('inclui qualificacoes vencidas e vencendo em vez de apenas futuras', () => {
    const sql = compactSql(buildQualificacoesEadRenovacaoAutomaticaQuery());

    expect(sql).toContain("COALESCE(qh.renovada, 0) = 0");
    expect(sql).toContain('AND NOT EXISTS ( SELECT 1 FROM qualificacoes_historico qh2');
    expect(sql).toContain(")) <= date('now', '+' || ? || ' days')");
    expect(sql).not.toContain("BETWEEN date('now')");
  });
});
