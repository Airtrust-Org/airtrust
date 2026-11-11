export const TENANT_ID: 6;
export const MAX_OPS: number;
export const MANIFEST_KIND: string;
export const ROLLBACK_KIND: string;
export const AUDIT_BASE: string;
export const AUDIT_ORIGIN: string;
export const ENTITY: string;

export interface CyclePointerRow { cycle_id: number; matricula_id: number | null; historico_id: number }
export interface BatchBody { cycle_pointers: CyclePointerRow[] }
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
  dangling_total_before: number;
  dangling_total_after: number | null;
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

export function auditAction(direction: 'forward' | 'rollback'): string;
export function sha256Hex(text: string): string;
export function canonicalCyclePointer(row: unknown): CyclePointerRow;
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
export function countDanglingTotal(port: ExecutorPort): number;
export function executeManifest(options: ExecuteOptions): ExecutionReport;
