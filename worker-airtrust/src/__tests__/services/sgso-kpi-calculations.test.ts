import { describe, expect, it } from 'vitest';
import { calcTrend, evalOperador } from '../../services/sgso/kpi-calculations';

describe('evalOperador', () => {
  it.each([
    ['>=', 5, 5, true],
    ['>=', 4, 5, false],
    ['<=', 5, 5, true],
    ['<=', 6, 5, false],
    ['>', 6, 5, true],
    ['>', 5, 5, false],
    ['<', 4, 5, true],
    ['<', 5, 5, false],
    ['=', 5, 5, true],
    ['=', 4, 5, false],
  ])('%s com valor %d e meta %d -> %s', (op, valor, meta, esperado) => {
    expect(evalOperador(valor, op, meta)).toBe(esperado);
  });

  it('operador desconhecido nunca atinge a meta (falha fechada)', () => {
    expect(evalOperador(10, '!=', 5)).toBe(false);
    expect(evalOperador(10, '', 5)).toBe(false);
  });
});

describe('calcTrend', () => {
  it('valor subiu: delta positivo, favorável quando maior é melhor', () => {
    expect(calcTrend('SPI-1', 'Relatos', 12, 10, true)).toEqual({
      codigo: 'SPI-1',
      nome: 'Relatos',
      valor_atual: 12,
      valor_periodo_anterior: 10,
      delta_absoluto: 2,
      delta_percentual: 20,
      direcao: 'SUBIU',
      favoravel: true,
    });
  });

  it('valor subiu: desfavorável quando menor é melhor', () => {
    const t = calcTrend('SPI-2', 'Incidentes', 3, 2, false);
    expect(t.direcao).toBe('SUBIU');
    expect(t.favoravel).toBe(false);
  });

  it('valor caiu: favorável quando menor é melhor', () => {
    const t = calcTrend('SPI-2', 'Incidentes', 1, 4, false);
    expect(t.direcao).toBe('CAIU');
    expect(t.delta_absoluto).toBe(-3);
    expect(t.delta_percentual).toBe(-75);
    expect(t.favoravel).toBe(true);
  });

  it('sem variação: estável e favorável', () => {
    const t = calcTrend('SPI-3', 'Ações', 7, 7, true);
    expect(t.direcao).toBe('ESTAVEL');
    expect(t.delta_absoluto).toBe(0);
    expect(t.favoravel).toBe(true);
  });

  it('período anterior zero: delta percentual nulo (sem divisão por zero)', () => {
    const t = calcTrend('SPI-4', 'NC', 5, 0, false);
    expect(t.delta_percentual).toBeNull();
    expect(t.delta_absoluto).toBe(5);
  });
});
