import { describe, expect, it } from 'vitest';
import { aplicarMascaraMatricula, normalizarMatriculaCincoDigitos } from '../mascaras';

describe('employee registration normalization', () => {
  it.each([
    ['300', '00300'],
    ['15', '00015'],
    ['00300', '00300'],
    ['000300', '00300'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizarMatriculaCincoDigitos(input)).toBe(expected);
  });

  it('keeps the input mask limited to five digits', () => {
    expect(aplicarMascaraMatricula('123456')).toBe('12345');
  });
});
