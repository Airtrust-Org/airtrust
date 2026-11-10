import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/routes/qualificacoes/historico-atomic-write.ts', 'utf8');

describe('qualificacoes historico atomic expiry contract (vence no dia)', () => {
  it('does not load or branch on the legacy vencimento_fim_mes flag', () => {
    expect(source).not.toContain('vencimento_fim_mes');
    expect(source).not.toContain('shouldExpireAtEndOfMonth');
    expect(source).not.toContain('endOfMonth');
  });

  it('delegates validity (including CMA by age) to resolveEffectiveValidityMonths for create and renewal', () => {
    expect(source.match(/resolveEffectiveValidityMonths\(\{/g)).toHaveLength(2);
    expect(source.match(/aviso_validade_cma: cmaValidityWarning\(/g)).toHaveLength(2);
  });
});
