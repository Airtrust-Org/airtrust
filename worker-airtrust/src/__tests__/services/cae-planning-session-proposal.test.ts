import { describe, expect, it } from 'vitest';
import {
  buildSimulatorTrainingClasses,
  pairSimulatorTrainingSessions,
  type SimulatorTrainingSessionNeed,
} from '../../services/cae-planning-session-proposal';

function need(
  id: string,
  employeeId: number,
  qualificationId: number,
  qualificationName: string,
  order: number,
  expiry: string,
  role: string,
): SimulatorTrainingSessionNeed {
  return {
    need_id: id,
    employee_id: employeeId,
    employee_name: `Piloto ${employeeId}`,
    employee_role: role,
    qualification_type_id: qualificationId,
    qualification_code: qualificationId === 1 ? 'G1' : 'G1-SEM',
    qualification_name: qualificationName,
    expiry_date: expiry,
    equipment: 'AW139',
    session_model_id: qualificationId * 100 + order,
    session_code: `S${order}`,
    session_name: `Sessão ${order}`,
    session_order: order,
    duration_minutes: 120,
    training_session_count: 4,
  };
}

describe('session-level simulator proposal', () => {
  it('pairs all four sessions of a recurrent training instead of only the first', () => {
    const needs = [1, 2, 3, 4].flatMap((order) => [
      need(`a-${order}`, 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', order, '2027-03-15', 'Comandante'),
      need(`b-${order}`, 20, 1, 'AW139 — Currículo de Voo - Anual (FFS)', order, '2027-03-15', 'Copiloto'),
    ]);
    const blocks = pairSimulatorTrainingSessions(needs, 60);
    expect(blocks).toHaveLength(4);
    expect(blocks.every((block) => block.sessions.length === 2)).toBe(true);
    expect(blocks.map((block) => block.sessions[0].session_order).sort()).toEqual([1, 2, 3, 4]);
  });

  it('keeps the full curriculum denominator when only later sessions remain', () => {
    const late = need('late', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 4, '2027-03-15', 'Comandante');
    late.training_session_count = 2;
    const [block] = pairSimulatorTrainingSessions([late], 60);
    expect(block.sessions[0].session_order).toBe(4);
    expect(block.sessions[0].training_session_count).toBe(4);
  });

  it('allows an annual session to share with a semestral session when duration/equipment match', () => {
    const blocks = pairSimulatorTrainingSessions(
      [
        need('per-1', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-03-15', 'Comandante'),
        need('sem-1', 20, 2, 'AW139 — Currículo de Voo - Semestral (FFS)', 1, '2027-03-30', 'Copiloto'),
      ],
      60,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].pairing).toBe('TREINAMENTOS_COMPATIVEIS');
    expect(blocks[0].sessions.map((session) => session.qualification_type_id).sort()).toEqual([1, 2]);
  });

  it('does not cross-pair annual and semestral when shared sessions are disabled by company policy', () => {
    const blocks = pairSimulatorTrainingSessions(
      [
        need('per-1', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-03-15', 'Comandante'),
        need('sem-1', 20, 2, 'AW139 — Currículo de Voo - Semestral (FFS)', 1, '2027-03-30', 'Copiloto'),
      ],
      60,
      false,
    );
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.pairing === 'SEM_DUPLA')).toBe(true);
  });

  it('does not anticipate a partner beyond the configured horizon', () => {
    const blocks = pairSimulatorTrainingSessions(
      [
        need('a', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-01-01', 'Comandante'),
        need('b', 20, 2, 'AW139 — Currículo de Voo - Semestral (FFS)', 1, '2027-06-01', 'Copiloto'),
      ],
      60,
    );
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.pairing === 'SEM_DUPLA')).toBe(true);
  });

  it('creates a stable class name by equipment and target month', () => {
    const blocks = pairSimulatorTrainingSessions(
      [
        need('a', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-06-17', 'Comandante'),
        need('b', 20, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-06-17', 'Copiloto'),
      ],
      60,
    );
    const classes = buildSimulatorTrainingClasses(blocks);
    expect(classes[0].class_name).toBe('AW139-2027.06');
  });
});
