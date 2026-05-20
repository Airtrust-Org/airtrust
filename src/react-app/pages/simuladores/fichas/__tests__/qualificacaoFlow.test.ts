import {
  deveGerarQualificacaoAoAssinar,
  isFichaDoFluxoDeCheckComQualificacao,
} from '../qualificacaoFlow';

describe('qualificacaoFlow', () => {
  it('reconhece ficha principal de check pelo is_check', () => {
    expect(isFichaDoFluxoDeCheckComQualificacao({ is_check: 1, tipo_sessao: 'LOFT-CHK' })).toBe(
      true,
    );
  });

  it('reconhece fichas especiais do fluxo de check pelo tipo de sessao', () => {
    expect(
      isFichaDoFluxoDeCheckComQualificacao({ is_check: 0, tipo_sessao: 'TRE-INST' }),
    ).toBe(true);
    expect(
      isFichaDoFluxoDeCheckComQualificacao({ is_check: false, tipo_sessao: 'cred-exa' }),
    ).toBe(true);
  });

  it('nao marca sessao comum como fluxo de check', () => {
    expect(
      isFichaDoFluxoDeCheckComQualificacao({ is_check: 0, tipo_sessao: 'RECORRENTE' }),
    ).toBe(false);
  });

  it('gera qualificacao na assinatura apenas quando aprovado dentro do fluxo de check', () => {
    expect(deveGerarQualificacaoAoAssinar({ tipo_sessao: 'TRE-INST' }, true)).toBe(true);
    expect(deveGerarQualificacaoAoAssinar({ is_check: 1 }, false)).toBe(false);
    expect(deveGerarQualificacaoAoAssinar({ tipo_sessao: 'RECORRENTE' }, true)).toBe(false);
  });
});
