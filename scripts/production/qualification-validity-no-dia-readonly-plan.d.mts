import type { BatchBody, ExecutionManifest, ExecutorPort } from './lib/qualification-validity-no-dia-batch.mjs';

export const READONLY_CONFIRMATION: string;

export interface ValidityInventory {
  types: Array<Record<string, unknown>>;
  foreign: Array<Record<string, unknown>>;
  foreignRequisitos: Array<Record<string, unknown>>;
  histories: Array<Record<string, unknown>>;
}
export interface ValidityPlanSummary {
  plan_sha256: string;
  row_count: number;
  models: {
    validity_36_to_24: string[];
    flag_1_to_0: string[];
    blocked: number;
    blocked_detail: Array<{ tipo_id: number; code: string; group: string; reason: string }>;
  };
  histories: {
    operations: number;
    validity_group: number;
    flag_group: number;
    excluded: { validity: Record<string, number>; flag: Record<string, number> };
    by_model: Record<string, { group: string; live_rows: number; operations: number }>;
    stale_36m_expiry_with_null_validity: {
      rows_with_null_validity_and_36m_expiry: number;
      by_model: Record<string, number>;
    };
  };
  certificates: {
    operations_with_certificate_id: number;
    operations_with_uploaded_file: number;
    operations_with_any_certificate: number;
    by_model: Record<string, number>;
    reissued: number;
    note: string;
  };
  compliance_estimate: {
    today: string;
    transitions: Record<string, number>;
    expiry_moves_earlier: number;
    expiry_moves_later: number;
  };
  writes: number;
  pii_emitted: boolean;
}
export function readInventory(port: ExecutorPort): ValidityInventory;
export function buildPlan(
  inventory: ValidityInventory,
  options?: { today?: string },
): { manifest: ExecutionManifest; summary: ValidityPlanSummary };
export type { BatchBody };
