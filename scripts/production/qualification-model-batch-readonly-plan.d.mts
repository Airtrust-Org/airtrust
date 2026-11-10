import type { BatchBody, ExecutionManifest, ExecutorPort } from './lib/qualification-model-batch.mjs';

export const READONLY_CONFIRMATION: string;
export const ORPHAN_HISTORY_IDS: number[];
export const RELINK_MAP: Record<string, string>;
export const SOFT_DELETE_CODES: Set<string>;

export interface BatchInventory {
  types: Array<Record<string, unknown>>;
  linked: Array<Record<string, unknown>>;
  requisitos: Array<Record<string, unknown>>;
  orphans: Array<Record<string, unknown>>;
  targets: Array<Record<string, unknown>>;
  collisions: Array<{ id: number; dup_id: number; dup_qualificacao_id: number; dup_funcionario_id: number }>;
  foreignHistories: Array<Record<string, unknown>>;
  foreignRequisitos: Array<Record<string, unknown>>;
  foreignCourses: Array<Record<string, unknown>>;
  successors: Array<Record<string, unknown>>;
  lmsEnrollments: Array<Record<string, unknown>>;
  lmsCycles: Array<Record<string, unknown>>;
}
export interface BatchPlanSummary {
  plan_sha256: string;
  row_count: number;
  models: { eligible: number; blocked: number; blocked_detail: Array<{ tipo_id: number; code: string; reason: string }>; eligible_codes: string[] };
  linked_histories: { linked_live_total: number; operations: number; new_expiry: number; excluded: Record<string, number>; certificates: Record<string, number> };
  orphans: { relink: number; soft_delete: number; duplicate_of_live_row_soft_delete: number; excluded: Record<string, number>; certificates: Record<string, number> };
  compliance_estimate: Record<string, unknown>;
  writes: number;
  pii_emitted: boolean;
}
export function readInventory(port: ExecutorPort): BatchInventory;
export function buildBatchPlan(
  inventory: BatchInventory,
  options?: { today?: string },
): { manifest: ExecutionManifest; body: BatchBody; summary: BatchPlanSummary };
