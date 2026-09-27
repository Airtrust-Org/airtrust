import { describe, expect, it, vi } from 'vitest';
import { PARAMETROS_DECORATIVOS } from '../FrmsConfiguracoes';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../components/FrmsWorkspaceNav', () => ({
  default: () => null,
}));

describe('FrmsConfiguracoes parametros decorativos', () => {
  it('mantem chaves decorativas marcadas para evitar promessas de efeito inexistente', () => {
    const expected = [
      'ACCUMULATION_WINDOW_MODE',
      'ACCUMULATION_USE_MONTH_CALENDAR',
      'ACCUMULATION_USE_YEAR_CALENDAR',
      'ACCUMULATION_USE_28D_ROLLING',
      'ACCUMULATION_USE_365D_ROLLING',
      'EFFECTIV_PERIODO_PCT',
      'REPOUSO_MIN_PRE_APRESENTACAO',
      'REPOUSO_MIN_POS_LIBERACAO',
      'REPOUSO_QUALIDADE_HOTEL',
      'DURACAO_CURTA_MINUTOS',
      'DURACAO_CURTA_FATOR',
    ];

    expected.forEach((key) => {
      expect(PARAMETROS_DECORATIVOS.has(key)).toBe(true);
    });
  });
});
