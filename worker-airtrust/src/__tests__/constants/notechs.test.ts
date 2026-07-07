import { describe, expect, it } from 'vitest';
import {
  buildOperationalFichaManobras,
  FICHA_TECNICAS_PADRAO_LIMITE,
  NOTECHS_CATEGORIA,
  NOTECHS_ITENS_CATALOGO,
  NOTECHS_ORDEM_BASE,
  FICHA_STATUS_FINALIZADOS,
  getMissingNotechsItens,
  getNotechsStatus,
  hasCompleteNotechsItens,
  isFichaStatusFinalizado,
  hasNotechsItens,
} from '../../constants/notechs';

describe('NOTECHS catalog integrity', () => {
  it('has exactly 15 fixed items', () => {
    expect(NOTECHS_ITENS_CATALOGO).toHaveLength(15);
  });

  it('has unique codigos', () => {
    const codigos = NOTECHS_ITENS_CATALOGO.map((item) => item.codigo);
    expect(new Set(codigos).size).toBe(15);
  });

  it('preserves fixed order via sequential ordem starting at NOTECHS_ORDEM_BASE', () => {
    const ordens = NOTECHS_ITENS_CATALOGO.map((item) => item.ordem);
    expect(ordens).toEqual(Array.from({ length: 15 }, (_, i) => NOTECHS_ORDEM_BASE + i));
  });

  it('reserves an ordem namespace outside the 1-22 range used by variable manobras', () => {
    for (const item of NOTECHS_ITENS_CATALOGO) {
      expect(item.ordem).toBeGreaterThan(22);
    }
  });

  it('every item has non-empty PT title (nome) and EN title (descricao)', () => {
    for (const item of NOTECHS_ITENS_CATALOGO) {
      expect(item.nome.trim().length).toBeGreaterThan(0);
      expect(item.descricao.trim().length).toBeGreaterThan(0);
      expect(item.codigo).toMatch(/^NOTECHS-(COO|LID|CSA|TMD)-\d{2}$/);
    }
  });
});

