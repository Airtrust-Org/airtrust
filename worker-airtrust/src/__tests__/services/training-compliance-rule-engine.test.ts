import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (path: string): DatabaseSyncType;
};
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

  it('lets a reusable designation exclusion override a broad company requirement', () => {
    const company = { ...base, id: 11, escopo: 'EMPRESA' as const, obrigatoriedade: 'OBRIGATORIA' };
    const designationExclusion = {
      ...base,
      id: 12,
      escopo: 'EMPRESA' as const,
      condicao_id: 55,
      obrigatoriedade: 'NAO_APLICA',
    };
    expect(resolveTrainingComplianceRules([company, designationExclusion], employee)).toEqual([
      designationExclusion,
    ]);
  });

  it('substitui AVSEC Corporativo somente quando o AVSEC específico é requisito efetivo', () => {
    const corporate = {
      ...base, id: 12, qualificacao_tipo_id: 194,
      qualificacao_tipo_codigo: 'AVSEC_CONSC', escopo: 'EMPRESA' as const,
      obrigatoriedade: 'OBRIGATORIA', perfil_competencia: null,
    };
    const tripulante = {
      ...base, id: 13, qualificacao_tipo_id: 22,
      qualificacao_tipo_codigo: 'D1', escopo: 'FUNCAO' as const, funcao_id: 7,
      perfil_competencia: 'AVSEC_TRIPULANTE', obrigatoriedade: 'OBRIGATORIA',
    };
    const irrelevant = { ...tripulante, id: 14, funcao_id: 9 };
    const individualCorporate = {
      ...corporate, id: 15, escopo: 'FUNCIONARIO' as const, funcionario_id: 10,
    };
    expect(resolveTrainingComplianceRules([corporate, tripulante], employee)).toEqual([tripulante]);
    expect(resolveTrainingComplianceRules([corporate, irrelevant], employee)).toEqual([corporate]);
    expect(resolveTrainingComplianceRules([corporate, { ...tripulante, perfil_competencia: null }], employee))
      .toEqual([corporate, { ...tripulante, perfil_competencia: null }]);
    expect(resolveTrainingComplianceRules([corporate, { ...tripulante, obrigatoriedade: 'NAO_APLICA' }], employee))
      .toEqual([corporate, { ...tripulante, obrigatoriedade: 'NAO_APLICA' }]);
    expect(resolveTrainingComplianceRules([corporate, tripulante, individualCorporate], employee))
      .toEqual([individualCorporate, tripulante]);
    expect(resolveTrainingComplianceRules([corporate], employee)).toEqual([corporate]);
  });

  it('usa a mesma substituição AVSEC nas consultas SQL de alertas e renovação', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE funcionarios (id INTEGER, empresa_id INTEGER, setor_id INTEGER, funcao_id INTEGER, aeronave TEXT);
        CREATE TABLE qualificacoes_tipos (id INTEGER, empresa_id INTEGER, codigo TEXT, categoria TEXT, deleted_at TEXT);
        CREATE TABLE treinamento_requisitos (
          id INTEGER, empresa_id INTEGER, qualificacao_tipo_id INTEGER, escopo TEXT,
          setor_id INTEGER, funcao_id INTEGER, funcionario_id INTEGER,
          condicao_id INTEGER, aeronave_modelo TEXT, perfil_competencia TEXT,
          obrigatoriedade TEXT, ativo INTEGER, deleted_at TEXT, vigencia_inicio TEXT,
          vigencia_fim TEXT, auto_matricular_ead INTEGER
        );
        CREATE TABLE funcionarios_compliance_condicoes (
          empresa_id INTEGER, funcionario_id INTEGER, condicao_id INTEGER, ativo INTEGER,
          deleted_at TEXT, data_inicio TEXT, data_fim TEXT
        );
        CREATE TABLE funcionarios_aeronaves (
          empresa_id INTEGER, funcionario_id INTEGER, aeronave_id INTEGER, ativo INTEGER,
          deleted_at TEXT, data_inicio TEXT, data_fim TEXT
        );
        CREATE TABLE aeronaves (id INTEGER, empresa_id INTEGER, modelo TEXT, deleted_at TEXT);
        INSERT INTO funcionarios VALUES (10,1,3,7,''),(11,1,3,8,'');
        INSERT INTO qualificacoes_tipos (id,empresa_id,codigo,categoria)
        VALUES (22,1,'D1','Teórico'),(194,1,'AVSEC_CONSC','Teórico');
        INSERT INTO treinamento_requisitos
          (id,empresa_id,qualificacao_tipo_id,escopo,funcao_id,perfil_competencia,obrigatoriedade,ativo)
        VALUES (1,1,194,'EMPRESA',NULL,NULL,'OBRIGATORIA',1),
               (2,1,22,'FUNCAO',7,'AVSEC_TRIPULANTE','OBRIGATORIA',1);
      `);
      const predicate = trainingComplianceEffectiveRequirementPredicateSql();
      const select = db.prepare(`SELECT f.id,qt.codigo,${predicate} eligible
        FROM funcionarios f CROSS JOIN qualificacoes_tipos qt
        WHERE f.empresa_id=qt.empresa_id ORDER BY f.id,qt.id`);
      expect(select.all().map((row) => [row.id, row.codigo, row.eligible]))
        .toEqual([[10, 'D1', 1], [10, 'AVSEC_CONSC', 0], [11, 'D1', 0], [11, 'AVSEC_CONSC', 1]]);
      db.exec(`INSERT INTO treinamento_requisitos
        (id,empresa_id,qualificacao_tipo_id,escopo,funcionario_id,obrigatoriedade,ativo)
        VALUES (3,1,22,'FUNCIONARIO',10,'NAO_APLICA',1);`);
      expect(select.all().map((row) => [row.id, row.codigo, row.eligible]))
        .toEqual([[10, 'D1', 0], [10, 'AVSEC_CONSC', 1], [11, 'D1', 0], [11, 'AVSEC_CONSC', 1]]);
    } finally {
      db.close();
    }
  });

  it('generates the same condition-aware predicate for renewal and expiry notification paths', () => {
    const sql = trainingComplianceEffectiveRequirementPredicateSql({ requireAutoEnrollment: true });
    expect(sql).toContain('funcionarios_compliance_condicoes');
    expect(sql).toContain('funcionarios_aeronaves');
    expect(sql).toContain("tr.obrigatoriedade='OBRIGATORIA'");
    expect(sql).toContain('tr.auto_matricular_ead');
    expect(sql).toContain('tr.condicao_id');
    expect(sql).toContain("NOT IN ('CHECK', 'EXAME', 'LICENCA', 'VOO', 'TREINAMENTO DE VOO')");
  });
});
