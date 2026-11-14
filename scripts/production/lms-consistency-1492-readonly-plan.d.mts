import type { ExecutionManifest, ExecutorPort } from './lib/lms-consistency-1492-batch.mjs';

export const READONLY_CONFIRMATION: string;

export interface Lms1492Inventory {
  matriculas: Array<Record<string, unknown>>;
  cycles: Array<Record<string, unknown>>;
  historicos: Array<Record<string, unknown>>;
  group1Listed: number[];
  group2Listed: number[];
}
export interface Lms1492PlanSummary {
  plan_sha256: string | null;
  row_count: number;
  groups: {
    group1: { matriculas: number; cycle_ops: number; link_ops: number; ops: number };
    group2: { matriculas: number; pointer_ops: number; cycle_pointer_ops: number; ops: number };
  } | null;
  blocked: number;
  blocked_detail: Array<{ group: number; matricula_id: number; reason: string }>;
  fail_closed: boolean;
  cross_check_2161: Record<string, unknown>;
  excluded_groups: { group3: string; group4: string };
  writes: 0;
  pii_emitted: false;
}
export function readInventory(port: ExecutorPort): Lms1492Inventory;
export function buildPlan(inventory: Lms1492Inventory): { manifest: ExecutionManifest | null; summary: Lms1492PlanSummary };
