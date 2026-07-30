import { describe, expect, it } from 'vitest';
import { isQualificationCheck } from '../isQualificationCheck';

describe('isQualificationCheck', () => {
  it('(1) is_check=1 → check', () => {
    expect(isQualificationCheck({ is_check: 1 })).toBe(true);
  });

  it('(2) is_check=true → check', () => {
    expect(isQualificationCheck({ is_check: true })).toBe(true);
  });

  it('(3) is_check="1" → check (legacy payload)', () => {
    expect(isQualificationCheck({ is_check: '1' })).toBe(true);
  });

  it('(4) is_check=0 → not check', () => {
    expect(isQualificationCheck({ is_check: 0 })).toBe(false);
  });

  it('(5) is_check=false → not check', () => {
    expect(isQualificationCheck({ is_check: false })).toBe(false);
  });

  it('(6) is_check=null → not check (unless categoria=CHECK)', () => {
    expect(isQualificationCheck({ is_check: null })).toBe(false);
  });

  it('(7) is_check=undefined → not check (unless categoria=CHECK)', () => {
    expect(isQualificationCheck({})).toBe(false);
  });

  it('(8) categoria="CHECK" → check', () => {
    expect(isQualificationCheck({ is_check: 0, categoria: 'CHECK' })).toBe(true);
  });

  it('(9) categoria="check" → check (case-insensitive)', () => {
    expect(isQualificationCheck({ is_check: 0, categoria: 'check' })).toBe(true);
  });

  it('(10) categoria="Check" → check (mixed case)', () => {
    expect(isQualificationCheck({ is_check: 0, categoria: 'Check' })).toBe(true);
  });

  it('(11) categoria=" CHECK " → check (trims whitespace)', () => {
    expect(isQualificationCheck({ is_check: 0, categoria: ' CHECK ' })).toBe(true);
  });

  it('(12) categoria="PILOTO" → not check', () => {
    expect(isQualificationCheck({ is_check: 0, categoria: 'PILOTO' })).toBe(false);
  });

  it('(13) categoria=null, is_check=0 → not check', () => {
    expect(isQualificationCheck({ is_check: 0, categoria: null })).toBe(false);
  });

  it('(14) OPC (with is_check=1 or categoria=CHECK) must be check', () => {
    expect(isQualificationCheck({ codigo: 'OPC', is_check: 1 }) as boolean).toBe(true);
    expect(isQualificationCheck({ codigo: 'OPC', categoria: 'CHECK' }) as boolean).toBe(true);
    expect(isQualificationCheck({ codigo: 'OPC' }) as boolean).toBe(false);
  });
});
