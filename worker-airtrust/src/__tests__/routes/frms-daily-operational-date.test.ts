import { describe, expect, it } from 'vitest';
import { frmsOperationalTodayIso } from '../../lib/frms/operational-date';

describe('FRMS daily fatigue operational day', () => {
  it('uses São Paulo day before and after UTC midnight', () => {
    expect(frmsOperationalTodayIso(new Date('2026-10-29T23:30:00Z'))).toBe('2026-10-29');
    expect(frmsOperationalTodayIso(new Date('2026-10-30T00:30:00Z'))).toBe('2026-10-29');
    expect(frmsOperationalTodayIso(new Date('2026-10-30T03:30:00Z'))).toBe('2026-10-30');
  });

  it('uses São Paulo local calendar date even when UTC is the next day', () => {
    expect(frmsOperationalTodayIso(new Date('2026-01-01T01:30:00Z'))).toBe('2025-12-31');
  });
});
