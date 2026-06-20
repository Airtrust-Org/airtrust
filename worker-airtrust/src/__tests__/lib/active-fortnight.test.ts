import { describe, expect, it, vi } from 'vitest';

import {
  isDateWithinActiveFortnight,
  parseFuncionarioQuinzena,
  resolveFuncionarioActiveFortnightForDate,
} from '../../lib/escalas/active-fortnight';

describe('active fortnight helpers', () => {
  it.each([
    ['Q1', 1],
    ['q1', 1],
    ['Q2', 2],
    ['q2', 2],
    ['1Q', 1],
    ['2Q', 2],
  ])('normaliza %s para quinzena %s', (input, expected) => {
    expect(parseFuncionarioQuinzena(input)).toBe(expected);
  });

  it('detecta data dentro da quinzena ativa derivada do funcionario', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: () => ({
          all: async () => ({
            results: [
              {
                funcionario_quinzena: 'Q2',
                numero: 2,
                data_inicio: '2026-06-16',
                data_fim: '2026-06-30',
              },
            ],
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
          all: async () => ({ results: [] }),
        }),
      })),
    } as any;

    await expect(resolveFuncionarioActiveFortnightForDate(db, '10', '2026-06-18')).resolves.toBeNull();
  });
});
