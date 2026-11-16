import { describe, expect, it } from 'vitest';
import {
  buildScheduleDayIndex,
  EMPTY_SCHEDULE_DAY,
  resolveCheckinObligation,
  type CheckinScheduleEvidence,
  type ScheduleDayEvidence,
} from '../../lib/frms/checkin-obligation';

const day = (overrides: Partial<ScheduleDayEvidence> = {}): ScheduleDayEvidence => ({
  ...EMPTY_SCHEDULE_DAY,
  ...overrides,
});

/**
 * Oráculo independente: cada linha descreve a situação operacional e o
 * resultado esperado escrito à mão a partir da regra de negócio, não derivado
 * da implementação.
 */
const ORACLE: Array<{
  caso: string;
  input: Parameters<typeof resolveCheckinObligation>[0];
  status: string;
  base: string;
  exigivel: boolean;
  divergencias: string[];
}> = [
  {
    caso: 'quinzena ativa com alocação operacional e sem check-in',
    input: { hasCheckin: false, registeredActivity: false, programmedFlight: false, schedule: day({ operationalAllocation: true }) },
    status: 'PENDENTE', base: 'ALOCACAO_OPERACIONAL', exigivel: true, divergencias: [],
  },
  {
    caso: 'fora da quinzena, sem nenhuma atividade',
    input: { hasCheckin: false, registeredActivity: false, programmedFlight: false, schedule: day() },
    status: 'NAO_APLICAVEL', base: 'SEM_PROGRAMACAO', exigivel: false, divergencias: [],
  },
  {
    caso: 'só quinzena-base presumida, sem escala publicada',
    input: { hasCheckin: false, registeredActivity: false, programmedFlight: false, schedule: day({ baseFortnightPresumption: true }) },
    status: 'INDETERMINADO', base: 'QUINZENA_BASE_SEM_ESCALA', exigivel: false, divergencias: [],
  },
  {
    caso: 'folga/férias/afastamento na escala',
    input: { hasCheckin: false, registeredActivity: false, programmedFlight: false, schedule: day({ absence: 'FERIAS', baseFortnightPresumption: true }) },
    status: 'DISPENSADO', base: 'AUSENCIA_PROGRAMADA', exigivel: false, divergencias: [],
  },
  {
    caso: 'atividade real comprovada durante folga',
    input: { hasCheckin: false, registeredActivity: true, programmedFlight: false, schedule: day({ absence: 'FOLGA' }) },
    status: 'PENDENTE', base: 'ATIVIDADE_REGISTRADA', exigivel: true, divergencias: ['ATIVIDADE_EM_AUSENCIA'],
  },
  {
    caso: 'atividade registrada sem nenhuma escala (lançamento retroativo)',
    input: { hasCheckin: false, registeredActivity: true, programmedFlight: false, schedule: day() },
    status: 'PENDENTE', base: 'ATIVIDADE_REGISTRADA', exigivel: true, divergencias: ['ATIVIDADE_FORA_DA_ESCALA'],
  },
  {
    caso: 'voo programado na EVD em dia de afastamento',
    input: { hasCheckin: false, registeredActivity: false, programmedFlight: true, schedule: day({ absence: 'AFT' }) },
    status: 'PENDENTE', base: 'VOO_PROGRAMADO', exigivel: true, divergencias: ['VOO_PROGRAMADO_EM_AUSENCIA'],
  },
  {
    caso: 'alocação de serviço e de afastamento no mesmo dia',
    input: { hasCheckin: false, registeredActivity: false, programmedFlight: false, schedule: day({ operationalAllocation: true, absence: 'AFT', allocationConflict: true }) },
    status: 'INDETERMINADO', base: 'ESCALA_CONFLITANTE', exigivel: false, divergencias: ['ESCALA_CONFLITANTE'],
  },
  {
    caso: 'curso/simulador programado sem atividade registrada',
    input: { hasCheckin: false, registeredActivity: false, programmedFlight: false, schedule: day({ nonFlightAllocation: true }) },
    status: 'NAO_APLICAVEL', base: 'ATIVIDADE_NAO_VOO', exigivel: false, divergencias: [],
  },
  {
    caso: 'check-in realizado e escala depois corrigida para folga',
    input: { hasCheckin: true, registeredActivity: false, programmedFlight: false, schedule: day({ absence: 'FOLGA' }) },
    status: 'RECEBIDO', base: 'AUSENCIA_PROGRAMADA', exigivel: false, divergencias: [],
  },
  {
    caso: 'check-in recebido em dia de serviço',
    input: { hasCheckin: true, registeredActivity: false, programmedFlight: false, schedule: day({ operationalAllocation: true }) },
    status: 'RECEBIDO', base: 'ALOCACAO_OPERACIONAL', exigivel: true, divergencias: [],
  },
];

