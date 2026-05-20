import { describe, expect, it } from 'vitest';

import { shouldAllowSameEscalaOperationalReassignment } from '../../routes/escalas-alocacoes-helpers-internal';

describe('shouldAllowSameEscalaOperationalReassignment', () => {
  it('permite mover alocacao operacional para outra aeronave na mesma escala', () => {
    expect(
      shouldAllowSameEscalaOperationalReassignment(
        {
          id: 'aloc-1',
          escala_id: 'esc-1',
          aeronave_id: 24,
          situacao_tipo: null,
        },
        'esc-1',
      ),
    ).toBe(true);
  });

  it('mantem bloqueio para situacao sem aeronave na mesma escala', () => {
    expect(
      shouldAllowSameEscalaOperationalReassignment(
        {
          id: 'aloc-2',
          escala_id: 'esc-1',
          aeronave_id: null,
          situacao_tipo: 'FERIAS',
        },
        'esc-1',
      ),
    ).toBe(false);
  });

  it('mantem bloqueio para alocacao em outra escala', () => {
    expect(
      shouldAllowSameEscalaOperationalReassignment(
        {
          id: 'aloc-3',
          escala_id: 'esc-2',
          aeronave_id: 27,
          situacao_tipo: null,
        },
        'esc-1',
      ),
    ).toBe(false);
  });
});
