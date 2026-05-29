import { describe, expect, it, vi } from 'vitest';
import { PARAMETROS_DECORATIVOS } from '../FrmsConfiguracoes';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('FrmsConfiguracoes parametros decorativos', () => {
  it('mantem chaves decorativas marcadas para evitar promessas de efeito inexistente', () => {
    const expected = [
      'EFFECTIV_PERIODO_PCT',
      'REPOUSO_MIN_PRE_APRESENTACAO',
      'REPOUSO_MIN_POS_LIBERACAO',
      'REPOUSO_QUALIDADE_HOTEL',
    ];

    expected.forEach((key) => {
      expect(PARAMETROS_DECORATIVOS.has(key)).toBe(true);
    });
  });
});
