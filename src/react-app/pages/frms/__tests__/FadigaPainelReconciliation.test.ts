import { describe, expect, it } from 'vitest';
import {
  mergeFadigaPainelHistory,
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

  it('não mistura check-ins de outra pessoa ou outra data', () => {
    const [otherPerson] = mergeFadigaPainelHistory([panel()], [history({ funcionario_id: 99 })]);
    const [otherDate] = mergeFadigaPainelHistory([panel()], [history({ data_checkin: '2026-08-26' })]);

    expect(otherPerson.kss_score).toBeNull();
    expect(otherDate.kss_score).toBeNull();
  });
});
