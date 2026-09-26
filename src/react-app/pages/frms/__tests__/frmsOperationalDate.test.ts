import { describe, expect, it } from 'vitest';
import { localTodayIso, resolveCalendarFortnightRange, resolveFrmsOperationalDate } from '../frmsOperationalDate';

describe('FRMS operational date', () => {
  it('preserva a data operacional explícita da URL', () => {
    expect(resolveFrmsOperationalDate('2026-09-25', new Date('2026-09-26T02:00:00Z'))).toBe(
      '2026-09-25',
    );
  });

  it('usa a data local do navegador quando não há data explícita', () => {
    const now = new Date('2026-09-26T02:00:00Z');
    Object.defineProperty(now, 'getTimezoneOffset', { value: () => 180 });
    expect(localTodayIso(now)).toBe('2026-09-25');
    expect(resolveFrmsOperationalDate(null, now)).toBe('2026-09-25');
  });

  it('ignora data inválida da URL', () => {
    const now = new Date('2026-09-25T15:00:00Z');
    Object.defineProperty(now, 'getTimezoneOffset', { value: () => 180 });
    expect(resolveFrmsOperationalDate('25/09/2026', now)).toBe('2026-09-25');
  });

  it('resolve a quinzena civil mesmo quando o dia focal não possui snapshot', () => {
    expect(resolveCalendarFortnightRange('2026-09-15')).toEqual({
      inicio: '2026-09-01',
      fim: '2026-09-15',
    });
    expect(resolveCalendarFortnightRange('2026-09-25')).toEqual({
      inicio: '2026-09-16',
      fim: '2026-09-30',
    });
    expect(resolveCalendarFortnightRange('2026-02-28')).toEqual({
      inicio: '2026-02-16',
      fim: '2026-02-28',
    });
  });

});
