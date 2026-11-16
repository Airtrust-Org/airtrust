import type { DayEvaluation, ObligationLike, ReadOnlyD1 } from './lib/frms-checkin-obligation-validation.mjs';
export const TENANT_ID: number;
export const CONFIRMATION: string;
export function listDates(from: string, to: string): string[];
export function runValidation(input: {
  db: ReadOnlyD1;
  loadDailyCheckinObligations: (db: never, empresaId: number, date: string) => Promise<Map<number, ObligationLike>>;
  from: string; to: string; tenantId?: number; onProgress?: (date: string) => void;
}): Promise<{
  summary: ReturnType<typeof import('./lib/frms-checkin-obligation-validation.mjs').summarize>;
  days: DayEvaluation[]; crewSize: number;
}>;
export function main(): Promise<void>;
