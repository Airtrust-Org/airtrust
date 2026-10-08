export const TRAINING_COMPLIANCE_SCOPES = [
  'EMPRESA',
  'SETOR',
  'FUNCAO',
  'SETOR_FUNCAO',
  'FUNCIONARIO',
] as const;

export type TrainingComplianceScope = (typeof TRAINING_COMPLIANCE_SCOPES)[number];

export type TrainingComplianceEmployeeShape = {
  id: number;
  setor_id: number | null;
  funcao_id: number | null;
  aeronaves_modelos: string[];
  condicoes_ids: number[];
};

export type TrainingComplianceRuleShape = {
  id: number;
  qualificacao_tipo_id: number;
  escopo: TrainingComplianceScope;
  setor_id: number | null;
  funcao_id: number | null;
  funcionario_id: number | null;
  aeronave_modelo: string | null;
  condicao_id: number | null;
  perfil_competencia?: string | null;
  qualificacao_tipo_codigo?: string | null;
  obrigatoriedade?: string | null;
};

function isSpecializedAvsecRequirement(rule: TrainingComplianceRuleShape): boolean {
  return String(rule.qualificacao_tipo_codigo || '').toUpperCase() === 'D1' &&
    String(rule.perfil_competencia || '').trim().toUpperCase().startsWith('AVSEC_') &&
    String(rule.obrigatoriedade || '').toUpperCase() === 'OBRIGATORIA';
}

function excludeSupersededCorporateAvsec<T extends TrainingComplianceRuleShape>(rules: T[]): T[] {
  if (!rules.some(isSpecializedAvsecRequirement)) return rules;
  return rules.filter((rule) => !(
    String(rule.qualificacao_tipo_codigo || '').toUpperCase() === 'AVSEC_CONSC' &&
    rule.escopo === 'EMPRESA' && !rule.condicao_id && !rule.aeronave_modelo &&
    String(rule.obrigatoriedade || '').toUpperCase() === 'OBRIGATORIA'
  ));
}

export function trainingComplianceRulePriority(rule: TrainingComplianceRuleShape): number {
  const scope =
    rule.escopo === 'FUNCIONARIO'
      ? 5000
      : rule.escopo === 'SETOR_FUNCAO'
        ? 40
        : rule.escopo === 'FUNCAO'
          ? 30
          : rule.escopo === 'SETOR'
            ? 20
            : 10;
  return scope + (rule.condicao_id ? 1000 : 0) + (rule.aeronave_modelo ? 100 : 0);
}

export function trainingComplianceRuleApplies(
  rule: TrainingComplianceRuleShape,
  employee: TrainingComplianceEmployeeShape,
): boolean {
  if (rule.condicao_id && !employee.condicoes_ids.includes(rule.condicao_id)) return false;
  if (rule.aeronave_modelo && !employee.aeronaves_modelos.includes(rule.aeronave_modelo))
    return false;
  if (rule.escopo === 'EMPRESA') return true;
  if (rule.escopo === 'SETOR')
    return Boolean(employee.setor_id && rule.setor_id === employee.setor_id);
  if (rule.escopo === 'FUNCAO')
    return Boolean(employee.funcao_id && rule.funcao_id === employee.funcao_id);
  if (rule.escopo === 'SETOR_FUNCAO') {
    return Boolean(
      employee.setor_id &&
      employee.funcao_id &&
      rule.setor_id === employee.setor_id &&
      rule.funcao_id === employee.funcao_id,
    );
  }
  return rule.funcionario_id === employee.id;
}

function normalizedRuleProfile(rule: TrainingComplianceRuleShape): string | null {
  const profile = String(rule.perfil_competencia || '')
    .trim()
    .toUpperCase();
  return profile || null;
}

function ruleOutranks<T extends TrainingComplianceRuleShape>(candidate: T, previous: T): boolean {
  const candidatePriority = trainingComplianceRulePriority(candidate);
  const previousPriority = trainingComplianceRulePriority(previous);
  return (
    candidatePriority > previousPriority ||
    (candidatePriority === previousPriority && candidate.id > previous.id)
  );
}

