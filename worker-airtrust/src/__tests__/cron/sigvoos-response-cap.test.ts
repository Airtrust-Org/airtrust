import { describe, expect, it } from 'vitest';

import { capSigvoosSearchPayload } from '../../lib/sigvoos/client';
import { getArrayPayload } from '../../services/sigvoos-frms';

describe('SIGVOOS operational response cap', () => {
  it('trunca resposta direta em limit mais sentinela', () => {
    const response = {
      main: Array.from({ length: 500 }, (_, index) => ({ id: index + 1 })),
    };

    const capped = capSigvoosSearchPayload(response, 100);
    expect(getArrayPayload(capped)).toHaveLength(101);
  });

  it('trunca os formatos aninhados aceitos pelo normalizador', () => {
    const response = {
      data: {
        results: Array.from({ length: 500 }, (_, index) => ({ id: index + 1 })),
      },
    };

    const capped = capSigvoosSearchPayload(response, 50);
    expect(getArrayPayload(capped)).toHaveLength(51);
  });

  it('não amplia resposta menor que o limite', () => {
    const response = { items: [{ id: 1 }, { id: 2 }] };
    expect(getArrayPayload(capSigvoosSearchPayload(response, 100))).toHaveLength(2);
  });
});
