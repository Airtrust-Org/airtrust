import { describe, expect, it } from 'vitest';
import {
  createEmployeeFortnightPairEligibility,
  loadEmployeeFortnightAssignments,
  loadOperationalFortnightWindows,
  resolveEmployeeFortnightDay,
  type EmployeeFortnightAssignment,
} from '../../services/cae-planning-employee-fortnight';
import type { SimulatorTrainingSessionNeed } from '../../services/cae-planning-session-proposal';
import type { OperationalFortnightWindow } from '../../services/operational-fortnight-calendar';

function assignments(entries: Array<[number, 1 | 2 | null]>): Map<number, EmployeeFortnightAssignment> {
  return new Map(entries.map(([employee_id, fortnight_number]) => [
    employee_id,
    { employee_id, fortnight_number, raw_value: fortnight_number === 1 ? 'primeira' : fortnight_number === 2 ? 'segunda' : null },
  ]));
}

const october: OperationalFortnightWindow[] = [
  { year: 2026, month: 10, number: 1, start_date: '2026-10-01', end_date: '2026-10-15', source: 'DATABASE' },
  { year: 2026, month: 10, number: 2, start_date: '2026-10-16', end_date: '2026-10-31', source: 'DATABASE' },
];

function need(employee_id: number, expiry_date = '2026-10-31'): SimulatorTrainingSessionNeed {
  return {
    need_id: `${employee_id}:1:101`, employee_id, employee_name: `P${employee_id}`, employee_role: null,
    qualification_type_id: 1, qualification_code: 'G1', qualification_name: 'Currículo de voo',
    expiry_date, equipment: 'AW139', session_model_id: 101, session_code: 'S1', session_name: 'Sessão 1',
    session_order: 1, duration_minutes: 120, training_session_count: 1,
  };
}

describe('simulator planning from employee Escala 1/2', () => {
  it('derives work and folga from the employee fixed fortnight without a published monthly roster', () => {
    const map = assignments([[10, 1], [20, 2]]);
    expect(resolveEmployeeFortnightDay({ employeeId: 10, date: '2026-10-10', assignments: map, windows: october }).state).toBe('TRABALHO');
    expect(resolveEmployeeFortnightDay({ employeeId: 10, date: '2026-10-20', assignments: map, windows: october }).state).toBe('FOLGA');
    expect(resolveEmployeeFortnightDay({ employeeId: 20, date: '2026-10-10', assignments: map, windows: october }).state).toBe('FOLGA');
    expect(resolveEmployeeFortnightDay({ employeeId: 20, date: '2026-10-20', assignments: map, windows: october }).state).toBe('TRABALHO');
  });

  it('fails closed when the employee has no fixed Escala 1/2', () => {
    const result = resolveEmployeeFortnightDay({ employeeId: 30, date: '2026-10-20', assignments: assignments([[30, null]]), windows: october });
    expect(result.state).toBe('DESCONHECIDO');
    expect(result.source).toBe('MISSING_EMPLOYEE_FORTNIGHT');
  });

  it('pairs under FOLGA when employees share the same registered work scale and rejects opposite scales', () => {
    const needs = [need(10), need(20), need(30)];
    const result = createEmployeeFortnightPairEligibility({
      needs, referenceDate: '2026-10-01', horizonDays: 90, rosterPolicy: 'FOLGA',
      assignments: assignments([[10, 1], [20, 1], [30, 2]]), windows: october,
    });
    expect(result.pairEligibility(needs[0], needs[1])).toBe(true);
    expect(result.pairEligibility(needs[0], needs[2])).toBe(false);
    expect(result.employeesWithFixedFortnight).toBe(3);
    expect(result.employeesWithEligibleDates).toBe(3);
  });

  it('loads tenant-scoped employee assignments and uses in-memory calendar fallback when a future month is not generated', async () => {
    const calls: Array<{ sql: string; binds: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        let binds: unknown[] = [];
        const stmt = {
          bind: (...values: unknown[]) => { binds = values; calls.push({ sql, binds }); return stmt; },
          all: async () => sql.includes('FROM funcionarios')
            ? { results: [{ employee_id: 10, quinzena: 'primeira' }, { employee_id: 20, quinzena: 'segunda' }] }
            : { results: [] },
        };
        return stmt;
      },
    } as any;

    const loaded = await loadEmployeeFortnightAssignments({ db, empresaId: 6, employeeIds: [10, 20] });
    expect(loaded.get(10)?.fortnight_number).toBe(1);
    expect(loaded.get(20)?.fortnight_number).toBe(2);
    const employeeQuery = calls.find((call) => call.sql.includes('FROM funcionarios'));
    expect(employeeQuery?.sql).toContain('empresa_id = ?');
    expect(employeeQuery?.binds[0]).toBe(6);

    const windows = await loadOperationalFortnightWindows({ db, empresaId: 6, startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(windows.filter((window) => window.month === 10)).toEqual([
      expect.objectContaining({ number: 1, start_date: '2026-10-01', end_date: '2026-10-15', source: 'DEFAULT' }),
      expect.objectContaining({ number: 2, start_date: '2026-10-16', end_date: '2026-10-31', source: 'DEFAULT' }),
    ]);
  });
});