describe('resolveCheckinObligation — oráculo da regra canônica', () => {
  for (const row of ORACLE) {
    it(row.caso, () => {
      const result = resolveCheckinObligation(row.input);
      expect(result.status).toBe(row.status);
      expect(result.base).toBe(row.base);
      expect(result.exigivel).toBe(row.exigivel);
      expect(result.divergencias).toEqual(row.divergencias);
      expect(result.rotulo.length).toBeGreaterThan(0);
    });
  }

  it('nunca exige check-in apenas por presunção de quinzena (propriedade)', () => {
    for (const absence of [null, 'FOLGA']) {
      for (const nonFlight of [false, true]) {
        const result = resolveCheckinObligation({
          hasCheckin: false, registeredActivity: false, programmedFlight: false,
          schedule: day({ baseFortnightPresumption: true, absence, nonFlightAllocation: nonFlight }),
        });
        expect(result.status).not.toBe('PENDENTE');
      }
    }
  });

  it('atividade registrada sempre gera obrigação, qualquer que seja a escala (propriedade)', () => {
    const schedules = [day(), day({ absence: 'FERIAS' }), day({ allocationConflict: true, absence: 'AFT', operationalAllocation: true }), day({ baseFortnightPresumption: true })];
    for (const schedule of schedules) {
      expect(resolveCheckinObligation({ hasCheckin: false, registeredActivity: true, programmedFlight: false, schedule }).status).toBe('PENDENTE');
    }
  });
});

describe('buildScheduleDayIndex', () => {
  const evidence: CheckinScheduleEvidence = {
    allocations: [
      // Quinzena quebrada: 01–05 e 10–15, ambas na Q1.
      { funcionario_id: 1, data_inicio: '2026-11-01', data_fim: '2026-11-05', situacao_tipo: null },
      { funcionario_id: 1, data_inicio: '2026-11-10', data_fim: '2026-11-15', situacao_tipo: null },
      { funcionario_id: 2, data_inicio: '2026-11-01', data_fim: '2026-11-15', situacao_tipo: 'FERIAS' },
      { funcionario_id: 3, data_inicio: '2026-11-01', data_fim: '2026-11-15', situacao_tipo: 'STB' },
      { funcionario_id: 4, data_inicio: '2026-11-01', data_fim: '2026-11-15', situacao_tipo: 'CURSO' },
      { funcionario_id: 5, data_inicio: '2026-11-01', data_fim: '2026-11-15', situacao_tipo: null },
      { funcionario_id: 5, data_inicio: '2026-11-03', data_fim: '2026-11-03', situacao_tipo: 'aft' },
      { funcionario_id: 6, data_inicio: '2026-11-01', data_fim: '2026-11-15', situacao_tipo: null },
      // Linhas inválidas são ignoradas, sem derrubar o índice.
      { funcionario_id: 0, data_inicio: '2026-11-01', data_fim: '2026-11-15', situacao_tipo: null },
      { funcionario_id: 7, data_inicio: '2026-11-15', data_fim: '2026-11-01', situacao_tipo: null },
    ],
    absenceEvents: [{ funcionario_id: 6, data_inicio: '2026-11-08', data_fim: '2026-11-09', tipo_evento: 'folga' }],
    baseFortnights: [1, 2, 7, 8].map((id) => ({ funcionario_id: id, data_inicio: '2026-11-01', data_fim: '2026-11-15' })),
  };
  const lookup = buildScheduleDayIndex(evidence);

  it('quinzena quebrada: dia entre as alocações não herda a quinzena-base', () => {
    expect(lookup(1, '2026-11-03')).toMatchObject({ operationalAllocation: true, baseFortnightPresumption: false });
    expect(lookup(1, '2026-11-07')).toMatchObject({ operationalAllocation: false, baseFortnightPresumption: false, absence: null });
    expect(lookup(1, '2026-11-12').operationalAllocation).toBe(true);
  });

  it('férias anulam a presunção da quinzena-base', () => {
    expect(lookup(2, '2026-11-05')).toMatchObject({ absence: 'FERIAS', operationalAllocation: false, baseFortnightPresumption: false });
  });

  it('standby é serviço; curso não é voo', () => {
    expect(lookup(3, '2026-11-05').operationalAllocation).toBe(true);
    expect(lookup(4, '2026-11-05')).toMatchObject({ nonFlightAllocation: true, operationalAllocation: false });
  });

  it('afastamento sobreposto a alocação operacional é conflito, não dispensa silenciosa', () => {
    expect(lookup(5, '2026-11-03')).toMatchObject({ allocationConflict: true, absence: 'AFT' });
    expect(lookup(5, '2026-11-04')).toMatchObject({ allocationConflict: false, absence: null });
  });

  it('evento diário manual de folga quebra a alocação sem conflito', () => {
    expect(lookup(6, '2026-11-08')).toMatchObject({ absence: 'folga', allocationConflict: false });
    expect(lookup(6, '2026-11-10')).toMatchObject({ absence: null, operationalAllocation: true });
  });

  it('quinzena-base sem nenhuma alocação válida permanece presunção', () => {
    expect(lookup(7, '2026-11-05').baseFortnightPresumption).toBe(true);
    expect(lookup(8, '2026-11-05').baseFortnightPresumption).toBe(true);
    expect(lookup(8, '2026-11-20').baseFortnightPresumption).toBe(false);
  });
});
