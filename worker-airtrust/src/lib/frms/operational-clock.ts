/** Helpers puros de horário usados na projeção matinal do FRMS. */
export function clockToMinutes(value: string | null | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToClock(value: number): string {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function projectSleepStart(wakeTime: string, sleepHours: number): string | null {
  const wake = clockToMinutes(wakeTime);
  if (wake == null || !Number.isFinite(sleepHours) || sleepHours <= 0 || sleepHours > 24) return null;
  return minutesToClock(wake - Math.round(sleepHours * 60));
}
