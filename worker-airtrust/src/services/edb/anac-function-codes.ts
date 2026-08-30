/**
 * Current onboard-function codes from Portaria 3.220/SPO/SAR art. 17, as
 * amended by Portarias 14.096/SPO/2024 and 15.103/SPO/2024.
 *
 * These regulatory codes are deliberately independent from AirTrust
 * operational roles. In particular, PIC/SIC must never be silently converted.
 */
export const CURRENT_ANAC_EDB_FUNCTION_CODES = [
  'P1',
  'P2',
  'I1',
  'I2',
  'O1',
  'O2',
  'O3',
  'V1',
  'V2',
  'V3',
  'C',
  'M',
  'X',
  'D',
] as const;

export type CurrentAnacEdbFunctionCode =
  (typeof CURRENT_ANAC_EDB_FUNCTION_CODES)[number];

const CURRENT_ANAC_EDB_FUNCTION_CODE_SET = new Set<string>(
  CURRENT_ANAC_EDB_FUNCTION_CODES,
);

export function normalizeAnacFunctionCode(value: string): CurrentAnacEdbFunctionCode {
  const normalized = value.trim().toUpperCase();
  if (!CURRENT_ANAC_EDB_FUNCTION_CODE_SET.has(normalized)) {
    throw new Error('EDB_INVALID_ANAC_FUNCTION_CODE');
  }
  return normalized as CurrentAnacEdbFunctionCode;
}

export function isCurrentAnacFunctionCode(
  value: string | null | undefined,
): value is CurrentAnacEdbFunctionCode {
  return Boolean(value && CURRENT_ANAC_EDB_FUNCTION_CODE_SET.has(value.trim().toUpperCase()));
}
