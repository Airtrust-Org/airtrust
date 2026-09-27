import { describe, expect, it } from 'vitest';
import {
  buildFadigaAcumuladaLegenda,
  getFadigaAcumuladaVisual,
} from '@/react-app/pages/frms/fadigaAcumuladaVisual';

describe('fadiga acumulada visual semantics', () => {
  it('keeps normal as the safe green state', () => {
    const meta = getFadigaAcumuladaVisual('normal');
    expect(meta.label).toBe('Normal');
    expect(meta.barClass).toContain('emerald');
  });

  it('maps the historical backend enum verde to attention, never to green UI', () => {
    const meta = getFadigaAcumuladaVisual('verde');
    expect(meta.label).toBe('Atenção');
    expect(meta.barClass).toContain('amber');
    expect(meta.barClass).not.toContain('emerald');
  });

  it('maps 90% alert to orange and 95% critical to red', () => {
    expect(getFadigaAcumuladaVisual('amarelo')).toMatchObject({
      label: 'Alerta',
      barClass: 'bg-orange-500',
    });
    expect(getFadigaAcumuladaVisual('vermelho')).toMatchObject({
      label: 'Crítico',
      barClass: 'bg-red-500',
    });
  });

  it('keeps the legend ordered by increasing severity', () => {
    const legenda = buildFadigaAcumuladaLegenda({ verde: 77, amarelo: 88, vermelho: 96 });
    expect(legenda.map((item) => item.faixa)).toEqual([
      '<77%',
      '≥77%',
      '≥88%',
      '≥96%',
    ]);
  });
});