export function resolveTrainingComplianceRules<T extends TrainingComplianceRuleShape>(
  rules: T[],
  employee: TrainingComplianceEmployeeShape,
): T[] {
  const byType = new Map<number, T[]>();
  for (const rule of rules) {
    if (!trainingComplianceRuleApplies(rule, employee)) continue;
    const bucket = byType.get(rule.qualificacao_tipo_id) || [];
    bucket.push(rule);
    byType.set(rule.qualificacao_tipo_id, bucket);
  }

  const resolved: T[] = [];
  for (const bucket of byType.values()) {
    let generic: T | null = null;
    const byProfile = new Map<string, T>();
    for (const rule of bucket) {
      const profile = normalizedRuleProfile(rule);
      if (!profile) {
        if (!generic || ruleOutranks(rule, generic)) generic = rule;
        continue;
      }
      const previous = byProfile.get(profile);
      if (!previous || ruleOutranks(rule, previous)) byProfile.set(profile, rule);
    }

    if (byProfile.size === 0) {
      if (generic) resolved.push(generic);
      continue;
    }

    const profileWinners = [...byProfile.values()].filter(
      (profileRule) => !generic || ruleOutranks(profileRule, generic),
    );
    if (profileWinners.length > 0) resolved.push(...profileWinners);
    else if (generic) resolved.push(generic);
  }
  return excludeSupersededCorporateAvsec(resolved);
}

export function withTrainingComplianceRuleImpact<T extends TrainingComplianceRuleShape>(
  visibleRules: T[],
  allRules: T[],
  employees: TrainingComplianceEmployeeShape[],
): Array<T & { impacto: { abrangidas: number; prevalece_para: number } }> {
  const effectiveIds = new Map<string, Set<number>>();
  for (const employee of employees) {
    for (const effective of resolveTrainingComplianceRules(allRules, employee)) {
      const key = `${employee.id}:${effective.qualificacao_tipo_id}`;
      const ids = effectiveIds.get(key) || new Set<number>();
      ids.add(effective.id);
      effectiveIds.set(key, ids);
    }
  }
  return visibleRules.map((rule) => ({
    ...rule,
    impacto: {
      abrangidas: employees.filter((employee) => trainingComplianceRuleApplies(rule, employee))
        .length,
      prevalece_para: employees.filter((employee) =>
        effectiveIds.get(`${employee.id}:${rule.qualificacao_tipo_id}`)?.has(rule.id),
      ).length,
    },
  }));
}

export function trainingComplianceRulePrioritySql(alias = 'tr'): string {
  return `(CASE ${alias}.escopo WHEN 'FUNCIONARIO' THEN 5000 WHEN 'SETOR_FUNCAO' THEN 40 WHEN 'FUNCAO' THEN 30 WHEN 'SETOR' THEN 20 WHEN 'EMPRESA' THEN 10 ELSE 0 END + CASE WHEN ${alias}.condicao_id IS NOT NULL THEN 1000 ELSE 0 END + CASE WHEN NULLIF(TRIM(${alias}.aeronave_modelo),'') IS NOT NULL THEN 100 ELSE 0 END)`;
}

function sqlNormalizedLegacyAircraft(employeeAlias: string): string {
  return `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${employeeAlias}.aeronave,''),' ',''),'/','|'),';','|'),',','|'))`;
}

