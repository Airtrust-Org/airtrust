import { describe, expect, it } from 'vitest';
import {
  addCalendarMonthsClamped,
  endOfTargetMonth,
  tryAddCalendarMonthsClamped,
  tryEndOfTargetMonth,
} from '../validade-meses';
import { calcularDataVencimento as certificacao } from '../certificacao-utils';
// Mesmo modulo consumido pelo Worker (importado por caminho relativo la); a paridade
// com os consumidores do Worker e o SQL fica em
// worker-airtrust/src/utils/__tests__/validade-meses-canonical.test.ts.

const CASES: Array<[string, number, string, string]> = [
  ['2024-02-29', 24, '2026-02-28', '2026-02-28'],
  ['2025-01-31', 1, '2025-02-28', '2025-02-28'],
  ['2024-01-31', 1, '2024-02-29', '2024-02-29'],
  ['2024-04-30', 1, '2024-05-30', '2024-05-31'],
  ['2024-12-15', 1, '2025-01-15', '2025-01-31'],
  ['2023-08-31', 6, '2024-02-29', '2024-02-29'],
  ['2024-01-15', 12, '2025-01-15', '2025-01-31'],
];

describe('validade-meses (frontend)', () => {
  it.each(CASES)('%s + %im', (data, meses, exato, fim) => {
    expect(addCalendarMonthsClamped(data, meses)).toBe(exato);
    expect(tryAddCalendarMonthsClamped(data, meses)).toBe(exato);
    expect(endOfTargetMonth(data, meses)).toBe(fim);
    expect(tryEndOfTargetMonth(data, meses)).toBe(fim);
  });

  it('entradas invalidas lancam / retornam null', () => {
    expect(() => addCalendarMonthsClamped('2024-02-30', 1)).toThrow();
    expect(() => addCalendarMonthsClamped('2024-01-31', 0)).toThrow();
    expect(tryAddCalendarMonthsClamped('lixo', 1)).toBeNull();
    expect(tryEndOfTargetMonth('2024-01-31', -3)).toBeNull();
  });

  it('certificacao-utils usa a mesma regra (ICAO 24m)', () => {
    expect(certificacao('2024-02-29', 'ICAO-X')).toBe('2026-02-28');
  });
});
