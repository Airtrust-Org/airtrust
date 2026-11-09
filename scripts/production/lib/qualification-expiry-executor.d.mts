export const TENANT_ID: 6;
export const MAX_ROWS: number;
export const AUDIT_ACTION_APPLY: string;
export const AUDIT_ACTION_ROLLBACK: string;
export const MANIFEST_KIND: string;
export const ROLLBACK_KIND: string;

export interface ExecutionRow {
  id: number;
  empresa_id: number;
  qualificacao_id: number;
  expected_model_code: string;
  expected_status: string;
  expected_completion_date: string;
  old_expiry: string | null;
  next_expiry: string;
  old_validity_months: number | null;
  next_validity_months: number;
  model_end_of_month: number;
  expected_certificate_id: null;
}
export interface ExecutionManifest {
  kind: string;
  empresa_id: number;
  row_count: number;
  plan_sha256: string;
  source_sha: string | null;
  rows: ExecutionRow[];
}
export interface RollbackManifest {
  kind: string;
  empresa_id: number;
  row_count: number;
  source_sha: string | null;
  forward_plan_sha256: string;
  rollback_plan_sha256: string;
  rows: Array<Record<string, unknown>>;
}
export interface ExecutorPort {
  query(sql: string): Array<Record<string, unknown>>;
  exec(sql: string): void;
}
export interface ExecutionReport {
  tenant: number;
  direction: 'forward' | 'rollback';
  mode: 'apply' | 'dry-run';
  plan_sha256: string;
  row_count: number;
  pending: number;
  already_applied: number;
  skipped_not_applied: number;
  conflicts: Array<{ id: number; reason: string }>;
  cas_conflicts: number[];
  changed: number;
  writes_attempted: number;
  postconditions_verified: boolean;
}
export interface ExecuteOptions {
  port: ExecutorPort;
  manifest: unknown;
  direction?: 'forward' | 'rollback';
  apply?: boolean;
  expectedPlanHash: string;
  expectedCount: number;
  actor?: string;
  sourceSha?: string;
}
export interface HashAndCount { expectedPlanHash: string; expectedCount: number }

export function sha256Hex(text: string): string;
export function hashRows(rows: unknown[]): string;
export function canonicalRow(row: unknown): ExecutionRow;
export function buildExecutionManifest(
  plan: unknown,
  options?: { sourceSha?: string | null },
): ExecutionManifest;
export function validateManifest(
  manifest: unknown,
  options: HashAndCount,
): { rows: ExecutionRow[]; planSha256: string; sourceSha: string | null };
export function buildRollbackManifest(forwardManifest: unknown, options: HashAndCount): RollbackManifest;
export function validateRollbackManifest(manifest: unknown, options: HashAndCount): {
  ops: Array<Record<string, unknown>>;
  planSha256: string;
  forwardPlanSha256: string;
  sourceSha: string | null;
};
export function executeManifest(options: ExecuteOptions): ExecutionReport;
