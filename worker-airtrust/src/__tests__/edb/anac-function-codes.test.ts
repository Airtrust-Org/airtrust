import { describe, expect, it } from 'vitest';
import {
  CURRENT_ANAC_EDB_FUNCTION_CODES,
  isCurrentAnacFunctionCode,
  normalizeAnacFunctionCode,
} from '../../services/edb/anac-function-codes';

describe('eDB ANAC onboard function codes', () => {
  it('keeps the source-library code set explicit and finite', () => {
    expect(CURRENT_ANAC_EDB_FUNCTION_CODES).toEqual([
      'P1', 'P2', 'I1', 'I2', 'O1', 'O2', 'O3', 'V1', 'V2', 'V3', 'C', 'M', 'X', 'D',
    ]);
  });

  it('normalizes only explicit supported codes', () => {
    expect(normalizeAnacFunctionCode(' p1 ')).toBe('P1');
    expect(normalizeAnacFunctionCode('v3')).toBe('V3');
    expect(normalizeAnacFunctionCode(' c ')).toBe('C');
  });

  it('fails closed for blank, operational-role, and unknown values', () => {
    for (const value of ['', 'PIC', 'SIC', 'P3', 'ANAC_SYNCED', 'all']) {
      expect(() => normalizeAnacFunctionCode(value)).toThrow('EDB_INVALID_ANAC_FUNCTION_CODE');
    }
  });

  it('never treats PIC/SIC operational roles as regulatory function codes', () => {
    expect(isCurrentAnacFunctionCode('PIC')).toBe(false);
    expect(isCurrentAnacFunctionCode('SIC')).toBe(false);
    expect(isCurrentAnacFunctionCode(null)).toBe(false);
    expect(isCurrentAnacFunctionCode(undefined)).toBe(false);
    expect(isCurrentAnacFunctionCode(' o2 ')).toBe(true);
  });
});
