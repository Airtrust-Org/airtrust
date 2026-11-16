import type { ReadOnlyD1 } from './lib/frms-checkin-obligation-validation.mjs';
export const TENANT_ID: number;
export const CONFIRMATION: string;
export const INGEST_JOB: string;
export function collectFacts(
  db: ReadOnlyD1,
  input: { tenantId: number; from: string; to: string; today: string },
): Promise<Record<string, unknown>>;
export function main(): Promise<void>;
