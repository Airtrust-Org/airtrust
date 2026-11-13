import { describe, expect, it } from 'vitest';
import { assessExecutedTechnicalItems } from './technical-approval';

describe('PTO Rev.10 §4.2 — executed technical items', () => {
  it('accepts individual grades 6 and 10', () => {
    expect(assessExecutedTechnicalItems([
      { codigo: 'T01', resultado: '6.0' },
      { codigo: 'T02', resultado: 10 },
    ]).eligible).toBe(true);
  });

  it('rejects 5 even when another executed item has 10', () => {
    const result = assessExecutedTechnicalItems([
      { codigo: 'T01', resultado: 5 },
      { codigo: 'T02', resultado: 10 },
    ]);
    expect(result.eligible).toBe(false);
    expect(result.belowMinimum).toEqual([{ codigo: 'T01', nota: 5 }]);
  });

  it.each([null, '', 'NR', 'NAO_REALIZADA', 'N/A', '6.5', 0, 11])(
    'rejects unscored or invalid executed result %s',
    (resultado) => {
      expect(assessExecutedTechnicalItems([{ codigo: 'T01', resultado }]).eligible).toBe(false);
    },
  );

  it('fails closed for zero executed items, duplicate and empty codes', () => {
    expect(assessExecutedTechnicalItems([]).eligible).toBe(false);
    expect(assessExecutedTechnicalItems([
      { codigo: 'T01', resultado: 6 },
      { codigo: 'T01', resultado: 10 },
    ]).eligible).toBe(false);
    expect(assessExecutedTechnicalItems([{ codigo: '', resultado: 6 }]).eligible).toBe(false);
  });
});
