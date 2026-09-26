import { describe, expect, it } from 'vitest';
import { validateRecoveryActivityInput } from '../useFrmsRecovery';

describe('FRMS recovery activity validation', () => {
  it('permite folga sem fabricar janela de jornada', () => {
    expect(validateRecoveryActivityInput({
      reference_date: '2026-09-24',
      activity_type: 'OFF_DUTY',
    })).toBeNull();
  });

  it('exige início/fim e acionamento imediato para standby', () => {
    expect(validateRecoveryActivityInput({
      reference_date: '2026-09-24',
      activity_type: 'STANDBY_ONSITE',
      standby_location: 'BASE_AIRPORT',
    })).toMatch(/início e o fim/i);

    expect(validateRecoveryActivityInput({
      reference_date: '2026-09-24',
      activity_type: 'STANDBY_ONSITE',
      standby_location: 'BASE_AIRPORT',
      duty_start_time: '08:00',
      duty_end_time: '17:00',
    })).toMatch(/acionamento imediato/i);

    expect(validateRecoveryActivityInput({
      reference_date: '2026-09-24',
      activity_type: 'STANDBY_ONSITE',
      standby_location: 'BASE_AIRPORT',
      duty_start_time: '08:00',
      duty_end_time: '17:00',
      immediate_callout_required: false,
    })).toBeNull();
  });

  it('exige janela real para treinamento e rejeita duração ambígua', () => {
    expect(validateRecoveryActivityInput({
      reference_date: '2026-09-24',
      activity_type: 'ADMIN_TRAINING',
      duty_start_time: '08:00',
      duty_end_time: '08:00',
    })).toMatch(/não podem ser iguais/i);

    expect(validateRecoveryActivityInput({
      reference_date: '2026-09-24',
      activity_type: 'ADMIN_TRAINING',
      duty_start_time: '08:00',
      duty_end_time: '17:00',
    })).toBeNull();
  });

  it('dias mistos exigem dois períodos completos', () => {
    expect(validateRecoveryActivityInput({
      reference_date: '2026-09-24',
      activity_type: 'MIXED',
      segments: [{ activity_type: 'ADMIN_TRAINING', start_time: '08:00', end_time: '12:00' }],
    })).toMatch(/pelo menos dois períodos/i);

    expect(validateRecoveryActivityInput({
      reference_date: '2026-09-24',
      activity_type: 'MIXED',
      segments: [
        { activity_type: 'ADMIN_TRAINING', start_time: '08:00', end_time: '12:00' },
        { activity_type: 'OFF_DUTY', start_time: '12:00', end_time: '23:00' },
      ],
    })).toBeNull();
  });
});
