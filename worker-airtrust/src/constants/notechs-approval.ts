/** PTO Rev.10 V18: 15 NOTECHS scored individually, minimum 6 per item.
 * This validator is pure and never changes signed/historical fichas.
 */
import {
  NOTECHS_CANONICAL_ITEMS,
  canonicalizeNotechsCode,
} from '../../../src/shared/simuladores/notechs-canonical';

export const NOTECHS_APPROVAL_MINIMUM = 6;

export type NotechsScoreRow = {
  codigo?: string | null;
  categoria?: string | null;
  resultado?: string | number | null;
};

export type NotechsApprovalResult = {
  eligible: boolean;
  required: number;
  complete: number;
  passed: number;
  missing: string[];
  unscored: string[];
  belowMinimum: Array<{ codigo: string; nota: number }>;
  invalid: Array<{ codigo: string; valor: string }>;
  duplicate: string[];
  unexpected: string[];
};

/** Rejects unscored/NR/NAO_REALIZADA, duplicate aliases and all scores below 6.
 * A recorded instructor rejection is still permitted; this guards only approval.
 */
export function evaluateNotechsApproval(rows: readonly NotechsScoreRow[]): NotechsApprovalResult {
  const expected = new Set<string>(NOTECHS_CANONICAL_ITEMS.map((item) => item.codigo));
  const seen = new Map<string, NotechsScoreRow>();
  const duplicate = new Set<string>();
  const unexpected = new Set<string>();
  for (const row of rows) {
    if (String(row.categoria || '').trim().toUpperCase() !== 'NOTECHS') continue;
    const code = canonicalizeNotechsCode(row.codigo);
    if (!expected.has(code)) {
      unexpected.add(code || '(sem código)');
      continue;
    }
    if (seen.has(code)) duplicate.add(code);
    else seen.set(code, row);
  }

  const missing: string[] = [];
  const unscored: string[] = [];
  const belowMinimum: Array<{ codigo: string; nota: number }> = [];
  const invalid: Array<{ codigo: string; valor: string }> = [];
  let passed = 0;
  for (const code of expected) {
    const row = seen.get(code);
    if (!row) {
      missing.push(code);
      continue;
    }
    const raw = String(row.resultado ?? '').trim();
    if (!raw || ['NR', 'NAO_REALIZADA', 'NÃO_REALIZADA', 'N/A', 'NA', '-'].includes(raw.toUpperCase())) {
      unscored.push(code);
      continue;
    }
    const score = Number(raw);
    if (!/^(?:10|[1-9])(?:\.0+)?$/.test(raw) || !Number.isFinite(score) || score > 10) {
      invalid.push({ codigo: code, valor: raw });
      continue;
    }
    if (score < NOTECHS_APPROVAL_MINIMUM) belowMinimum.push({ codigo: code, nota: score });
    else passed += 1;
  }
  return {
    eligible: seen.size === expected.size &&
      missing.length === 0 && unscored.length === 0 &&
      belowMinimum.length === 0 && invalid.length === 0 &&
      duplicate.size === 0 && unexpected.size === 0,
    required: expected.size,
    complete: seen.size - unscored.length - invalid.length,
    passed,
    missing,
    unscored,
    belowMinimum,
    invalid,
    duplicate: [...duplicate].sort(),
    unexpected: [...unexpected].sort(),
  };
}