export function trainingComplianceRuleApplicabilitySql(
  ruleAlias = 'tr',
  employeeAlias = 'f',
): string {
  const legacyAircraft = sqlNormalizedLegacyAircraft(employeeAlias);
  return `(
    (${ruleAlias}.escopo='EMPRESA'
      OR (${ruleAlias}.escopo='SETOR' AND ${ruleAlias}.setor_id=${employeeAlias}.setor_id)
      OR (${ruleAlias}.escopo='FUNCAO' AND ${ruleAlias}.funcao_id=${employeeAlias}.funcao_id)
      OR (${ruleAlias}.escopo='SETOR_FUNCAO' AND ${ruleAlias}.setor_id=${employeeAlias}.setor_id AND ${ruleAlias}.funcao_id=${employeeAlias}.funcao_id)
      OR (${ruleAlias}.escopo='FUNCIONARIO' AND ${ruleAlias}.funcionario_id=${employeeAlias}.id))
    AND (${ruleAlias}.condicao_id IS NULL OR EXISTS (
      SELECT 1 FROM funcionarios_compliance_condicoes fcc
       WHERE fcc.empresa_id=${ruleAlias}.empresa_id
         AND fcc.funcionario_id=${employeeAlias}.id
         AND fcc.condicao_id=${ruleAlias}.condicao_id
         AND fcc.ativo=1 AND fcc.deleted_at IS NULL
         AND (fcc.data_inicio IS NULL OR date(fcc.data_inicio)<=date('now'))
         AND (fcc.data_fim IS NULL OR date(fcc.data_fim)>=date('now'))
    ))
    AND (${ruleAlias}.aeronave_modelo IS NULL OR TRIM(${ruleAlias}.aeronave_modelo)='' OR EXISTS (
      SELECT 1 FROM funcionarios_aeronaves fa JOIN aeronaves a
        ON a.id=fa.aeronave_id AND a.empresa_id=${ruleAlias}.empresa_id AND a.deleted_at IS NULL
       WHERE fa.funcionario_id=${employeeAlias}.id AND fa.empresa_id=${ruleAlias}.empresa_id
         AND fa.deleted_at IS NULL AND COALESCE(fa.ativo,1)=1
         AND (fa.data_inicio IS NULL OR date(fa.data_inicio)<=date('now'))
         AND (fa.data_fim IS NULL OR date(fa.data_fim)>=date('now'))
         AND UPPER(REPLACE(TRIM(a.modelo),' ',''))=UPPER(REPLACE(TRIM(${ruleAlias}.aeronave_modelo),' ',''))
    ) OR (NOT EXISTS (
      SELECT 1 FROM funcionarios_aeronaves fax WHERE fax.funcionario_id=${employeeAlias}.id AND fax.empresa_id=${ruleAlias}.empresa_id AND fax.deleted_at IS NULL AND COALESCE(fax.ativo,1)=1
    ) AND ('|' || ${legacyAircraft} || '|') LIKE '%|' || UPPER(REPLACE(TRIM(${ruleAlias}.aeronave_modelo),' ','')) || '|%'))
  )`;
}

export async function hydrateTrainingComplianceConditions<
  T extends TrainingComplianceEmployeeShape,
>(db: D1Database, empresaId: number, employees: T[]): Promise<T[]> {
  const exists = await db
    .prepare(
      "SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='funcionarios_compliance_condicoes' LIMIT 1",
    )
    .first<{ ok: number }>();
  if (!exists?.ok || employees.length === 0) return employees;
  const { results } = await db
    .prepare(
      `SELECT funcionario_id, condicao_id FROM funcionarios_compliance_condicoes
      WHERE empresa_id=? AND ativo=1 AND deleted_at IS NULL
        AND (data_inicio IS NULL OR date(data_inicio)<=date('now'))
        AND (data_fim IS NULL OR date(data_fim)>=date('now'))`,
    )
    .bind(empresaId)
    .all<{ funcionario_id: number; condicao_id: number }>();
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  for (const row of results || []) {
    const employee = byId.get(Number(row.funcionario_id));
    const conditionId = Number(row.condicao_id);
    if (employee && conditionId > 0 && !employee.condicoes_ids.includes(conditionId))
      employee.condicoes_ids.push(conditionId);
  }
  for (const employee of employees) employee.condicoes_ids.sort((a, b) => a - b);
  return employees;
}

// Categorias documentais/avaliativas permanecem no Histórico de Qualificações,
// mas não criam pendência, cobrança ou renovação de Training Compliance.
// SQLite UPPER não converte cedilha: normalizamos explicitamente ambas as grafias.
export function trainingComplianceEligibleCategorySql(categoryExpr: string): string {
  return `UPPER(REPLACE(REPLACE(TRIM(COALESCE(${categoryExpr}, '')), 'ç', 'C'), 'Ç', 'C')) NOT IN ('CHECK', 'EXAME', 'LICENCA')`;
}

