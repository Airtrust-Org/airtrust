import { describe, expect, it } from 'vitest';
import {
  buildOperationalFichaManobras,
  FICHA_STATUS_FINALIZADOS,
  FICHA_TECNICAS_PADRAO_LIMITE,
  NOTECHS_CATEGORIA,
  NOTECHS_ITENS_CATALOGO,
  NOTECHS_ORDEM_BASE,
  getMissingNotechsItens,
  getNotechsStatus,
  hasCompleteNotechsItens,
  hasNotechsItens,
  isFichaStatusFinalizado,
} from '../../constants/notechs';

const LEGACY_NOTECHS_CODES = [
  'NOTECHS-COO-01',
  'NOTECHS-COO-02',
  'NOTECHS-COO-03',
  'NOTECHS-COO-04',
  'NOTECHS-LID-05',
  'NOTECHS-LID-06',
  'NOTECHS-LID-07',
  'NOTECHS-LID-08',
  'NOTECHS-CSA-09',
  'NOTECHS-CSA-10',
  'NOTECHS-CSA-11',
  'NOTECHS-TMD-12',
  'NOTECHS-TMD-13',
  'NOTECHS-TMD-14',
  'NOTECHS-TMD-15',
];

describe('NOTECHS PTO Rev10 catalog integrity', () => {
  it('has exactly 15 unique canonical NTS codes in reserved order', () => {
    expect(NOTECHS_ITENS_CATALOGO).toHaveLength(15);
    expect(new Set(NOTECHS_ITENS_CATALOGO.map((item) => item.codigo)).size).toBe(15);
    expect(NOTECHS_ITENS_CATALOGO.map((item) => item.ordem)).toEqual(
      Array.from({ length: 15 }, (_, index) => NOTECHS_ORDEM_BASE + index),
    );
    for (const item of NOTECHS_ITENS_CATALOGO) {
      expect(item.codigo).toMatch(/^NTS-(TEM|LDR|WLM|SA|DEC)-\d{2}$/);
      expect(item.nome.trim()).not.toBe('');
      expect(item.descricao.trim()).not.toBe('');
      expect(item.ordem).toBeGreaterThan(22);
    }
  });
});

describe('NOTECHS historical compatibility', () => {
  it('does not duplicate a complete legacy NOTECHS block', () => {
    const legacyRows = LEGACY_NOTECHS_CODES.map((codigo) => ({
      categoria: NOTECHS_CATEGORIA,
      codigo,
    }));

    expect(getMissingNotechsItens(legacyRows)).toEqual([]);
    expect(hasCompleteNotechsItens(legacyRows)).toBe(true);
    expect(getNotechsStatus(legacyRows)).toBe('complete');
  });

  it('returns canonical NTS items for a partial legacy block', () => {
    const missing = getMissingNotechsItens([
      { categoria: NOTECHS_CATEGORIA, codigo: 'NOTECHS-COO-01' },
      { categoria: NOTECHS_CATEGORIA, codigo: 'NTS-TEM-02' },
    ]);

    expect(missing).toHaveLength(13);
    expect(missing[0]?.codigo).toBe('NTS-TEM-03');
  });

  it('classifies empty, partial and canonical complete states', () => {
    expect(getNotechsStatus([{ categoria: 'GERAL', codigo: 'MAN-01' }])).toBe('missing');
    expect(
      getNotechsStatus([
        { categoria: NOTECHS_CATEGORIA, codigo: NOTECHS_ITENS_CATALOGO[0].codigo },
      ]),
    ).toBe('partial');
    expect(
      getNotechsStatus(
        NOTECHS_ITENS_CATALOGO.map((item) => ({
          categoria: NOTECHS_CATEGORIA,
          codigo: item.codigo,
        })),
      ),
    ).toBe('complete');
  });
});

describe('NOTECHS helpers', () => {
  it('recognizes finalized ficha statuses case-insensitively', () => {
    for (const status of FICHA_STATUS_FINALIZADOS) {
      expect(isFichaStatusFinalizado(status.toLowerCase())).toBe(true);
    }
    expect(isFichaStatusFinalizado('AVALIACAO_PENDENTE')).toBe(false);
    expect(isFichaStatusFinalizado(null)).toBe(false);
  });

  it('detects NOTECHS rows by category only', () => {
    expect(hasNotechsItens([])).toBe(false);
    expect(hasNotechsItens([{ categoria: 'GERAL' }])).toBe(false);
    expect(hasNotechsItens([{ categoria: 'notechs' }])).toBe(true);
  });
});

describe('buildOperationalFichaManobras', () => {
  it('keeps the first 18 technical items and appends the 15 canonical NOTECHS', () => {
    const tecnicas = Array.from({ length: 22 }, (_, index) => ({
      codigo: `MAN-${index + 1}`,
      nome: `Manobra ${index + 1}`,
      descricao: `Descrição ${index + 1}`,
      categoria: 'GERAL',
      ordem: index + 1,
      tripulante: 'AB',
    }));

    const materialized = buildOperationalFichaManobras(tecnicas);
    const technical = materialized.filter((item) => item.categoria !== NOTECHS_CATEGORIA);
    const notechs = materialized.filter((item) => item.categoria === NOTECHS_CATEGORIA);

    expect(technical).toHaveLength(FICHA_TECNICAS_PADRAO_LIMITE);
    expect(technical.at(-1)?.codigo).toBe('MAN-18');
    expect(notechs).toHaveLength(15);
    expect(notechs[0]?.codigo).toBe('NTS-TEM-01');
    expect(notechs.at(-1)?.codigo).toBe('NTS-DEC-15');
  });

  it('uses a safe per-model text override and ignores internal metadata', () => {
    const [safe] = buildOperationalFichaManobras([
      {
        codigo: 'A139-CKL-01',
        nome: 'Normal checklist',
        descricao: 'Normal checklist',
        categoria: 'PROCEDIMENTO',
        ordem: 1,
        observacoes: 'Normal checklist — preparação IFR semestral',
      },
    ]);
    const [blocked] = buildOperationalFichaManobras([
      {
        codigo: 'A139-CKL-01',
        nome: 'Normal checklist',
        descricao: 'Normal checklist',
        categoria: 'PROCEDIMENTO',
        ordem: 1,
        observacoes: 'tipo_item=tecnica; matriz_v6_modelo=A139-I-01/12',
      },
    ]);

    expect(safe?.nome).toBe('Normal checklist — preparação IFR semestral');
    expect(blocked?.nome).toBe('Normal checklist');
  });
});
