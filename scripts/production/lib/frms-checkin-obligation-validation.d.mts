export const ABSENCE_CODES: readonly string[];
export const NON_FLIGHT_CODES: readonly string[];
export const MANUAL_ABSENCE_EVENTS: readonly string[];
export const CREW_FUNCTIONS: readonly string[];
export function assertReadOnlyQuery(sql: unknown): string;
export interface ReadOnlyD1 {
  prepare(sql: string): {
    bind(...args: unknown[]): { all(): Promise<{ results: unknown[]; success: boolean }>; first(): Promise<unknown> };
    all(): Promise<{ results: unknown[]; success: boolean }>;
    first(): Promise<unknown>;
  };
  stats: { queries: number };
}
export function createReadOnlyD1(
  queryFn: (sql: string, params: unknown[]) => Promise<unknown[]> | unknown[],
  stats?: { queries: number },
): ReadOnlyD1;
export function crewRef(empresaId: number, funcionarioId: number): string;
export interface ObligationLike {
  status: string; exigivel: boolean; base: string; divergencias?: string[];
}
export interface DayEvaluation {
  date: string; crew: number; status: Record<string, number>; base: Record<string, number>;
  divergences: Record<string, number>; gap_crew_days: number; legacy_pending_no_checkin: number;
  legacy_not_pending_now: Record<string, number>; received_oracle: number; received_obligation: number;
  violations: Array<{ code: string; date: string; crew_ref: string | null }>;
}
export function evaluateDay(input: {
  empresaId: number; date: string; crew: Set<number>; allEmployees: Set<number>;
  obligations: Map<number, ObligationLike>;
  oracle: {
    checkins: Set<number>; evd: Set<number>; jornada: Set<number>;
    allocations: Array<{ funcionario_id: number; data_inicio: string; data_fim: string; situacao_tipo: string }>;
    manualAbsence: Array<{ funcionario_id: number; data_inicio: string; data_fim: string }>;
    legacyRoster: Set<number>;
  };
}): DayEvaluation;
export function summarize(days: DayEvaluation[], options?: { sampleLimit?: number }): {
  days: number;
  totals: {
    crew_days: number; status: Record<string, number>; base: Record<string, number>;
    divergences: Record<string, number>; gap_crew_days: number; legacy_pending_no_checkin: number;
    legacy_not_pending_now: Record<string, number>;
  };
  invariants: Record<string, number>; violation_count: number;
  samples: Array<{ code: string; date: string; crew_ref: string | null }>;
};
