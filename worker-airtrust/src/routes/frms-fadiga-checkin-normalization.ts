import type { CheckinCreateInput } from './frms-fadiga-checkin.schema';

export function normalizeOptionalBinary(value: boolean | number | null | undefined): 0 | 1 | null {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  return null;
}

/**
 * Resolves the canonical fit-for-duty value from the two accepted fields.
 * Returns { conflict: true } if both fields are present with contradictory values.
 * fit_for_duty is the canonical field; apto is accepted as legacy compatibility only.
 */
export function normalizeFitForDutyPayload(
  input: Pick<CheckinCreateInput, 'fit_for_duty' | 'apto'>,
): { apto: 0 | 1 } | { conflict: true } | { missing: true } {
  const hasApto = typeof input.apto === 'number';
  const hasFitForDuty = typeof input.fit_for_duty === 'boolean';
  if (hasApto && hasFitForDuty) {
    if ((input.apto === 1) !== input.fit_for_duty) return { conflict: true };
    return { apto: input.fit_for_duty ? 1 : 0 };
  }
  if (hasFitForDuty) return { apto: input.fit_for_duty ? 1 : 0 };
  if (hasApto) return { apto: input.apto === 0 ? 0 : 1 };
  return { missing: true };
}

