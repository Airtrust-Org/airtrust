import { describe, expect, it } from 'vitest';
import { buildSimulatorMaterializationPlan } from './../../services/cae-planning-materialization';

const base = {
  proposal_id: 100,
  proposal_status: 'CONFIRMADO' as const,
  slot_key: 'AW139|2026-11-20|08:00|2026-11-20|12:00',
  equipment: 'AW139',
  date: '2026-11-20',
  start_time: '08:00',
  end_time: '12:00',
};

describe('CAE materialization plan', () => {
  it('gera sessão normal quando ambos têm a mesma atribuição curricular', () => {
    const result = buildSimulatorMaterializationPlan({
      ...base,
      mode: 'NORMAL',
      participants: [
        { employee_id: 1, planned_training_id: 10, session_model_id: 101, session_order: 1, generate_ficha: true },
        { employee_id: 2, planned_training_id: 10, session_model_id: 101, session_order: 1, generate_ficha: true },
      ],
    });
    expect(result.kind).toBe('NORMAL_SESSION');
  });

  it('gera sessão compartilhada mantendo atribuição curricular individual', () => {
    const result = buildSimulatorMaterializationPlan({
      ...base,
      mode: 'COMPARTILHADA',
      participants: [
        { employee_id: 1, planned_training_id: 10, session_model_id: 105, session_order: 5, generate_ficha: true },
        { employee_id: 2, planned_training_id: 20, session_model_id: 201, session_order: 1, generate_ficha: true },
      ],
    });
    expect(result.kind).toBe('SHARED_SESSION');
    if (result.kind === 'SHARED_SESSION') {
      expect(result.curricular_assignments).toHaveLength(2);
      expect(result.curricular_assignments[0].session_model_id).not.toBe(result.curricular_assignments[1].session_model_id);
    }
  });

  it('impede classificar como normal sessões curriculares diferentes', () => {
    expect(() => buildSimulatorMaterializationPlan({
      ...base,
      mode: 'NORMAL',
      participants: [
        { employee_id: 1, planned_training_id: 10, session_model_id: 105, session_order: 5, generate_ficha: true },
        { employee_id: 2, planned_training_id: 20, session_model_id: 201, session_order: 1, generate_ficha: true },
      ],
    })).toThrow('NORMAL_SESSION_REQUIRES_SAME_CURRICULAR_ASSIGNMENT');
  });
});
