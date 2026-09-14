import { describe, expect, it } from 'vitest';
import {
  curriculumReferenceYear,
  resolveAnnualCurriculumCycle,
} from '../../services/simulator-curriculum-cycles';

describe('annual simulator curriculum cycle resolution', () => {
  it('uses 2026=C2, 2027=C3 and 2028=C1, then repeats', () => {
    const resolve = (referenceYear: number) =>
      resolveAnnualCurriculumCycle({
        referenceYear,
        baseYear: 2026,
        baseCycle: 2,
        totalCycles: 3,
      });

    expect(resolve(2026)).toBe(2);
    expect(resolve(2027)).toBe(3);
    expect(resolve(2028)).toBe(1);
    expect(resolve(2029)).toBe(2);
    expect(resolve(2030)).toBe(3);
    expect(resolve(2031)).toBe(1);
  });

  it('resolves the year before the base year without modulo drift', () => {
    expect(
      resolveAnnualCurriculumCycle({
        referenceYear: 2025,
        baseYear: 2026,
        baseCycle: 2,
        totalCycles: 3,
      }),
    ).toBe(1);
  });

  it('extracts a safe reference year from ISO dates and explicit year values', () => {
    expect(curriculumReferenceYear('2027-03-15')).toBe(2027);
    expect(curriculumReferenceYear(2028)).toBe(2028);
    expect(curriculumReferenceYear('invalid')).toBeNull();
  });
});
