export type CanonicalSessionIdentity = {
  raw: string;
  equipment: string | null;
  program: string | null;
  session_position: number | null;
  session_total: number | null;
  cycle: number | null;
  check: boolean;
};

export type CurriculumCycleModel = {
  id: number;
  canonical_code: string;
  duration_minutes: number;
  name: string;
  qualification_type_id: number | null;
};

export type SelectedCurriculumCycle = {
  cycle: number | null;
  source: 'SINGLE_CYCLE' | 'HINT' | 'NEXT_AFTER_LAST_COMPLETED' | 'FIRST_AVAILABLE';
  models: CurriculumCycleModel[];
};

function normalized(value: string): string {
  return String(value || '').trim().toUpperCase();
}

/**
 * O parser usa apenas a identidade canônica versionada da matriz, nunca o
 * nome exibido da sessão. Ele aceita prefixos de equipamento genéricos e
 * extrai o contrato N/T + Cn quando presente.
 */
export function parseCanonicalSessionIdentity(value: string): CanonicalSessionIdentity {
  const raw = String(value || '').trim();
  const code = normalized(raw);
  const cycleMatch = code.match(/(?:^|-)C(\d+)(?:-|$)/);
  const fractionMatch = code.match(/-(\d{1,2})\/(\d{1,2})(?:-|$)/);
  const tokens = code.split('-').filter(Boolean);
  const programIndex = tokens.findIndex((token) => ['I', 'P', 'S'].includes(token));

  return {
    raw,
    equipment: programIndex > 0 ? tokens.slice(0, programIndex).join('-') : tokens[0] || null,
    program: programIndex >= 0 ? tokens[programIndex] : null,
    session_position: fractionMatch ? Number(fractionMatch[1]) : null,
    session_total: fractionMatch ? Number(fractionMatch[2]) : null,
    cycle: cycleMatch ? Number(cycleMatch[1]) : null,
    check: /(?:^|-)CHECK(?:-|$)/.test(code),
  };
}

function sortedModels(models: CurriculumCycleModel[]): CurriculumCycleModel[] {
  return [...models].sort((left, right) => {
    const a = parseCanonicalSessionIdentity(left.canonical_code);
    const b = parseCanonicalSessionIdentity(right.canonical_code);
    return (
      Number(a.session_position ?? 999999) - Number(b.session_position ?? 999999) ||
      left.id - right.id
    );
  });
}

export function groupCurriculumModelsByCycle(
  models: CurriculumCycleModel[],
): Map<number | null, CurriculumCycleModel[]> {
  const grouped = new Map<number | null, CurriculumCycleModel[]>();
  for (const model of models) {
    const cycle = parseCanonicalSessionIdentity(model.canonical_code).cycle;
    grouped.set(cycle, [...(grouped.get(cycle) || []), model]);
  }
  for (const [cycle, values] of grouped.entries()) grouped.set(cycle, sortedModels(values));
  return grouped;
}

function validateCycle(models: CurriculumCycleModel[]): void {
  if (models.length === 0) throw new Error('Ciclo curricular vazio');
  const identities = models.map((model) => parseCanonicalSessionIdentity(model.canonical_code));
  const totals = new Set(
    identities.map((item) => item.session_total).filter((value): value is number => value != null),
  );
  if (totals.size > 1) throw new Error('Ciclo curricular com denominadores divergentes');
  const expected = totals.values().next().value as number | undefined;
  if (expected && models.length !== expected) {
    throw new Error(`Ciclo curricular incompleto: esperado ${expected}, encontrado ${models.length}`);
  }
  if (expected) {
    const positions = identities.map((item) => item.session_position).sort((a, b) => Number(a) - Number(b));
    for (let position = 1; position <= expected; position += 1) {
      if (positions[position - 1] !== position) {
        throw new Error(`Ciclo curricular sem a sessão ${position}/${expected}`);
      }
    }
  }
}

export function nextCycleNumber(lastCycle: number, availableCycles: number[]): number {
  const sorted = [...new Set(availableCycles.filter((value) => Number.isInteger(value) && value > 0))].sort(
    (a, b) => a - b,
  );
  if (sorted.length === 0) throw new Error('Nenhum ciclo recorrente disponível');
  const index = sorted.indexOf(lastCycle);
  if (index === -1) return sorted[0];
  return sorted[(index + 1) % sorted.length];
}

/**
 * Seleciona somente o ciclo que o tripulante deve executar. Isso impede que
 * as três rotações C1/C2/C3 de um currículo recorrente sejam somadas como se
 * fossem um único treinamento de 12 sessões.
 *
 * cycleHint tem precedência para necessidades derivadas (por exemplo, um
 * Semestral relacionado ao Periódico C2). Para um novo Periódico, o ciclo
 * seguinte ao último concluído é escolhido.
 */
export function selectCurriculumCycle(params: {
  models: CurriculumCycleModel[];
  cycle_hint?: number | null;
  last_completed_canonical_code?: string | null;
}): SelectedCurriculumCycle {
  if (params.models.length === 0) throw new Error('Currículo sem modelos');
  const grouped = groupCurriculumModelsByCycle(params.models);
  const numberedCycles = [...grouped.keys()]
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);

  if (numberedCycles.length === 0) {
    const models = grouped.get(null) || [];
    validateCycle(models);
    return { cycle: null, source: 'SINGLE_CYCLE', models };
  }

  let selectedCycle: number;
  let source: SelectedCurriculumCycle['source'];
  if (params.cycle_hint && numberedCycles.includes(params.cycle_hint)) {
    selectedCycle = params.cycle_hint;
    source = 'HINT';
  } else {
    const last = params.last_completed_canonical_code
      ? parseCanonicalSessionIdentity(params.last_completed_canonical_code).cycle
      : null;
    if (last != null) {
      selectedCycle = nextCycleNumber(last, numberedCycles);
      source = 'NEXT_AFTER_LAST_COMPLETED';
    } else {
      selectedCycle = numberedCycles[0];
      source = 'FIRST_AVAILABLE';
    }
  }

  const models = grouped.get(selectedCycle) || [];
  validateCycle(models);
  return { cycle: selectedCycle, source, models };
}
