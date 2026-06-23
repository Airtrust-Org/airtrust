import { describe, expect, it } from 'vitest';
import {
  getTreinamentoConclusaoEligibility,
  validateTreinamentoConclusaoState,
  validateTreinamentoDateRange,
  validateTreinamentoDiasEfetivos,
} from '../treinamentos-planejados-rules';

describe('treinamentos planejados rules', () => {
  it('aceita data inicial anterior ou igual à final', () => {
    expect(validateTreinamentoDateRange('2026-06-20', '2026-06-23')).toBeNull();
    expect(validateTreinamentoDateRange('2026-06-23', '2026-06-23')).toBeNull();
  });

  it('rejeita data inicial posterior à final', () => {
    expect(validateTreinamentoDateRange('2026-06-24', '2026-06-23')).toBe(
      'Data inicial não pode ser posterior à data final.',
    );
  });

  it('rejeita dia efetivo fora do período', () => {
    expect(
      validateTreinamentoDiasEfetivos('2026-06-20', '2026-06-23', [
        { data: '2026-06-20' },
        { data: '2026-06-24' },
      ]),
    ).toBe('Dias efetivos devem estar dentro do período da turma.');
  });

  it('permite concluir turma passada com participantes', () => {
    expect(
      validateTreinamentoConclusaoState({
        status: 'CONCLUIDO',
        dataFinal: '2026-06-23',
        participantesCount: 2,
        today: '2026-06-23',
      }),
    ).toBeNull();
  });

  it('rejeita concluir turma futura ou sem participantes', () => {
    expect(
      validateTreinamentoConclusaoState({
        status: 'CONCLUIDO',
        dataFinal: '2026-06-24',
        participantesCount: 2,
        today: '2026-06-23',
      }),
    ).toBe('Turma concluída não pode ter período futuro.');
    expect(
      validateTreinamentoConclusaoState({
        status: 'CONCLUIDO',
        dataFinal: '2026-06-23',
        participantesCount: 0,
        today: '2026-06-23',
      }),
    ).toBe('Não é permitido concluir turma sem participantes vinculados.');
  });

  it('expõe ação rápida só para turma apta à conclusão', () => {
    expect(
      getTreinamentoConclusaoEligibility(
        {
          status: 'CONFIRMADO',
          data_prevista: '2026-06-20',
          data_fim: '2026-06-23',
          read_only: false,
          participantes: [{ id: 1 }],
        },
        '2026-06-23',
      ),
    ).toEqual({ eligible: true, reason: null });

    expect(
      getTreinamentoConclusaoEligibility(
        {
          status: 'CONFIRMADO',
          data_prevista: '2026-06-20',
          data_fim: '2026-06-24',
          read_only: false,
          participantes: [{ id: 1 }],
        },
        '2026-06-23',
      ),
    ).toEqual({
      eligible: false,
      reason: 'Turma ainda não está apta para conclusão.',
    });
  });
});
