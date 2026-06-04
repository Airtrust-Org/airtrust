export type SimuladoresCalendarViewMode = 'monthly' | 'weekly' | 'agenda';

export const SIMULADORES_CALENDAR_VIEW_MODE_STORAGE_KEY = 'simuladores_calendar_view_mode';

export function parseStoredCalendarViewMode(
  value: string | null | undefined,
  fallback: SimuladoresCalendarViewMode = 'monthly',
): SimuladoresCalendarViewMode {
  if (value === 'monthly' || value === 'weekly' || value === 'agenda') return value;
  return fallback;
}
