export type OperationalFortnightNumber = 1 | 2;

export type OperationalFortnightWindow = {
  id?: number | null;
  year: number;
  month: number;
  number: OperationalFortnightNumber;
  start_date: string;
  end_date: string;
  source: 'DATABASE' | 'DEFAULT';
};

const OPERATIONAL_FORTNIGHT_PRESETS: Record<
  number,
  Record<string, { start: string; end: string }>
> = {
  2025: {
    '12_1': { start: '2025-12-15', end: '2025-12-29' },
  },
  2026: {
    '1_1': { start: '2025-12-30', end: '2026-01-14' },
    '1_2': { start: '2026-01-15', end: '2026-01-30' },
    '2_1': { start: '2026-01-31', end: '2026-02-14' },
    '2_2': { start: '2026-02-15', end: '2026-02-28' },
    '3_1': { start: '2026-03-01', end: '2026-03-15' },
    '3_2': { start: '2026-03-16', end: '2026-03-31' },
    '4_1': { start: '2026-04-01', end: '2026-04-15' },
    '4_2': { start: '2026-04-16', end: '2026-04-30' },
    '5_1': { start: '2026-05-01', end: '2026-05-16' },
    '5_2': { start: '2026-05-17', end: '2026-05-31' },
    '6_1': { start: '2026-06-01', end: '2026-06-15' },
    '6_2': { start: '2026-06-16', end: '2026-06-30' },
    '7_1': { start: '2026-07-01', end: '2026-07-15' },
    '7_2': { start: '2026-07-16', end: '2026-07-31' },
    '8_1': { start: '2026-08-01', end: '2026-08-16' },
    '8_2': { start: '2026-08-17', end: '2026-08-31' },
    '9_1': { start: '2026-09-01', end: '2026-09-15' },
    '9_2': { start: '2026-09-16', end: '2026-09-30' },
    '10_1': { start: '2026-10-01', end: '2026-10-15' },
    '10_2': { start: '2026-10-16', end: '2026-10-31' },
    '11_1': { start: '2026-11-01', end: '2026-11-15' },
    '11_2': { start: '2026-11-16', end: '2026-11-30' },
    '12_1': { start: '2026-12-01', end: '2026-12-14' },
    '12_2': { start: '2026-12-15', end: '2026-12-29' },
  },
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function getDefaultOperationalFortnightRange(
  year: number,
  month: number,
  number: OperationalFortnightNumber,
): { start: string; end: string } {
  const preset = OPERATIONAL_FORTNIGHT_PRESETS[year]?.[`${month}_${number}`];
  if (preset) return preset;

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstEnd = Math.min(16, lastDay);
  const secondStart = Math.min(firstEnd + 1, lastDay);
  const prefix = `${year}-${pad(month)}`;
  return number === 1
    ? { start: `${prefix}-01`, end: `${prefix}-${pad(firstEnd)}` }
    : { start: `${prefix}-${pad(secondStart)}`, end: `${prefix}-${pad(lastDay)}` };
}
