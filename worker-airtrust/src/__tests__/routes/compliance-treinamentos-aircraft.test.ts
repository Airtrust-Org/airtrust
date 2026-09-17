import { describe, expect, it } from 'vitest';
import {
  normalizeAircraftModel,
  resolvedRules,
  ruleApplies,
} from '../../routes/compliance-treinamentos';

function employee(models: string[]) {
  return {
    id: 100,
    nome: 'Tripulante Teste',
    setor_id: 10,
    setor_nome: 'Operações',
    funcao_id: 2,
    funcao_nome: 'Piloto',
    aeronaves_modelos: models,
  } as any;
}

function rule(
  id: number,
  qualificationId: number,
  aircraft: string | null,
  scope: 'EMPRESA' | 'SETOR_FUNCAO' = 'SETOR_FUNCAO',
) {
  return {
    id,
    empresa_id: 1,
    qualificacao_tipo_id: qualificationId,
    qualificacao_tipo_nome: `Treinamento ${qualificationId}`,
    qualificacao_tipo_codigo: `T${qualificationId}`,
    validade_meses: 12,
    escopo: scope,
    setor_id: scope === 'SETOR_FUNCAO' ? 10 : null,
    setor_nome: scope === 'SETOR_FUNCAO' ? 'Operações' : null,
    funcao_id: scope === 'SETOR_FUNCAO' ? 2 : null,
    funcao_nome: scope === 'SETOR_FUNCAO' ? 'Piloto' : null,
    funcionario_id: null,
    funcionario_nome: null,
    aeronave_modelo: aircraft,
    obrigatoriedade: 'OBRIGATORIA',
    nivel_requerido: null,
    critico_operacional: 0,
    origem: 'EMPRESA',
    referencia_normativa: null,
    observacoes: null,
    vigencia_inicio: null,
    vigencia_fim: null,
    prazo_inicial_dias: null,
    auto_matricular_ead: 0,
    ativo: 1,
    created_at: '2026-09-16',
    updated_at: '2026-09-16',
  } as any;
}

describe('training compliance aircraft applicability', () => {
  it('normalizes aircraft model labels before comparison and persistence', () => {
    expect(normalizeAircraftModel(' aw139 ')).toBe('AW139');
    expect(normalizeAircraftModel('s  76')).toBe('S 76');
    expect(normalizeAircraftModel('')).toBeNull();
    expect(normalizeAircraftModel(null)).toBeNull();
  });

  it('keeps generic rules applicable and rejects rules for aircraft the employee does not fly', () => {
    const awPilot = employee(['AW139']);
    expect(ruleApplies(rule(1, 100, null, 'EMPRESA'), awPilot)).toBe(true);
    expect(ruleApplies(rule(2, 101, 'AW139'), awPilot)).toBe(true);
    expect(ruleApplies(rule(3, 102, 'SK76'), awPilot)).toBe(false);
  });

  it('allows a dual-aircraft crew member to receive both AW139 and SK76 qualification requirements', () => {
    const dualPilot = employee(['AW139', 'SK76']);
    const resolved = resolvedRules(
      [rule(10, 110, 'AW139'), rule(11, 111, 'SK76'), rule(12, 112, null, 'EMPRESA')],
      dualPilot,
    );

    expect(resolved.map((item: any) => item.qualificacao_tipo_id).sort()).toEqual([110, 111, 112]);
  });

  it('prefers an aircraft-specific rule over a generic rule at the same organizational scope', () => {
    const awPilot = employee(['AW139']);
    const generic = rule(20, 120, null);
    const awSpecific = rule(19, 120, 'AW139');
    const resolved = resolvedRules([generic, awSpecific], awPilot);

    expect(resolved).toHaveLength(1);
    expect((resolved[0] as any).aeronave_modelo).toBe('AW139');
    expect((resolved[0] as any).id).toBe(19);
  });

  it('falls back to the generic rule when the aircraft-specific rule does not match', () => {
    const skPilot = employee(['SK76']);
    const generic = rule(30, 130, null);
    const awSpecific = rule(31, 130, 'AW139');
    const resolved = resolvedRules([generic, awSpecific], skPilot);

    expect(resolved).toHaveLength(1);
    expect((resolved[0] as any).id).toBe(30);
    expect((resolved[0] as any).aeronave_modelo).toBeNull();
  });
});
