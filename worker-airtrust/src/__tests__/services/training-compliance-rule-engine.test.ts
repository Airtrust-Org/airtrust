import { describe, expect, it } from 'vitest';
import {
  resolveTrainingComplianceRules,
  trainingComplianceEffectiveRequirementPredicateSql,
  trainingComplianceRuleApplies,
  trainingComplianceRulePriority,
} from '../../services/training-compliance-rule-engine';

const employee = {
  id: 10,
  setor_id: 3,
  funcao_id: 7,
  aeronaves_modelos: ['AW139'],
  condicoes_ids: [55],
};

const base = {
  qualificacao_tipo_id: 100,
  setor_id: null,
  funcao_id: null,
  funcionario_id: null,
  aeronave_modelo: null,
  condicao_id: null,
} as const;

describe('training compliance rule engine', () => {
  it('requires active employee conditions in addition to organizational scope', () => {
    expect(
      trainingComplianceRuleApplies(
        { ...base, id: 1, escopo: 'EMPRESA', condicao_id: 55 },
        employee,
      ),
    ).toBe(true);
    expect(
      trainingComplianceRuleApplies(
        { ...base, id: 2, escopo: 'EMPRESA', condicao_id: 99 },
        employee,
      ),
    ).toBe(false);
  });

  it('keeps employee override highest while condition and aircraft outrank generic org rules', () => {
    const company = { ...base, id: 1, escopo: 'EMPRESA' as const };
    const role = { ...base, id: 2, escopo: 'FUNCAO' as const, funcao_id: 7 };
    const conditional = { ...base, id: 3, escopo: 'EMPRESA' as const, condicao_id: 55 };
    const aircraft = {
      ...base,
      id: 4,
      escopo: 'FUNCAO' as const,
      funcao_id: 7,
      aeronave_modelo: 'AW139',
    };
    const individual = { ...base, id: 5, escopo: 'FUNCIONARIO' as const, funcionario_id: 10 };
    expect(trainingComplianceRulePriority(individual)).toBeGreaterThan(
      trainingComplianceRulePriority(conditional),
    );
    expect(trainingComplianceRulePriority(conditional)).toBeGreaterThan(
      trainingComplianceRulePriority(aircraft),
    );
    expect(trainingComplianceRulePriority(aircraft)).toBeGreaterThan(
      trainingComplianceRulePriority(role),
    );
    expect(
      resolveTrainingComplianceRules([company, role, conditional, aircraft, individual], employee),
    ).toEqual([individual]);
  });

  it('keeps simultaneous competency profiles of the same qualification while preserving generic overrides', () => {
    const fallback = { ...base, id: 1, escopo: 'EMPRESA' as const, perfil_competencia: null };
    const tripulante = {
      ...base,
      id: 2,
      escopo: 'FUNCAO' as const,
      funcao_id: 7,
      perfil_competencia: 'AVSEC_TRIPULANTE',
    };
    const solo = {
      ...base,
      id: 3,
      escopo: 'EMPRESA' as const,
      condicao_id: 55,
      perfil_competencia: 'AVSEC_OPERACOES_SOLO',
    };
    expect(resolveTrainingComplianceRules([fallback, tripulante, solo], employee)).toEqual([
      tripulante,
      solo,
    ]);

    const individualOverride = {
      ...base,
      id: 4,
      escopo: 'FUNCIONARIO' as const,
      funcionario_id: 10,
      perfil_competencia: null,
    };
    expect(
      resolveTrainingComplianceRules([fallback, tripulante, solo, individualOverride], employee),
    ).toEqual([individualOverride]);
  });

  it('generates the same condition-aware predicate for renewal and expiry notification paths', () => {
    const sql = trainingComplianceEffectiveRequirementPredicateSql({ requireAutoEnrollment: true });
    expect(sql).toContain('funcionarios_compliance_condicoes');
    expect(sql).toContain('funcionarios_aeronaves');
    expect(sql).toContain("tr.obrigatoriedade='OBRIGATORIA'");
    expect(sql).toContain('tr.auto_matricular_ead');
    expect(sql).toContain('tr.condicao_id');
  });
});
