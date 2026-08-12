import { describe, expect, it } from 'vitest';
import {
  estimateSessionCount,
  hasCompleteSimulatorSessionSchedule,
  mapPlanningStatusToLegacy,
  pairSimulatorPlanningCandidates,
  resolveQuinzenaNumero,
  selectPriorPlanningWindow,
  selectPriorQuinzenaWindow,
  type SimulatorPlanningCandidate,
} from '../../services/simulator-future-planning';

const windows = [
  { id: 1, numero: 1 as const, data_inicio: '2026-08-01', data_fim: '2026-08-15' },
  { id: 2, numero: 2 as const, data_inicio: '2026-08-16', data_fim: '2026-08-31' },
  { id: 3, numero: 1 as const, data_inicio: '2026-09-01', data_fim: '2026-09-15' },
  { id: 4, numero: 2 as const, data_inicio: '2026-09-16', data_fim: '2026-09-30' },
];

function candidate(overrides: Partial<SimulatorPlanningCandidate>): SimulatorPlanningCandidate {
  return {
    funcionarioId: 1,
    funcionarioNome: 'Piloto A',
    funcao: 'Comandante',
    qualificacaoTipoId: 10,
    qualificacaoCodigo: 'PER-AW139',
    qualificacaoNome: 'Periódico AW139',
    vencimento: '2026-10-20',
    modeloAeronave: 'AW139',
    quinzenaNumero: 1,
    politicaJanela: 'FOLGA',
    janelaTipo: 'FOLGA',
    janelaInicio: '2026-09-16',
    janelaFim: '2026-09-30',
    cargaHoras: 6,
    cargaAtual: 0,
    snapshot: {},
    ...overrides,
  };
}

describe('simulator future planning engine', () => {
  it('mantém helper legado de quinzena ativa', () => {
    expect(selectPriorQuinzenaWindow(windows, 1, '2026-10-20', null)?.id).toBe(3);
  });

  it('usa a folga como quinzena oposta cadastrada', () => {
    expect(selectPriorPlanningWindow(windows, 1, '2026-10-20', null, 'FOLGA')).toEqual({
      window: windows[3],
      type: 'FOLGA',
    });
  });

  it('usa a quinzena ativa quando solicitado', () => {
    expect(selectPriorPlanningWindow(windows, 1, '2026-10-20', null, 'QUINZENA_ATIVA')).toEqual({
      window: windows[2],
      type: 'QUINZENA_ATIVA',
    });
  });

  it('em ambos escolhe a janela válida mais próxima do vencimento', () => {
    expect(selectPriorPlanningWindow(windows, 1, '2026-10-20', null, 'AMBOS')).toEqual({
      window: windows[3],
      type: 'FOLGA',
    });
  });

  it('aplica margem configurada sem assumir 30 dias', () => {
    expect(selectPriorPlanningWindow(windows, 1, '2026-10-20', 40, 'AMBOS')).toEqual({
      window: windows[1],
      type: 'FOLGA',
    });
  });

  it('não inventa janela para quinzena personalizada', () => {
    expect(resolveQuinzenaNumero('personalizada')).toBeNull();
    expect(selectPriorPlanningWindow(windows, null, '2026-10-20', null, 'FOLGA')).toBeNull();
  });

  it('deriva quantidade e carga das sessões atuais do currículo', () => {
    expect(estimateSessionCount(8, [120, 120, 120])).toMatchObject({
      totalMinutes: 360,
      sessionCount: 3,
      typicalSessionMinutes: 120,
    });
    expect(estimateSessionCount(6, [])).toMatchObject({
      totalMinutes: 360,
      sessionCount: null,
      typicalSessionMinutes: null,
    });
  });

  it('só considera agendado quando todas as sessões do currículo foram cadastradas', () => {
    expect(hasCompleteSimulatorSessionSchedule(3, 3)).toBe(true);
    expect(hasCompleteSimulatorSessionSchedule(3, 2)).toBe(false);
    expect(hasCompleteSimulatorSessionSchedule(null, 0)).toBe(false);
  });

  it('prioriza dupla PIC/SIC compatível e mantém incompatíveis pendentes', () => {
    const result = pairSimulatorPlanningCandidates([
      candidate({ funcionarioId: 1, funcao: 'Comandante', cargaAtual: 0 }),
      candidate({
        funcionarioId: 2,
        funcionarioNome: 'Piloto B',
        funcao: 'Copiloto',
        cargaAtual: 2,
      }),
      candidate({
        funcionarioId: 3,
        funcionarioNome: 'Piloto C',
        funcao: 'Copiloto',
        janelaInicio: '2026-08-16',
        janelaFim: '2026-08-31',
      }),
    ]);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].left.funcionarioId).toBe(1);
    expect(result.pairs[0].right.funcionarioId).toBe(2);
    expect(result.unmatched.map((item) => item.funcionarioId)).toEqual([3]);
  });

  it('mapeia status detalhado sem quebrar o contrato legado', () => {
    expect(mapPlanningStatusToLegacy('PROPOSTO')).toBe('PLANEJADO');
    expect(mapPlanningStatusToLegacy('AGENDADO')).toBe('CONFIRMADO');
    expect(mapPlanningStatusToLegacy('REALIZADO')).toBe('CONCLUIDO');
    expect(mapPlanningStatusToLegacy('CANCELADO')).toBe('CANCELADO');
  });
});
