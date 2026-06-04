import { describe, expect, it } from 'vitest';
import { parseStoredCalendarViewMode } from '../calendarViewState';

describe('calendarViewState', () => {
  it('preserva visualizacao semanal armazenada', () => {
    expect(parseStoredCalendarViewMode('weekly')).toBe('weekly');
  });

  it('preserva visualizacao mensal armazenada', () => {
    expect(parseStoredCalendarViewMode('monthly')).toBe('monthly');
  });

  it('usa fallback seguro para valor invalido', () => {
    expect(parseStoredCalendarViewMode('invalid')).toBe('monthly');
    expect(parseStoredCalendarViewMode(null, 'agenda')).toBe('agenda');
  });
});
