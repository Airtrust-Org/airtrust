import { describe, expect, it } from 'vitest';
import {
  pairSimulatorTrainingSessions,
  type SimulatorTrainingSessionNeed,
} from '../../services/cae-planning-session-proposal';

function need(employee: number, qualification: number, order: number): SimulatorTrainingSessionNeed {
  return {
    need_id: `${employee}:${qualification}:${order}`,
    employee_id: employee,
    employee_name: `Piloto ${employee}`,
    employee_role: employee === 1 ? 'Comandante' : 'Copiloto',
    qualification_type_id: qualification,
    qualification_code: qualification === 1 ? 'G1' : 'G1-SEM',
    qualification_name:
      qualification === 1
        ? 'AW139 — Currículo de Voo - Anual (FFS)'
        : 'AW139 — Currículo de Voo - Semestral (FFS)',
    expiry_date: '2027-03-20',
    equipment: 'AW139',
    session_model_id: qualification * 100 + order,
    session_code: `S${order}`,
    session_name: `Sessão ${order}`,
    session_order: order,
    duration_minutes: 120,
    training_session_count: 4,
  };
}

describe('session-level curricular order', () => {
  it('does not share different curricular positions in the same simulator block', () => {
    const blocks = pairSimulatorTrainingSessions([need(1, 1, 1), need(2, 2, 2)], 60, true);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.pairing === 'SEM_DUPLA')).toBe(true);
  });
});
