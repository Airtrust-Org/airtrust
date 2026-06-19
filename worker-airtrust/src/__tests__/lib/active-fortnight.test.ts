import { describe, expect, it, vi } from 'vitest';

import {
  isDateWithinActiveFortnight,
  resolveFuncionarioActiveFortnightForDate,
} from '../../lib/escalas/active-fortnight';

describe('active fortnight helpers', () => {
  it('detecta data dentro da quinzena ativa derivada do funcionario', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: () => ({
          first: async () => ({
            numero: 2,
            data_inicio: '2026-06-16',
            data_fim: '2026-06-30',
          }),
        }),
      })),
    } as any;

    const range = await resolveFuncionarioActiveFortnightForDate(db, '10', '2026-06-18');

    expect(range).toEqual({
      numero: 2,
      data_inicio: '2026-06-16',
      data_fim: '2026-06-30',
    });
    expect(isDateWithinActiveFortnight(range, '2026-06-18')).toBe(true);
    expect(isDateWithinActiveFortnight(range, '2026-06-12')).toBe(false);
  });

  it('retorna null quando nao ha quinzena ativa derivavel', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: () => ({
          first: async () => null,
        }),
      })),
    } as any;

    await expect(resolveFuncionarioActiveFortnightForDate(db, '10', '2026-06-18')).resolves.toBeNull();
  });
});
