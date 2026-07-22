import type { PlanoDeterministico } from './lib/matriz-import-plan.mjs';

export function loadFingerprint(
  dbPath: string,
  empresaId: number,
): { fingerprint: string; [key: string]: unknown };

export function applyPlan(input: {
  dbPath: string;
  plan: PlanoDeterministico;
  importUuid: string;
  dryRun: boolean;
}): { ok: boolean; mode?: string; status?: string; [key: string]: unknown };

export function runApplyCli(argv?: string[]): void;
