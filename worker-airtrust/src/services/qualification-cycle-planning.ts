export type QualificationCycleRule = {
  id?: string | number;
  source_qualification_type_id: number;
  target_qualification_type_id: number;
  interval_months: number;
  effective_from: string;
  effective_until?: string | null;
  active?: boolean;
  label?: string | null;
};

export type QualificationCycleRequirement = {
  rule_id: string | number | null;
  source_qualification_type_id: number;
  target_qualification_type_id: number;
  source_completion_date: string;
  due_date: string;
  interval_months: number;
  label: string | null;
};

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function assertPositiveQualificationId(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} deve ser um inteiro positivo`);
  }
}

function assertRule(rule: QualificationCycleRule): void {
  assertPositiveQualificationId(
    rule.source_qualification_type_id,
    'source_qualification_type_id',
  );
  assertPositiveQualificationId(
    rule.target_qualification_type_id,
    'target_qualification_type_id',
  );
  if (!Number.isInteger(rule.interval_months) || rule.interval_months <= 0 || rule.interval_months > 60) {
    throw new Error('interval_months deve estar entre 1 e 60');
  }
  if (!isIsoDate(rule.effective_from)) {
    throw new Error('effective_from deve ser uma data ISO válida');
  }
  if (rule.effective_until && !isIsoDate(rule.effective_until)) {
    throw new Error('effective_until deve ser uma data ISO válida');
  }
  if (rule.effective_until && rule.effective_until < rule.effective_from) {
    throw new Error('effective_until não pode ser anterior a effective_from');
  }
}

/**
 * Soma meses preservando o dia sempre que possível. Quando o mês de destino
 * não possui o mesmo dia (ex.: 31/01 + 1 mês), usa o último dia do mês.
 */
export function addMonthsIso(value: string, months: number): string {
  if (!isIsoDate(value)) throw new Error(`Data ISO inválida: ${value}`);
  if (!Number.isInteger(months)) throw new Error('months deve ser inteiro');

  const [year, month, day] = value.split('-').map(Number);
  const absoluteMonth = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonthIndex = ((absoluteMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return new Date(Date.UTC(targetYear, targetMonthIndex, targetDay)).toISOString().slice(0, 10);
}

export function isCycleRuleEffectiveOn(
  rule: QualificationCycleRule,
  completionDate: string,
): boolean {
  assertRule(rule);
  if (!isIsoDate(completionDate)) throw new Error('completionDate deve ser uma data ISO válida');
  if (rule.active === false) return false;
  if (completionDate < rule.effective_from) return false;
  if (rule.effective_until && completionDate > rule.effective_until) return false;
  return true;
}

/**
 * Gera a próxima obrigação APENAS para conclusões cobertas pela vigência da
 * regra. Isso preserva integralmente treinamentos históricos anteriores à
 * implantação e evita reinterpretar retroativamente registros já concluídos.
 */
export function buildCycleRequirement(params: {
  rule: QualificationCycleRule;
  source_completion_date: string;
}): QualificationCycleRequirement | null {
  const { rule, source_completion_date } = params;
  if (!isCycleRuleEffectiveOn(rule, source_completion_date)) return null;

  return {
    rule_id: rule.id ?? null,
    source_qualification_type_id: rule.source_qualification_type_id,
    target_qualification_type_id: rule.target_qualification_type_id,
    source_completion_date,
    due_date: addMonthsIso(source_completion_date, rule.interval_months),
    interval_months: rule.interval_months,
    label: rule.label ?? null,
  };
}

/**
 * Resolve a regra vigente mais específica/recente para um tipo de qualificação.
 * A lista pode vir de banco, feature config ou fixture de teste; o serviço não
 * hardcodeia AW139, SK76, Periódico ou Semestral.
 */
export function resolveCycleRequirement(params: {
  rules: QualificationCycleRule[];
  source_qualification_type_id: number;
  source_completion_date: string;
}): QualificationCycleRequirement | null {
  assertPositiveQualificationId(
    params.source_qualification_type_id,
    'source_qualification_type_id',
  );
  if (!isIsoDate(params.source_completion_date)) {
    throw new Error('source_completion_date deve ser uma data ISO válida');
  }

  const applicable = params.rules
    .filter(
      (rule) =>
        Number(rule.source_qualification_type_id) === params.source_qualification_type_id &&
        isCycleRuleEffectiveOn(rule, params.source_completion_date),
    )
    .sort(
      (left, right) =>
        right.effective_from.localeCompare(left.effective_from) ||
        Number(right.id || 0) - Number(left.id || 0),
    );

  const selected = applicable[0];
  return selected
    ? buildCycleRequirement({
        rule: selected,
        source_completion_date: params.source_completion_date,
      })
    : null;
}
