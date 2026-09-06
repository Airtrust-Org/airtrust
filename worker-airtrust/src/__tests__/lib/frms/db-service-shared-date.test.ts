import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dateOffset, diffDays } from '../../../lib/frms/db-service-shared';

describe('FRMS shared date helpers', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'Europe/Berlin';
  });

  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('offsets ISO calendar days independently of the host timezone', () => {
    expect(dateOffset('2026-08-04', -1)).toBe('2026-08-03');
    expect(dateOffset('2026-08-04', 28)).toBe('2026-09-01');
  });

  it('computes calendar-day differences in UTC', () => {
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
  });
});
