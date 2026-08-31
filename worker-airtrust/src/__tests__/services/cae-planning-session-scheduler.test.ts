import { describe, expect, it } from 'vitest';
import { scheduleSimulatorTrainingBlocks } from '../../services/cae-planning-session-scheduler';
import type { SimulatorTrainingSessionBlock } from '../../services/cae-planning-session-proposal';

function session(employee: number, order: number) {
  return {
    need_id: `${employee}:${order}`,
    employee_id: employee,
    employee_name: `Piloto ${employee}`,
    employee_role: employee === 1 ? 'Comandante' : 'Copiloto',
    qualification_type_id: 10,
    qualification_code: 'G1',
    qualification_name: 'AW139 — Currículo de Voo - Anual (FFS)',
    expiry_date: '2027-06-30',
    equipment: 'AW139',
    session_model_id: 100 + order,
    session_code: `S${order}`,
    session_name: `Sessão ${order}`,
    session_order: order,
    duration_minutes: 120,
    training_session_count: 2,
  };
}

function block(order: number): SimulatorTrainingSessionBlock {
  return {
    block_id: `b${order}`,
    equipment: 'AW139',
    duration_minutes: 120,
    target_date: '2027-06-30',
    pairing: 'MESMO_TREINAMENTO',
    sessions: [session(1, order), session(2, order)],
  };
}

const slots: any[] = [
  {
    equipment: 'AW139',
    date: '2027-06-29',
    start_time: '08:00',
    end_date: '2027-06-29',
    end_time: '12:00',
    duration_minutes: 240,
    state: 'OFFERED',
    confidence: 1,
  },
];

describe('session scheduler', () => {
  it('uses one 4h CAE slot as two chronological 2h session blocks', async () => {
    const result = await scheduleSimulatorTrainingBlocks({
      blocks: [block(1), block(2)],
      slots,
      referenceDate: '2027-06-01',
      preferredSessionsPerDay: 2,
      checkRoster: async () => ({ eligible: true, state: 'FOLGA', reason: 'ok' }),
    });
    expect(result.scheduled.map((item) => item.schedule_status)).toEqual(['SCHEDULED', 'SCHEDULED']);
    expect(result.scheduled[0].scheduled_slot?.start_time).toBe('08:00');
    expect(result.scheduled[0].scheduled_slot?.end_time).toBe('10:00');
    expect(result.scheduled[1].scheduled_slot?.start_time).toBe('10:00');
    expect(result.scheduled[1].scheduled_slot?.end_time).toBe('12:00');
  });

  it('does not consume CAE capacity for a session without a compatible partner', async () => {
    const solo = { ...block(1), pairing: 'SEM_DUPLA' as const, sessions: [session(1, 1)] };
    const result = await scheduleSimulatorTrainingBlocks({
      blocks: [solo],
      slots,
      referenceDate: '2027-06-01',
      preferredSessionsPerDay: 2,
      checkRoster: async () => ({ eligible: true, state: 'FOLGA', reason: 'ok' }),
    });
    expect(result.scheduled[0].schedule_status).toBe('UNMATCHED_CREW');
    expect(result.remaining_slots[0].duration_minutes).toBe(240);
  });

  it('rejects a slot when company roster policy check rejects either participant', async () => {
    const result = await scheduleSimulatorTrainingBlocks({
      blocks: [block(1)],
      slots,
      referenceDate: '2027-06-01',
      preferredSessionsPerDay: 2,
      checkRoster: async (employeeId) => ({
        eligible: employeeId !== 2,
        state: employeeId === 2 ? 'TRABALHO' : 'FOLGA',
        reason: employeeId === 2 ? 'empresa exige folga' : 'ok',
      }),
    });
    expect(result.scheduled[0].schedule_status).toBe('NO_CAE_SLOT');
  });
});
