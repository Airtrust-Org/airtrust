import { describe, expect, it } from 'vitest';
import { calculateFadigaScore } from '../../lib/frms/fadiga-score';

describe('calculateFadigaScore', () => {
  it('retorna BAIXO/APTO para cenário saudável', () => {
    const out = calculateFadigaScore({
      kssScore: 2,
      horasSono: 8,
      qualidadeSono: 5,
      sintomas: [],
    });

    expect(out.nivelFadiga).toBe('BAIXO');
    expect(out.statusOperacional).toBe('APTO');
    expect(out.apto).toBe(true);
    expect(out.requiresFratReview).toBe(false);
  });

  it('força CRITICO/NAO_APTO para KSS extremo', () => {
    const out = calculateFadigaScore({
      kssScore: 9,
      horasSono: 7,
      qualidadeSono: 4,
      sintomas: ['Sonolência'],
    });

    expect(out.nivelFadiga).toBe('CRITICO');
    expect(out.statusOperacional).toBe('NAO_APTO');
    expect(out.apto).toBe(false);
    expect(out.requiresFratReview).toBe(true);
  });

  it('retorna ALTO/RESTRITO quando cruza threshold vermelho', () => {
    const out = calculateFadigaScore(
      {
        kssScore: 7,
        horasSono: 5,
        qualidadeSono: 2,
        sintomas: ['Sonolência', 'Dor de cabeça', 'Baixa concentração'],
      },
      {
        thresholdAmarelo: 35,
        thresholdVermelho: 55,
      },
    );

    expect(out.scoreFadiga).toBeGreaterThanOrEqual(55);
    expect(out.nivelFadiga).toBe('ALTO');
    expect(out.statusOperacional).toBe('RESTRITO');
    expect(out.requiresFratReview).toBe(true);
  });
});
