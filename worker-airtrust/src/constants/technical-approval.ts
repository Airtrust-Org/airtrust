/** PTO Rev.10 V18 §4.2: every EXECUTED technical item needs its own score 1..10,
 * and a score below 6 cannot be offset by another item or an average.
 *
 * Deliberately pure: callers must establish, from a controlled curricular source,
 * which items were actually executed. Never infer execution from an empty result.
 * This helper does not mutate signed or historical fichas.
 */
export type ExecutedTechnicalItem = {
  codigo: string;
  resultado: string | number | null | undefined;
};

export type TechnicalApprovalAssessment = {
  eligible: boolean;
  evaluated: number;
  invalid: string[];
  belowMinimum: Array<{ codigo: string; nota: number }>;
};

export function assessExecutedTechnicalItems(
  items: readonly ExecutedTechnicalItem[],
): TechnicalApprovalAssessment {
  const invalid: string[] = [];
  const belowMinimum: Array<{ codigo: string; nota: number }> = [];
  const seen = new Set<string>();
  for (const item of items) {
    const codigo = String(item.codigo || '').trim();
    const raw = String(item.resultado ?? '').trim();
    // Duplicated or unidentified executed items are ambiguous, hence fail closed.
    if (!codigo || seen.has(codigo) || !/^(?:10|[1-9])(?:\.0+)?$/.test(raw)) {
      invalid.push(codigo || '(sem código)');
      continue;
    }
    seen.add(codigo);
    const nota = Number(raw);
    if (nota < 6) belowMinimum.push({ codigo, nota });
  }
  // An empty executed-item set cannot establish curricular completeness.
  return {
    eligible: items.length > 0 && invalid.length === 0 && belowMinimum.length === 0,
    evaluated: items.length,
    invalid,
    belowMinimum,
  };
}
