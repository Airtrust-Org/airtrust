import { describe, expect, it } from 'vitest';
import {
  buildSimulatorTrainingPlanV2,
  evaluateSessionCompatibility,
  type SimulatorTrainingNeed,
  type SimulatorTrainingPlanConfig,
  type SimulatorTrainingSessionNeed,
} from './../../services/simulator-training-plan-v2';

const config: SimulatorTrainingPlanConfig = {
  reference_date: '2026-08-31',
  max_anticipation_days: 90,
  allow_shared_session: true,
  allow_cross_training_pairing: true,
  prefer_same_training: true,
  prefer_same_session: true,
  prefer_complete_training_pair: true,
  prefer_complementary_roles: true,
};

function session(
  id: string,
  modelId: number,
  order: number,
  sharedKey: string,
  isCheck = false,
): SimulatorTrainingSessionNeed {
  return {
    session_id: id,
    model_id: modelId,
    code: id,
    name: `Sessão ${id}`,
    order,
    duration_minutes: 120,
    is_check: isCheck,
    shared_compatibility_keys: [sharedKey],
  };
}

function periodicNeed(params: {
  id: string;
  employeeId: number;
  name: string;
  role: string;
  expiry: string;
}): SimulatorTrainingNeed {
  return {
    need_id: params.id,
    employee_id: params.employeeId,
    employee_name: params.name,
    employee_role: params.role,
    qualification_type_id: 101,
    training_code: 'AW139-PER',
    training_name: 'AW139 Periódico',
    training_kind: 'PERIODICO',
    equipment: 'AW139',
    expiry_date: params.expiry,
    preferred_window_start: '2026-10-01',
    preferred_window_end: '2026-11-30',
    sessions: [
      session(`${params.id}-P1`, 1001, 1, 'AW139-IFR'),
      session(`${params.id}-P2`, 1002, 2, 'AW139-AFCS'),
      session(`${params.id}-P3`, 1003, 3, 'AW139-NORMAL'),
      session(`${params.id}-P4`, 1004, 4, 'AW139-CHECK', true),
    ],
  };
}

function semestralNeed(params: {
  id: string;
  employeeId: number;
  name: string;
  role: string;
  expiry: string;
}): SimulatorTrainingNeed {
  return {
    need_id: params.id,
    employee_id: params.employeeId,
    employee_name: params.name,
    employee_role: params.role,
    qualification_type_id: 102,
    training_code: 'AW139-SEM',
    training_name: 'AW139 Semestral',
    training_kind: 'SEMESTRAL',
    equipment: 'AW139',
    expiry_date: params.expiry,
    preferred_window_start: '2026-10-01',
    preferred_window_end: '2026-12-15',
    sessions: [
      session(`${params.id}-S1`, 2001, 1, 'AW139-IFR'),
      session(`${params.id}-S2`, 2002, 2, 'AW139-AFCS'),
    ],
  };
}

