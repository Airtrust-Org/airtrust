/**
 * AirTrust FRMS IOGP — compliance builder from canonical rolling accruals.
 *
 * Builds ComplianceEvaluation[] for the IOGP shadow pipeline from the
 * canonical AcumuloRollingResult already computed by recalcularPipeline().
 *
 * Design decisions:
 * - Uses the IOGP 690-2 §17C.2 limits (Table 17-1) exclusively. ANAC limits
 *   are evaluated separately by the compliance-policy core for different windows
 *   and are NOT mixed here.
 * - If an accrual window is missing (undefined / null), the evaluation returns
 *   UNKNOWN — never 0 by absence. UNKNOWN prevents automatic approval but does
 *   not itself trigger a violation.
 * - The returned array does NOT modify the canonical operational decision.
 *   Callers must treat it as shadow-only evidence.
 */

import {
  buildIogp6902CoreCandidates,
  evaluateResolvedLimit,
  resolveMostRestrictiveLimit,
  type ComplianceEvaluation,
} from './compliance-policy';

/** Minimal accrual shape needed by this builder (subset of AcumuloRollingResult). */
export interface IogpAccrualInput {
  /** Minutes flown in current duty day (hv_dia_min). May be null if not yet computed. */
  hv_dia_min: number | null | undefined;
  /** Rolling 7-day flight hours in minutes (hv_7_dias_min). */
  hv_7_dias_min: number | null | undefined;
  /** Rolling 28-day flight hours in minutes (hv_28_dias_min). */
  hv_28_dias_min: number | null | undefined;
  /** Rolling 365-day flight hours in minutes (hv_365_dias_min). */
  hv_365_dias_min: number | null | undefined;
}

/**
 * Builds IOGP 690-2 §17C.2 compliance evaluations from canonical rolling accruals.
 *
 * Returned array order: [1D, 7D, 28D, 365D] — always length 4.
 *
 * Each evaluation:
 * - COMPLIANT  → accrual is within limit
 * - VIOLATION  → accrual exceeds limit
 * - UNKNOWN    → accrual value is absent/null/undefined
 */
export function buildIogpComplianceEvaluations(accrual: IogpAccrualInput): ComplianceEvaluation[] {
  const candidates = buildIogp6902CoreCandidates();

  const windows: Array<{
    metric: Parameters<typeof resolveMostRestrictiveLimit>[0];
    actualMin: number | null | undefined;
  }> = [
    {
      metric: 'FLIGHT_TIME_1D_CONSECUTIVE_MIN',
      actualMin: accrual.hv_dia_min,
    },
    {
      metric: 'FLIGHT_TIME_7D_ROLLING_MIN',
      actualMin: accrual.hv_7_dias_min,
    },
    {
      metric: 'FLIGHT_TIME_28D_ROLLING_MIN',
      actualMin: accrual.hv_28_dias_min,
    },
    {
      metric: 'FLIGHT_TIME_365D_ROLLING_MIN',
      actualMin: accrual.hv_365_dias_min,
    },
  ];

  return windows.map(({ metric, actualMin }) => {
    const relevant = candidates.filter((c) => c.metric === metric);
    const resolved = resolveMostRestrictiveLimit(metric, 'MAX', relevant);
    return evaluateResolvedLimit(actualMin, resolved);
  });
}
