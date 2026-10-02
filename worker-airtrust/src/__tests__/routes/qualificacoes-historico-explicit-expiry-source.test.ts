import { describe, expect, it } from 'vitest';
import { resolveHistoricoReadExpiry } from '../../routes/qualificacoes/historico-helpers';

describe('resolveHistoricoReadExpiry', () => {
  it('preserves an explicitly stored documentary expiry', () => {
    expect(resolveHistoricoReadExpiry({
      dataVencimento: '2027-11-15', dataConclusao: '2023-11-16', validadeMeses: 48, vencimentoFimMes: 0, codigoQualificacao: 'E3',
    })).toBe('2027-11-15');
  });

  it('calculates a fallback only when stored expiry is absent', () => {
    expect(resolveHistoricoReadExpiry({
      dataVencimento: null, dataConclusao: '2023-11-16', validadeMeses: 48, vencimentoFimMes: 0, codigoQualificacao: 'E3',
    })).toBe('2027-11-16');
  });

  it('keeps G1-SEM without expiry when none is explicitly stored', () => {
    expect(resolveHistoricoReadExpiry({
      dataVencimento: null, dataConclusao: '2026-03-28', validadeMeses: 6, vencimentoFimMes: 0, codigoQualificacao: 'G1-SEM',
    })).toBeNull();
  });
});
