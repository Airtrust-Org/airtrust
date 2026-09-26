import { describe, expect, it } from 'vitest';
import {
  RECOVERY_ACTIVITY_TIME_REQUIRED_MESSAGE,
  RECOVERY_STANDBY_CALLOUT_REQUIRED_MESSAGE,
  safeFrmsRecoveryError,
  validateRecoveryActivityInput,
} from '../useFrmsRecovery';

describe('safeFrmsRecoveryError', () => {
  it('keeps load failures operational and free of backend detail', () => {
    const message = safeFrmsRecoveryError('load');

    expect(message).toBe('Não foi possível carregar o contexto de recuperação do FRMS. Tente novamente.');
    expect(message).not.toMatch(/SQL|SQLITE|HTTP\s*5\d\d|worker\.ts|stack|D1/i);
  });

  it('keeps submission failures operational and free of backend detail', () => {
    const message = safeFrmsRecoveryError('submit');

    expect(message).toBe('Não foi possível registrar a atividade de recuperação. Tente novamente.');
    expect(message).not.toMatch(/SQL|SQLITE|HTTP\s*5\d\d|worker\.ts|stack|D1/i);
  });
});


describe('validateRecoveryActivityInput', () => {
  it('não exige janela para folga', () => {
    expect(
      validateRecoveryActivityInput({
        reference_date: '2026-09-24',
        activity_type: 'OFF_DUTY',
      }),
    ).toBeNull();
  });

  it('exige início e fim para treinamento/administrativo', () => {
    expect(
      validateRecoveryActivityInput({
        reference_date: '2026-09-24',
        activity_type: 'ADMIN_TRAINING',
      }),
    ).toBe(RECOVERY_ACTIVITY_TIME_REQUIRED_MESSAGE);
  });

  it('exige contexto de acionamento para standby depois da janela informada', () => {
    expect(
      validateRecoveryActivityInput({
        reference_date: '2026-09-24',
        activity_type: 'STANDBY_ONSITE',
        duty_start_time: '08:00',
        duty_end_time: '17:00',
      }),
    ).toBe(RECOVERY_STANDBY_CALLOUT_REQUIRED_MESSAGE);
  });

  it('aceita standby completo com janela e acionamento informados', () => {
    expect(
      validateRecoveryActivityInput({
        reference_date: '2026-09-24',
        activity_type: 'STANDBY_HOME_HOTEL',
        standby_location: 'HOTEL',
        immediate_callout_required: false,
        duty_start_time: '08:00',
        duty_end_time: '17:00',
      }),
    ).toBeNull();
  });
});
