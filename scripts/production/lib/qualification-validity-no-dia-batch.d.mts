export const TENANT_ID: 6;
export const MAX_OPS: number;
export const OLD_MONTHS: 36;
export const TARGET_MONTHS: 24;
export const MANIFEST_KIND: string;
export const ROLLBACK_KIND: string;
export const AUDIT_BASE: string;
export const KINDS: string[];
export const HISTORY_GROUPS: string[];
export const REALIZED_STATUSES: Set<string>;
export const VALIDITY_MODEL_SCOPE: Array<{ tipo_id: number; code: string; change_model: boolean }>;
export const FLAG_MODEL_SCOPE: Array<{ tipo_id: number; code: string }>;

export type OperationKind = 'model' | 'flag' | 'history';

export interface ModelRow { tipo_id: number; code: string; old_validity: 36; next_validity: 24 }
export interface FlagRow { tipo_id: number; code: string; old_flag: 1; next_flag: 0 }
export interface HistoryRow {
  id: number; group: 'validity' | 'flag'; qualificacao_id: number; model_code: string; status: string; completion: string;
  old_expiry: string | null; next_expiry: string; old_validity_months: number | null;
  next_validity_months: number | null; validity_used: number;
}
export interface BatchBody { models: ModelRow[]; flags: FlagRow[]; histories: HistoryRow[] }
export interface ExecutionManifest extends BatchBody {
  kind: string; empresa_id: number; row_count: number; plan_sha256: string; source_sha: string | null;
}
export interface RollbackManifest {
  kind: string; empresa_id: number; row_count: number; source_sha: string | null;
  forward_plan_sha256: string; rollback_plan_sha256: string; forward: ExecutionManifest;
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
  pending_by_kind: Record<OperationKind, number>;
  already_applied: number;
  skipped_not_applied: number;
  conflicts: Array<{ kind: OperationKind; id: number; reason: string }>;
  cas_conflicts: Array<{ kind: OperationKind; id: number }>;
  changed: number;
  writes_attempted: number;
  postconditions_verified: boolean;
}
export interface ExecuteOptions {
  port: ExecutorPort;
  manifest: ExecutionManifest | RollbackManifest;
  direction?: 'forward' | 'rollback';
  apply?: boolean;
  expectedPlanHash: string;
  expectedCount: number;
  actor?: string;
  sourceSha?: string;
}
export interface HashAndCount { expectedPlanHash: string; expectedCount: number }

export function auditAction(kind: OperationKind, direction: 'forward' | 'rollback'): string;
export function sha256Hex(text: string): string;
export function isValidDate(value: unknown): boolean;
export function addMonthsClamped(date: string, months: number, endOfMonth?: boolean): string | null;
export function hashBody(body: BatchBody): string;
export function countOps(body: BatchBody): number;
export function buildExecutionManifest(
  plan: BatchBody | { manifest: BatchBody },
  options?: { sourceSha?: string | null },
): ExecutionManifest;
export function validateManifest(
  manifest: unknown,
  options: HashAndCount,
): { body: BatchBody; planSha256: string; sourceSha: string | null; total: number };
export function buildRollbackManifest(forwardManifest: unknown, options: HashAndCount): RollbackManifest;
export function validateRollbackManifest(
  manifest: unknown,
  options: HashAndCount,
): { body: BatchBody; planSha256: string; forwardPlanSha256: string; sourceSha: string | null; total: number };
export function executeManifest(options: ExecuteOptions): ExecutionReport;
