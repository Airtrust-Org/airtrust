import { describe, expect, it } from 'vitest';
import {
  CURRENT_ANAC_EDB_FUNCTION_CODES,
  normalizeAnacFunctionCode,
} from '../../repositories/edb/edb-regulatory-crew-repository';

describe('explicit ANAC crew function code', () => {
  it('contains the current eDB onboard-function code set including P2', () => {
    expect(CURRENT_ANAC_EDB_FUNCTION_CODES).toEqual([
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
    ]);
  });

  it('normalizes an explicitly supplied current code', () => {
    expect(normalizeAnacFunctionCode(' p1 ')).toBe('P1');
    expect(normalizeAnacFunctionCode('p2')).toBe('P2');
    expect(normalizeAnacFunctionCode('i2')).toBe('I2');
  });

  it('rejects operational roles instead of guessing a regulatory mapping', () => {
    expect(() => normalizeAnacFunctionCode('PIC')).toThrow('EDB_INVALID_ANAC_FUNCTION_CODE');
    expect(() => normalizeAnacFunctionCode('SIC')).toThrow('EDB_INVALID_ANAC_FUNCTION_CODE');
    expect(() => normalizeAnacFunctionCode('P-1')).toThrow('EDB_INVALID_ANAC_FUNCTION_CODE');
    expect(() => normalizeAnacFunctionCode('')).toThrow('EDB_INVALID_ANAC_FUNCTION_CODE');
  });
});
