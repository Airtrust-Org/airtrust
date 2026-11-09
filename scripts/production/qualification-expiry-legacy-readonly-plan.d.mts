export function expectedExpiry(completed: string, months: number, endOfMonth?: boolean): string | null;
export function buildPlan(rows: Array<Record<string, unknown>>): {
  candidates: Array<Record<string, unknown>>;
  plan_sha256: string;
  eligible_candidate_count: number;
  consistent: number;
  blocked: Record<string, number>;
  blocked_total: number;
};
export function buildInventorySelectSql(ids?: number[] | null): string;
export const REALIZED_STATUSES: Set<string>;
export function isRegulatoryException(modelCode: unknown): boolean;
