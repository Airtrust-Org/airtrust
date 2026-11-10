export const TENANT_ID: 6;
export const MAX_OPS: number;
export const MANIFEST_KIND: string;
export const ROLLBACK_KIND: string;
export const AUDIT_BASE: string;
export const KINDS: string[];
export const GROUP_OF: Record<string, number>;
export const ORIGIN: Record<number, string>;
export const GROUP1_MATRICULAS: number[];
export const GROUP2_FUNCIONARIO_ID: number;
export const GROUP2_POINTERS: Array<{ matricula_id: number; historico_id: number }>;
export const GROUP1_HISTORY_WINDOW: { from: string; to: string };
export const REALIZED: Set<string>;

export type OperationKind = 'cycle' | 'link' | 'pointer' | 'cptr';

export interface CycleRow {
  cycle_id: number; matricula_id: number; historico_id: number; funcionario_id: number;
  old_status: 'EM_ANDAMENTO'; next_status: 'CONCLUIDO'; old_data_conclusao: string | null; next_data_conclusao: string;
  old_progresso_pct: number; next_progresso_pct: number; old_historico_id: number | null;
}
export interface LinkRow { historico_id: number; matricula_id: number; cycle_id: number }
export interface PointerRow { matricula_id: number; historico_id: number; funcionario_id: number }
export interface CyclePointerRow { cycle_id: number; matricula_id: number; historico_id: number }
export interface BatchBody { cycles: CycleRow[]; links: LinkRow[]; pointers: PointerRow[]; cycle_pointers: CyclePointerRow[] }
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
export interface GroupCounts { group1: number; group2: number }
export interface ExecutionReport {
  tenant: number;
  direction: 'forward' | 'rollback';
  mode: 'apply' | 'dry-run';
  plan_sha256: string;
  row_count: number;
  ops_by_group: GroupCounts;
  pending: number;
  pending_by_kind: Record<OperationKind, number>;
  pending_by_group: GroupCounts;
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
export function hashBody(body: BatchBody): string;
export function countOps(body: BatchBody): number;
export function countsByGroup(body: BatchBody): {
  group1: { matriculas: number; cycle_ops: number; link_ops: number; ops: number };
  group2: { matriculas: number; pointer_ops: number; cycle_pointer_ops: number; ops: number };
};
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
export function casUpdateSql(op: unknown): string;
export function executeManifest(options: ExecuteOptions): ExecutionReport;
