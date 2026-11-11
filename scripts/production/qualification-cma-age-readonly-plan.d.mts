import type { ExecutionManifest, ExecutorPort } from './lib/qualification-cma-age-batch.mjs';

export const READONLY_CONFIRMATION: string;

export interface CmaInventory {
  types: Array<Record<string, unknown>>;
  histories: Array<Record<string, unknown>>;
}
export interface CmaPlanSummary {
  plan_sha256: string | null;
  row_count: number;
  models: { cma_types_tenant6: number[]; blocked_detail: Array<{ tipo_id: number; empresa_id: number | null; reason: string }> };
  live_rows: number;
  by_status: Record<string, number>;
  by_age_band_at_realization: { under_60: number; age_60_plus: number; age_unknown: number };
  classes: Record<string, number>;
  ids_by_class: Record<string, number[]>;
  corrigible_operations: number;
  corrigible_breakdown: {
    age_60_plus_validity_to_6: number;
    under_60_validity_to_12: number;
    expiry_only_legacy_eom: number;
    validity_null_filled: number;
  };
  birth_date_missing: {
    total: number;
    stored_validity_not_12: number;
    stored_expiry_not_exact_12: number;
    by_stored_validity: Record<string, number>;
  };
  certificates_touched: number;
  writes: number;
  pii_emitted: boolean;
}
export function readInventory(port: ExecutorPort): CmaInventory;
export function buildPlan(inventory: CmaInventory): { manifest: ExecutionManifest | null; summary: CmaPlanSummary };
