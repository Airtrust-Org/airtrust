export const TENANT_ID: 6;
export const CMA_CODE: 'CMA';
export const MAX_OPS: number;
export const MANIFEST_KIND: string;
export const ROLLBACK_KIND: string;
export const AUDIT_BASE: string;
export const AUDIT_ORIGIN: string;
export const REASONS: string[];
export const REALIZED_STATUSES: Set<string>;

export interface CmaHistoryRow {
  id: number; qualificacao_id: number; status: string; completion: string;
  old_expiry: string | null; next_expiry: string; old_validity_months: number | null;
  next_validity_months: 6 | 12; age_years: number; reason: 'validity_wrong_by_age' | 'expiry_wrong_legacy_eom';
}
export interface BatchBody { histories: CmaHistoryRow[] }
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
  already_applied: number;
  skipped_not_applied: number;
  conflicts: Array<{ id: number; reason: string }>;
  cas_conflicts: Array<{ id: number }>;
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
export interface CmaClassifyInput {
  id: number; qualificacao_id: number; status: string; completion: string | null; old_expiry: string | null;
  old_validity: number | null; age_years: number | null; employee_in_tenant: boolean;
}
export interface CmaClassification {
  cls: string; operation?: CmaHistoryRow; exact_expiry_12?: string | null;
}

export function auditAction(direction: 'forward' | 'rollback'): string;
export function monthsForAge(age: number): 6 | 12;
export function legacyEndOfMonth(completion: string, months: number): string | null;
export function classifyCmaRow(row: CmaClassifyInput): CmaClassification;
export function sha256Hex(text: string): string;
export function isValidDate(value: unknown): boolean;
export function addMonthsClamped(date: string, months: number): string | null;
export function ageSql(historyAlias: string, employeeAlias: string): string;
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
