import { describe, expect, it } from 'vitest';
import {
  mergeFadigaPainelHistory,
  normalizeFadigaPainelPayload,
  type FadigaCheckinItem,
  type FadigaPainelEquipeItem,
} from '@/react-app/hooks/useFadigaCheckin';

function panel(overrides: Partial<FadigaPainelEquipeItem> = {}): FadigaPainelEquipeItem {
  return {
    id: 'daily-fatigue-15-2026-08-27',
    funcionario_id: 15,
    funcionario_nome: 'Tripulante Teste',
    cargo: 'COMANDANTE',
    data: '2026-08-27',
    status: 'normal',
    data_source: 'crew_reported',
    kss_score: null,
    score_fadiga: null,
    nivel_fadiga: null,
    status_operacional: null,
    hora_checkin: null,
    horas_sono: null,
    wake_time: null,
    requires_operational_review: 0,
    ...overrides,
  };
}

function history(overrides: Partial<FadigaCheckinItem> = {}): FadigaCheckinItem {
  return {
    id: 'checkin-1',
    funcionario_id: 15,
    funcionario_nome: 'Tripulante Teste',
    data_checkin: '2026-08-27',
    hora_checkin: '06:20',
    kss_score: 1,
    horas_sono: 8,
    qualidade_sono: 4,
    score_fadiga: 4,
    nivel_fadiga: 'VERDE',
    status_operacional: 'APTO',
    requires_frat_review: 0,
    frat_sugerido_nivel: null,
    associado_frat_avaliacao_id: null,
    observacoes: null,
    ...overrides,
  };
}

describe('mergeFadigaPainelHistory', () => {
  it('preenche KSS ausente usando o check-in canônico da mesma pessoa e data', () => {
    const [result] = mergeFadigaPainelHistory([panel()], [history()]);

    expect(result.kss_score).toBe(1);
    expect(result.hora_checkin).toBe('06:20');
    expect(result.horas_sono).toBe(8);
    expect(result.status_operacional).toBe('APTO');
  });

  it('não sobrescreve KSS já informado pela visão diária', () => {
    const [result] = mergeFadigaPainelHistory([panel({ kss_score: 5 })], [history({ kss_score: 1 })]);
    expect(result.kss_score).toBe(5);
  });

  it('usa o kss_score que o endpoint daily-fatigue agora retorna diretamente', () => {
    const [result] = normalizeFadigaPainelPayload({
      date: '2026-08-27',
      items: [
        {
          funcionario_id: 15,
          funcionario_nome: 'Tripulante Teste',
          checkin_id: 'checkin-1',
          date: '2026-08-27',
          status: 'normal',
          data_source: 'crew_reported',
          kss_score: 3,
        },
      ],
    } as never);

    expect(result.kss_score).toBe(3);
    // Reconciliação vira no-op quando a fonte primária já trouxe o valor.
    const [merged] = mergeFadigaPainelHistory([result], [history({ kss_score: 9 })]);
    expect(merged.kss_score).toBe(3);
  });

  it('não mistura check-ins de outra pessoa ou outra data', () => {
    const [otherPerson] = mergeFadigaPainelHistory([panel()], [history({ funcionario_id: 99 })]);
    const [otherDate] = mergeFadigaPainelHistory([panel()], [history({ data_checkin: '2026-08-26' })]);

    expect(otherPerson.kss_score).toBeNull();
    expect(otherDate.kss_score).toBeNull();
  });
});

describe('team fatigue classification provenance fail-closed', () => {
  const baseRow = {
    funcionario_id: 15,
    funcionario_nome: 'Tripulante Sintético',
    date: '2026-10-27',
    status: 'normal',
    data_source: 'crew_reported',
  };

  it('does not silently label an unclassified row normal or not applicable', () => {
    for (const row of [
      { ...baseRow, status: undefined },
      { ...baseRow, status: 'unexpected_status' },
      { ...baseRow, data_source: undefined },
      { ...baseRow, data_source: 'unexpected_source' },
    ]) {
      expect(() => normalizeFadigaPainelPayload({ date: '2026-10-27', items: [row] }))
        .toThrow('FRMS_TEAM_CLASSIFICATION_OR_PROVENANCE_MISSING');
    }
  });

  it('preserves an explicit no-duty row without inventing a fatigue score', () => {
    const [row] = normalizeFadigaPainelPayload({
      date: '2026-10-27',
      items: [{ ...baseRow, status: 'no_duty', data_source: 'not_applicable' }],
    });
    expect(row.status).toBe('no_duty');
    expect(row.data_source).toBe('not_applicable');
    expect(row.score_fadiga).toBeNull();
    expect(row.requires_operational_review).toBe(0);
  });

  it('keeps operational review required when a risky row omits the review flag', () => {
    const [row] = normalizeFadigaPainelPayload({
      date: '2026-10-27',
      items: [{ ...baseRow, status: 'not_submitted', data_source: 'missing_checkin' }],
    });
    expect(row.requires_operational_review).toBe(1);
    expect(row.status).toBe('not_submitted');
  });
});
