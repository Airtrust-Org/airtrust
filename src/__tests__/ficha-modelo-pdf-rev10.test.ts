import { describe, expect, it } from 'vitest';

import { buildFichaModeloPdfData } from '../react-app/pages/simuladores/fichas/fichaModeloPdf';

describe('fichaModeloPdf PTO Rev10 compatibility', () => {
  it('prints canonical session and NTS codes for a published versioned model', () => {
    const data = buildFichaModeloPdfData(
      {
        id: 501,
        codigo: 'A139-I-01/12@PTOREV10',
        codigo_canonico: 'A139-I-01/12',
        nome: 'VFR - Procedimentos normais e familiarização',
        modelo_aeronave: 'AW139',
      },
      Array.from({ length: 18 }, (_, index) => ({
        ordem: index + 1,
        manobra_codigo: `A139-TST-${String(index + 1).padStart(3, '0')}`,
        manobra_nome: `Item técnico ${index + 1}`,
        manobra_descricao: `Item técnico ${index + 1}`,
        tripulante: index < 9 ? ('A' as const) : ('B' as const),
      })),
    );

    expect(data.sessao_codigo).toBe('A139-I-01/12');
    expect(data.fileName).not.toContain('PTOREV10');
    expect(data.manobras).toHaveLength(33);
    expect(data.manobras[18]?.codigo).toBe('NTS-TEM-01');
    expect(data.manobras.at(-1)?.codigo).toBe('NTS-DEC-15');
    expect(data.manobras[18]?.descricao).toContain('equipe');
  });

  it('keeps legacy NOTECHS codes only for an explicitly non-versioned historical fixture', () => {
    const data = buildFichaModeloPdfData(
      { id: 1, codigo: 'LEGACY-SESSION', nome: 'Sessão histórica' },
      [],
    );

    expect(data.manobras[0]?.codigo).toBe('NOTECHS-COO-01');
    expect(data.manobras.at(-1)?.codigo).toBe('NOTECHS-TMD-15');
  });
});
