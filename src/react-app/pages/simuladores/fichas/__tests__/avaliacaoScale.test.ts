import { describe, expect, it } from 'vitest';

import {
  buildFichaAvaliacaoScaleHtml,
  FICHA_AVALIACAO_FAIXAS,
  FICHA_AVALIACAO_NOTAS,
  getFichaAvaliacaoScaleCss,
} from '../avaliacaoScale';

describe('avaliacaoScale', () => {
  it('expõe notas de 1 a 10 e os descritores operacionais obrigatorios', () => {
    expect(FICHA_AVALIACAO_NOTAS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(FICHA_AVALIACAO_FAIXAS).toHaveLength(4);
    expect(FICHA_AVALIACAO_FAIXAS.map((faixa) => faixa.rangeLabel)).toEqual([
      '1-2',
      '3-4',
      '5-7',
      '8-10',
    ]);
  });

  it('gera markup reutilizavel com as notas e textos da regua', () => {
    const html = buildFichaAvaliacaoScaleHtml();
    const css = getFichaAvaliacaoScaleCss();

    expect(html).toContain('Regua de Avaliacao');
    expect(html).toContain('Padrao');
    expect(html).toContain('1</td>');
    expect(html).toContain('10</td>');
    expect(html).toContain('Acima da Media');
    expect(css).toContain('.avaliacao-scale-table');
    expect(css).toContain('grid-template-columns');
  });
});