describe('isFichaStatusFinalizado', () => {
  it('treats APROVADO, NAO_APROVADO, CONCLUIDA as finalized', () => {
    for (const status of FICHA_STATUS_FINALIZADOS) {
      expect(isFichaStatusFinalizado(status)).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(isFichaStatusFinalizado('aprovado')).toBe(true);
    expect(isFichaStatusFinalizado('Concluida')).toBe(true);
  });

  it('treats editable statuses as not finalized', () => {
    expect(isFichaStatusFinalizado('AVALIACAO_PENDENTE')).toBe(false);
    expect(isFichaStatusFinalizado('AGUARDANDO_ASSINATURA_ALUNO')).toBe(false);
    expect(isFichaStatusFinalizado(null)).toBe(false);
    expect(isFichaStatusFinalizado(undefined)).toBe(false);
  });
});

describe('hasNotechsItens', () => {
  it('returns false for an empty manobras list', () => {
    expect(hasNotechsItens([])).toBe(false);
  });

  it('returns false when only technical manobras are present', () => {
    expect(hasNotechsItens([{ categoria: 'GERAL' }, { categoria: 'EMERGENCIA' }])).toBe(false);
  });

  it('returns true when at least one NOTECHS row is present', () => {
    expect(hasNotechsItens([{ categoria: 'GERAL' }, { categoria: NOTECHS_CATEGORIA }])).toBe(true);
  });

  it('is case-insensitive on categoria', () => {
    expect(hasNotechsItens([{ categoria: 'notechs' }])).toBe(true);
  });

  it('tolerates missing/null categoria', () => {
    expect(hasNotechsItens([{ categoria: null }, {}])).toBe(false);
  });
});

describe('getMissingNotechsItens / hasCompleteNotechsItens', () => {
  it('returns all 15 items when no NOTECHS row exists yet', () => {
    expect(getMissingNotechsItens([{ categoria: 'GERAL', codigo: 'MAN-01' }])).toHaveLength(15);
    expect(hasCompleteNotechsItens([{ categoria: 'GERAL', codigo: 'MAN-01' }])).toBe(false);
  });

  it('returns only the missing NOTECHS items when the ficha is partial', () => {
    const missing = getMissingNotechsItens([
      { categoria: NOTECHS_CATEGORIA, codigo: 'NOTECHS-COO-01' },
      { categoria: NOTECHS_CATEGORIA, codigo: 'NOTECHS-COO-02' },
      { categoria: 'GERAL', codigo: 'MAN-01' },
    ]);

    expect(missing).toHaveLength(13);
    expect(missing[0]?.codigo).toBe('NOTECHS-COO-03');
    expect(
      hasCompleteNotechsItens([
        { categoria: NOTECHS_CATEGORIA, codigo: 'NOTECHS-COO-01' },
        { categoria: NOTECHS_CATEGORIA, codigo: 'NOTECHS-COO-02' },
      ]),
    ).toBe(false);
  });

  it('returns no missing items when all 15 NOTECHS already exist', () => {
    const rows = NOTECHS_ITENS_CATALOGO.map((item) => ({
      categoria: NOTECHS_CATEGORIA,
      codigo: item.codigo,
    }));

    expect(getMissingNotechsItens(rows)).toEqual([]);
    expect(hasCompleteNotechsItens(rows)).toBe(true);
  });

  it('classifies missing, partial and complete NOTECHS states', () => {
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

describe('buildOperationalFichaManobras', () => {
  const blockedObservacoes = [
    'tipo_item=tecnica; fase_voo=pre_partida; carater=treinamento; matriz_v6_modelo=A139-I-01/12',
    'ver sourceNotes do loader',
    'prompt interno do agente',
    'debug RBAC role tenant',
    '{"metadata":"internal"}',
  ];

  it('keeps the first 18 técnicas by ordem and appends the 15 fixed NOTECHS rows', () => {
    const tecnicas = Array.from({ length: 22 }, (_, index) => ({
      codigo: `MAN-${index + 1}`,
      nome: `Manobra ${index + 1}`,
      descricao: `Descricao ${index + 1}`,
      categoria: 'GERAL',
      ordem: index + 1,
      tripulante: 'AB',
    }));

    const materialized = buildOperationalFichaManobras(tecnicas);
    const tecnicasMaterialized = materialized.filter(
      (item) => item.categoria !== NOTECHS_CATEGORIA,
    );
    const notechsMaterialized = materialized.filter((item) => item.categoria === NOTECHS_CATEGORIA);

    expect(tecnicasMaterialized).toHaveLength(FICHA_TECNICAS_PADRAO_LIMITE);
    expect(tecnicasMaterialized.at(-1)?.codigo).toBe('MAN-18');
    expect(notechsMaterialized).toHaveLength(15);
    expect(notechsMaterialized[0]?.codigo).toMatch(/^NOTECHS-COO-01$/);
    expect(notechsMaterialized.at(-1)?.codigo).toMatch(/^NOTECHS-TMD-15$/);
  });

  it('uses modelos_sessao_manobras.observacoes as a per-model text override when present', () => {
    const tecnicas = [
      {
        codigo: 'A139-CKL-01',
        nome: 'Normal checklist — preparação noturna',
        descricao: 'Normal checklist — preparação noturna',
        categoria: 'PROCEDIMENTO',
        ordem: 1,
        tripulante: 'AB',
        observacoes: 'Normal checklist — preparação IFR semestral',
      },
      {
        codigo: 'A139-EST-01',
        nome: 'Estacionamento e corte pós-voo noturno',
        descricao: 'Estacionamento e corte pós-voo noturno',
        categoria: 'PROCEDIMENTO',
        ordem: 2,
        tripulante: 'AB',
        observacoes: '   ',
      },
    ];

    const [first, second] = buildOperationalFichaManobras(tecnicas);

    expect(first?.nome).toBe('Normal checklist — preparação IFR semestral');
    expect(first?.descricao).toBe('Normal checklist — preparação IFR semestral');
    // Blank/whitespace-only override falls back to the catalog text unchanged.
    expect(second?.nome).toBe('Estacionamento e corte pós-voo noturno');
  });

  it.each(blockedObservacoes)(
    'ignora override de observacoes que contenha metadado interno: %s',
    (observacoes) => {
      const tecnicas = [
        {
          codigo: 'A139-CKL-01',
          nome: 'Normal checklist',
          descricao: 'Normal checklist',
          categoria: 'PROCEDIMENTO',
          ordem: 1,
          tripulante: 'AB',
          observacoes,
        },
      ];

      const [first] = buildOperationalFichaManobras(tecnicas);

      expect(first?.nome).toBe('Normal checklist');
      expect(first?.descricao).toBe('Normal checklist');
    },
  );
});
