import { describe, expect, it } from 'vitest';
import { normalizeAnacFunctionCode } from '../../repositories/edb/edb-regulatory-crew-repository';

describe('explicit ANAC crew function code', () => {
  it('normalizes an explicitly supplied code without deriving it from operational role', () => {
    expect(normalizeAnacFunctionCode(' p1 ')).toBe('P1');
    expect(normalizeAnacFunctionCode('i2')).toBe('I2');
  });

  it('rejects descriptions and malformed values instead of guessing a code', () => {
    expect(() => normalizeAnacFunctionCode('PIC')).not.toThrow();
    // Syntactically valid tokens remain explicit caller input; semantic mapping
    // to an ANAC code is deliberately not performed by this helper.
    expect(normalizeAnacFunctionCode('PIC')).toBe('PIC');
    expect(() => normalizeAnacFunctionCode('P-1')).toThrow('EDB_INVALID_ANAC_FUNCTION_CODE');
    expect(() => normalizeAnacFunctionCode('')).toThrow('EDB_INVALID_ANAC_FUNCTION_CODE');
    expect(() => normalizeAnacFunctionCode('codigo muito longo')).toThrow(
      'EDB_INVALID_ANAC_FUNCTION_CODE',
    );
  });
});