export function trainingComplianceEffectiveRequirementPredicateSql(options?: {
  ruleAlias?: string;
  employeeAlias?: string;
  qualificationExpr?: string;
  empresaExpr?: string;
  requireAutoEnrollment?: boolean;
}): string {
  const tr = options?.ruleAlias || 'tr';
  const f = options?.employeeAlias || 'f';
  const qualification = options?.qualificationExpr || 'qt.id';
  const empresa = options?.empresaExpr || `${f}.empresa_id`;
  const auto = options?.requireAutoEnrollment
    ? ` AND COALESCE(${tr}.auto_matricular_ead, 0) = 1`
    : '';
  // Manter a régua de notificações coerente com resolveTrainingComplianceRules.
  // Evidência antiga não é convertida entre D1 e AVSEC_CONSC.
  const special = 'tr_avsec_special';
  const other = 'tr_avsec_override';
  const specialPriority = trainingComplianceRulePrioritySql(special);
  const otherPriority = trainingComplianceRulePrioritySql(other);
  const corporateNotSuperseded = `NOT (
    UPPER(TRIM(COALESCE(qt.codigo,'')))='AVSEC_CONSC'
    AND ${tr}.escopo='EMPRESA' AND ${tr}.condicao_id IS NULL
    AND NULLIF(TRIM(${tr}.aeronave_modelo),'') IS NULL
    AND EXISTS (
      SELECT 1 FROM treinamento_requisitos ${special}
      JOIN qualificacoes_tipos qt_avsec ON qt_avsec.id=${special}.qualificacao_tipo_id
        AND qt_avsec.empresa_id=${special}.empresa_id AND qt_avsec.deleted_at IS NULL
      WHERE ${special}.empresa_id=${empresa} AND UPPER(TRIM(qt_avsec.codigo))='D1'
        AND ${special}.ativo=1 AND ${special}.deleted_at IS NULL
        AND ${special}.obrigatoriedade='OBRIGATORIA'
        AND SUBSTR(UPPER(TRIM(COALESCE(${special}.perfil_competencia,''))),1,6)='AVSEC_'
        AND (${special}.vigencia_inicio IS NULL OR date(${special}.vigencia_inicio)<=date('now'))
        AND (${special}.vigencia_fim IS NULL OR date(${special}.vigencia_fim)>=date('now'))
        AND ${trainingComplianceRuleApplicabilitySql(special, f)}
        AND NOT EXISTS (
          SELECT 1 FROM treinamento_requisitos ${other}
          WHERE ${other}.empresa_id=${special}.empresa_id
            AND ${other}.qualificacao_tipo_id=${special}.qualificacao_tipo_id
            AND ${other}.ativo=1 AND ${other}.deleted_at IS NULL
            AND (${other}.vigencia_inicio IS NULL OR date(${other}.vigencia_inicio)<=date('now'))
            AND (${other}.vigencia_fim IS NULL OR date(${other}.vigencia_fim)>=date('now'))
            AND (${other}.perfil_competencia IS NULL
                 OR UPPER(TRIM(${other}.perfil_competencia))=UPPER(TRIM(${special}.perfil_competencia)))
            AND ${trainingComplianceRuleApplicabilitySql(other, f)}
            AND (${otherPriority}>${specialPriority} OR
                (${otherPriority}=${specialPriority} AND ${other}.id>${special}.id))
        )
    )
  )`;
  return `COALESCE((SELECT CASE WHEN ${tr}.obrigatoriedade='OBRIGATORIA'${auto} THEN 1 ELSE 0 END
    FROM treinamento_requisitos ${tr}
   WHERE ${tr}.empresa_id=${empresa} AND ${tr}.qualificacao_tipo_id=${qualification}
     AND ${tr}.ativo=1 AND ${tr}.deleted_at IS NULL
      AND ${trainingComplianceEligibleCategorySql('qt.categoria')}
     AND ${corporateNotSuperseded}
     AND (${tr}.vigencia_inicio IS NULL OR date(${tr}.vigencia_inicio)<=date('now'))
     AND (${tr}.vigencia_fim IS NULL OR date(${tr}.vigencia_fim)>=date('now'))
     AND ${trainingComplianceRuleApplicabilitySql(tr, f)}
   ORDER BY ${trainingComplianceRulePrioritySql(tr)} DESC, ${tr}.id DESC LIMIT 1),0)=1`;
}

export function trainingComplianceEvidenceMeetsRequiredModality(
  requiredModality: string | null | undefined,
  evidenceModality: string | null | undefined,
): boolean {
  if (!requiredModality) return true;
  const actual = String(evidenceModality || '')
    .trim()
    .toUpperCase();
  const required = String(requiredModality).trim().toUpperCase();
  if (!actual) return false;
  if (required === 'HIBRIDO') return actual === 'HIBRIDO';
  if (required === 'PRATICO') return actual === 'PRATICO' || actual === 'PRÁTICO';
  return actual === required;
}

const TRAINING_COMPLIANCE_MODALITIES = new Set([
  'EAD',
  'PRESENCIAL',
  'PRATICO',
  'HIBRIDO',
  'DOCUMENTAL',
  'OUTRA',
]);

export function normalizeTrainingComplianceRequiredModality(value: unknown): string | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return TRAINING_COMPLIANCE_MODALITIES.has(normalized) ? normalized : null;
}
