import type { ExecutionManifest, ExecutorPort } from './lib/lms-cycle-dangling-pointer-batch.mjs';

export const READONLY_CONFIRMATION: string;
export const READONLY_CONFIRMATION_ENV: string;

export interface CycleDanglingInventory {
  cycles: Array<Record<string, unknown>>;
}
export interface CycleDanglingPlanSummary {
  plan_sha256: string | null;
  row_count: number;
  count_cap: number;
  active_cycles_with_pointer: number;
  classes: Record<string, number>;
  ids_by_class: Record<string, number[]>;
  corrigible_cycle_ids: number[];
  corrigible_without_matricula: number;
  histories_restored: 0;
  writes: 0;
  pii_emitted: false;
}
export function readInventory(port: ExecutorPort): CycleDanglingInventory;
export function buildPlan(inventory: CycleDanglingInventory): { manifest: ExecutionManifest | null; summary: CycleDanglingPlanSummary };
