import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../routes/qualificacoes/historico-atomic-write.ts', import.meta.url),
  'utf8',
);

describe('qualificacoes historico atomic expiry-mode contract', () => {
  it('loads vencimento_fim_mes from the qualification model for create and renewal', () => {
    expect(source.match(/validade, vencimento_fim_mes, carga_horaria/g)).toHaveLength(2);
    expect(source).toContain('vencimento_fim_mes: number | string | null;');
  });

  it('uses the configured model flag instead of forcing generic renewals to month-end', () => {
    expect(source).toContain(
      'function shouldExpireAtEndOfMonth(type: QualificationTypeRow, qualificationCode: string): boolean',
    );
    expect(source).toContain("if (qualificationCode === 'G1-SEM') return false;");
    expect(source).toContain('return Number(type.vencimento_fim_mes || 0) === 1;');
    expect(source.match(/endOfMonth: shouldExpireAtEndOfMonth\(type, qualificationCode\)/g)).toHaveLength(2);
    expect(source).not.toContain("endOfMonth: qualificationCode !== 'G1-SEM'");
    expect(source).not.toContain('endOfMonth: false,\n    });\n\n    let status');
  });
});