describe('simulator training plan V2', () => {
  it('planeja as quatro sessões do treinamento completo para uma dupla compatível', () => {
    const left = periodicNeed({
      id: 'p-a',
      employeeId: 1,
      name: 'Comandante A',
      role: 'Comandante',
      expiry: '2026-11-30',
    });
    const right = periodicNeed({
      id: 'p-b',
      employeeId: 2,
      name: 'Copiloto B',
      role: 'Copiloto',
      expiry: '2026-11-30',
    });

    const plan = buildSimulatorTrainingPlanV2({ needs: [left, right], config });

    expect(plan.summary.trainings).toBe(2);
    expect(plan.summary.session_requirements).toBe(8);
    expect(plan.summary.full_training_pairs).toBe(1);
    expect(plan.summary.full_training_paired_needs).toBe(2);
    expect(plan.blocks).toHaveLength(4);
    expect(plan.blocks.every((block) => block.pairing_scope === 'TREINAMENTO_COMPLETO')).toBe(true);
    expect(plan.blocks.every((block) => block.assignments.length === 2)).toBe(true);
    expect(plan.blocks.map((block) => block.assignments[0].session_order).sort()).toEqual([1, 2, 3, 4]);
  });

  it('combina Periódico e Semestral sessão a sessão quando não existe dupla completa', () => {
    const periodic = periodicNeed({
      id: 'periodico',
      employeeId: 10,
      name: 'Piloto Periódico',
      role: 'Comandante',
      expiry: '2026-11-30',
    });
    const semestral = semestralNeed({
      id: 'semestral',
      employeeId: 20,
      name: 'Piloto Semestral',
      role: 'Copiloto',
      expiry: '2026-12-20',
    });

    const plan = buildSimulatorTrainingPlanV2({ needs: [periodic, semestral], config });

    expect(plan.summary.full_training_pairs).toBe(0);
    expect(plan.summary.mixed_training_blocks).toBe(2);
    expect(plan.summary.shared_blocks).toBe(2);
    expect(plan.summary.solo_blocks).toBe(2);

    const mixed = plan.blocks.filter(
      (block) =>
        block.assignments.length === 2 &&
        block.assignments[0].qualification_type_id !== block.assignments[1].qualification_type_id,
    );
    expect(mixed).toHaveLength(2);
    expect(mixed[0].assignments.map((item) => item.training_kind).sort()).toEqual([
      'PERIODICO',
      'SEMESTRAL',
    ]);
  });

  it('antecipa o parceiro com vencimento posterior somente dentro da janela configurada', () => {
    const earlier = periodicNeed({
      id: 'earlier',
      employeeId: 30,
      name: 'Vence primeiro',
      role: 'Comandante',
      expiry: '2026-10-31',
    });
    const later = periodicNeed({
      id: 'later',
      employeeId: 31,
      name: 'Vence depois',
      role: 'Copiloto',
      expiry: '2026-11-30',
    });

    const compatible = evaluateSessionCompatibility({
      left_need: earlier,
      left_session: earlier.sessions[0],
      right_need: later,
      right_session: later.sessions[0],
      config,
    });

    expect(compatible.eligible).toBe(true);
    expect(compatible.score).toBeGreaterThan(0);

    const restrictiveConfig = { ...config, max_anticipation_days: 10 };
    const farEarlier = { ...earlier, expiry_date: '2026-09-10' };
    const farLater = { ...later, expiry_date: '2026-11-30' };
    const incompatible = evaluateSessionCompatibility({
      left_need: farEarlier,
      left_session: farEarlier.sessions[0],
      right_need: farLater,
      right_session: farLater.sessions[0],
      config: restrictiveConfig,
    });
    expect(incompatible.eligible).toBe(false);
  });

  it('não mistura equipamentos diferentes', () => {
    const aw139 = periodicNeed({
      id: 'aw139',
      employeeId: 40,
      name: 'AW139',
      role: 'Comandante',
      expiry: '2026-11-30',
    });
    const sk76 = {
      ...periodicNeed({
        id: 'sk76',
        employeeId: 41,
        name: 'SK76',
        role: 'Copiloto',
        expiry: '2026-11-30',
      }),
      equipment: 'SK76',
    };

    const plan = buildSimulatorTrainingPlanV2({ needs: [aw139, sk76], config });
    expect(plan.summary.full_training_pairs).toBe(0);
    expect(plan.summary.shared_blocks).toBe(0);
    expect(plan.summary.solo_blocks).toBe(8);
  });

  it('mantém cada sessão curricular exatamente uma vez no plano', () => {
    const periodic = periodicNeed({
      id: 'coverage-periodic',
      employeeId: 50,
      name: 'Periodic',
      role: 'Comandante',
      expiry: '2026-11-30',
    });
    const semestral = semestralNeed({
      id: 'coverage-semestral',
      employeeId: 51,
      name: 'Semestral',
      role: 'Copiloto',
      expiry: '2026-12-10',
    });

    const plan = buildSimulatorTrainingPlanV2({ needs: [periodic, semestral], config });
    const keys = plan.blocks.flatMap((block) =>
      block.assignments.map((item) => `${item.need_id}:${item.session_id}`),
    );
    expect(keys).toHaveLength(6);
    expect(new Set(keys).size).toBe(6);
  });
});
