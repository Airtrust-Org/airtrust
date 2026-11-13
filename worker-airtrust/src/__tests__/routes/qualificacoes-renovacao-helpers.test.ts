import { describe, expect, it } from 'vitest';
import { resolveParametrosRenovacaoQualificacao } from '../../services/qualificacoes/historico-helpers';

describe('resolveParametrosRenovacaoQualificacao', () => {
  it('mantem renovacao de G1-SEM com vencimento exatamente em 6 meses', () => {
    expect(
      resolveParametrosRenovacaoQualificacao({
        codigoQualificacao: 'G1-SEM',
        dataConclusao: '2026-03-28',
        validadeMeses: 12,
      }),
    ).toEqual({
      validadeMeses: 6,
      dataVencimento: '2026-09-28',
      tipoTreinamento: 'SEMESTRAL',
      status: 'CONCLUIDA',
    });
  });

  it('renovacoes nao semestrais vencem no dia', () => {
    expect(
      resolveParametrosRenovacaoQualificacao({
        codigoQualificacao: 'FAP05.2',
        dataConclusao: '2026-03-14',
        validadeMeses: 12,
      }),
    ).toEqual({
      validadeMeses: 12,
      dataVencimento: '2027-03-14',
      tipoTreinamento: 'RECORRENTE',
      status: 'CONCLUIDA',
    });
  });
});
