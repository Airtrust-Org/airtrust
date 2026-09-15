import { describe, expect, it } from 'vitest';
import {
  applyRecurringPriorityOverSemiannual,
  type QualificationRow,
  type TrainingCoverageRule,
} from '../../routes/simuladores-planejamento-v2';

const RULE: TrainingCoverageRule = {
  source_qualification_type_id: 33,
  source_qualification_code: 'G1',
  source_qualification_name: 'AW139 — Currículo de Voo - Periódico Anual (FFS)',
  destination_qualification_type_id: 106,
};

function qualification(overrides: Partial<QualificationRow> = {}): QualificationRow {
  return {
    funcionario_id: 10,
    funcionario_nome: 'Piloto QA',
    funcionario_funcao: 'Comandante',
    qualificacao_tipo_id: 33,
    qualificacao_codigo: 'G1',
    qualificacao_nome: 'AW139 — Currículo de Voo - Periódico Anual (FFS)',
    data_vencimento: '2026-09-20',
    cycle_start_date: '2025-09-20',
    ...overrides,
  };
}

describe('simulator planning recurring priority over semiannual', () => {
  it('promotes an eligible semiannual crew member to the recurring program when paired in the same horizon', () => {
    const result = applyRecurringPriorityOverSemiannual({
      qualifications: [
        qualification({ funcionario_id: 10, funcionario_nome: 'Felipe' }),
        qualification({
          funcionario_id: 20,
          funcionario_nome: 'Nivaldo',
          qualificacao_tipo_id: 106,
          qualificacao_codigo: 'G1-SEM',
          qualificacao_nome: 'AW139 — Currículo de Voo - Semestral (FFS)',
          data_vencimento: '2026-09-30',
        }),
      ],
      rules: [RULE],
      maxPairingDays: 90,
      eligibleRecurringKeys: new Set(['20:33']),
    });

    const nivaldo = result.find((item) => item.funcionario_id === 20);
    expect(nivaldo).toMatchObject({
      qualificacao_tipo_id: 33,
      qualificacao_codigo: 'G1',
      requirement_qualification_type_id: 106,
      requirement_qualification_code: 'G1-SEM',
      coverage_reason: 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL',
    });
    expect(nivaldo?.satisfies_qualification_type_ids).toEqual([33, 106]);
  });

  it('collapses the same employee annual and semiannual obligations into one recurring execution with the earlier deadline', () => {
    const result = applyRecurringPriorityOverSemiannual({
      qualifications: [
        qualification({ funcionario_id: 20, data_vencimento: '2026-12-31' }),
        qualification({
          funcionario_id: 20,
          qualificacao_tipo_id: 106,
          qualificacao_codigo: 'G1-SEM',
          qualificacao_nome: 'AW139 — Currículo de Voo - Semestral (FFS)',
          data_vencimento: '2026-09-30',
        }),
      ],
      rules: [RULE],
      maxPairingDays: 180,
      eligibleRecurringKeys: new Set(),
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      qualificacao_tipo_id: 33,
      data_vencimento: '2026-09-30',
      coverage_reason: 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL',
    });
    expect(result[0].satisfies_qualification_type_ids).toEqual([33, 106]);
  });

  it('keeps semiannual unchanged when the employee is not eligible for the recurring program', () => {
    const result = applyRecurringPriorityOverSemiannual({
      qualifications: [
        qualification({ funcionario_id: 10, funcionario_nome: 'Felipe' }),
        qualification({
          funcionario_id: 20,
          funcionario_nome: 'Nivaldo',
          qualificacao_tipo_id: 106,
          qualificacao_codigo: 'G1-SEM',
          qualificacao_nome: 'AW139 — Currículo de Voo - Semestral (FFS)',
        }),
      ],
      rules: [RULE],
      maxPairingDays: 90,
      eligibleRecurringKeys: new Set(),
    });

    expect(result.find((item) => item.funcionario_id === 20)?.qualificacao_tipo_id).toBe(106);
    expect(result.find((item) => item.funcionario_id === 20)?.coverage_reason).toBeNull();
  });

  it('does not promote a semiannual requirement when fixed Escala 1/2 cannot form a common FOLGA pair', () => {
    const result = applyRecurringPriorityOverSemiannual({
      qualifications: [
        qualification({ funcionario_id: 10, funcionario_nome: 'Felipe' }),
        qualification({
          funcionario_id: 20,
          funcionario_nome: 'Nivaldo',
          qualificacao_tipo_id: 106,
          qualificacao_codigo: 'G1-SEM',
          qualificacao_nome: 'AW139 — Currículo de Voo - Semestral (FFS)',
        }),
      ],
      rules: [RULE],
      maxPairingDays: 90,
      eligibleRecurringKeys: new Set(['20:33']),
      fixedFortnightByEmployee: new Map([
        [10, 1],
        [20, 2],
      ]),
      rosterPolicy: 'FOLGA',
    });

    expect(result.find((item) => item.funcionario_id === 20)?.qualificacao_tipo_id).toBe(106);
  });

  it('does not promote a semiannual requirement when the recurring peer is outside the pairing horizon', () => {
    const result = applyRecurringPriorityOverSemiannual({
      qualifications: [
        qualification({ funcionario_id: 10, data_vencimento: '2027-03-01' }),
        qualification({
          funcionario_id: 20,
          qualificacao_tipo_id: 106,
          qualificacao_codigo: 'G1-SEM',
          qualificacao_nome: 'AW139 — Currículo de Voo - Semestral (FFS)',
          data_vencimento: '2026-09-30',
        }),
      ],
      rules: [RULE],
      maxPairingDays: 90,
      eligibleRecurringKeys: new Set(['20:33']),
    });

    expect(result.find((item) => item.funcionario_id === 20)?.qualificacao_tipo_id).toBe(106);
  });
});
