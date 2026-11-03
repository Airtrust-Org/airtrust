import { describe, expect, it } from 'vitest';
import { isAtOrAfterFrmsPresentation } from '../../lib/frms/checkin-submission-timing';

describe('FRMS check-in chronology in IANA America/Sao_Paulo', () => {
  it('accepts before presentation but rejects exact and later minute', () => {
    expect(isAtOrAfterFrmsPresentation(new Date('2026-10-16T09:59:00Z'), '07:00')).toBe(false);
    expect(isAtOrAfterFrmsPresentation(new Date('2026-10-16T10:00:00Z'), '07:00')).toBe(true);
    expect(isAtOrAfterFrmsPresentation(new Date('2026-10-16T10:15:00Z'), '07:00')).toBe(true);
  });

  it('uses local base clock instead of UTC, including boundaries around midnight', () => {
    expect(isAtOrAfterFrmsPresentation(new Date('2026-11-03T02:55:00Z'), '23:59')).toBe(false);
    expect(isAtOrAfterFrmsPresentation(new Date('2026-11-03T02:59:00Z'), '23:59')).toBe(true);
    expect(isAtOrAfterFrmsPresentation(new Date('2026-11-03T03:01:00Z'), '00:00')).toBe(true);
  });

  it('fails closed for absent/invalid schedule or invalid server timestamp', () => {
    expect(isAtOrAfterFrmsPresentation(new Date('2026-10-16T09:00:00Z'), null)).toBe(true);
    expect(isAtOrAfterFrmsPresentation(new Date('2026-10-16T09:00:00Z'), '25:15')).toBe(true);
    expect(isAtOrAfterFrmsPresentation(new Date(NaN), '07:00')).toBe(true);
  });
});
