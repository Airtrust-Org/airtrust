import { parseFuncionarioQuinzena } from '../lib/escalas/active-fortnight';
import { addDaysIso, evaluateRosterEligibility, type SimulatorRosterPolicy } from './cae-planning-policy';
import type { SimulatorTrainingPairEligibility, SimulatorTrainingSessionNeed } from './cae-planning-session-proposal';
import {
  getDefaultOperationalFortnightRange,
  type OperationalFortnightNumber,
  type OperationalFortnightWindow,
} from './operational-fortnight-calendar';

export type EmployeeFortnightAssignment = {
  employee_id: number;
  fortnight_number: OperationalFortnightNumber | null;
  raw_value: string | null;
};

export type EmployeeFortnightDay = {
  employee_id: number;
  date: string;
  state: 'FOLGA' | 'TRABALHO' | 'DESCONHECIDO';
  fortnight_number: OperationalFortnightNumber | null;
  calendar_fortnight_number: OperationalFortnightNumber | null;
  source: 'EMPLOYEE_FORTNIGHT' | 'MISSING_EMPLOYEE_FORTNIGHT' | 'MISSING_CALENDAR';
  reason: string;
};

function monthKey(year: number, month: number, number: OperationalFortnightNumber): string {
  return `${year}-${month}-${number}`;
}

function monthShift(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function monthsCoveringRange(startDate: string, endDate: string) {
  const [startYear, startMonth] = startDate.split('-').map(Number);
  const [endYear, endMonth] = endDate.split('-').map(Number);
  const first = monthShift(startYear, startMonth, -1);
  const last = monthShift(endYear, endMonth, 1);
  const result: Array<{ year: number; month: number }> = [];
  let cursor = new Date(Date.UTC(first.year, first.month - 1, 1));
  const stop = new Date(Date.UTC(last.year, last.month - 1, 1));
  while (cursor <= stop) {
    result.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return result;
}

export async function loadEmployeeFortnightAssignments(params: {
  db: D1Database;
  empresaId: number;
  employeeIds: number[];
}): Promise<Map<number, EmployeeFortnightAssignment>> {
  const ids = [...new Set(params.employeeIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(', ');
  const result = await params.db
    .prepare(
      `SELECT CAST(id AS INTEGER) AS employee_id, quinzena
         FROM funcionarios
        WHERE empresa_id = ?
          AND id IN (${placeholders})
          AND deleted_at IS NULL
          AND COALESCE(ativo, 1) = 1`,
    )
    .bind(params.empresaId, ...ids)
    .all<{ employee_id: number; quinzena: string | null }>();

  return new Map(
    (result.results || []).map((row) => [
      Number(row.employee_id),
      {
        employee_id: Number(row.employee_id),
        fortnight_number: parseFuncionarioQuinzena(row.quinzena),
        raw_value: row.quinzena ?? null,
      },
    ]),
  );
}

export async function loadOperationalFortnightWindows(params: {
  db: D1Database;
  empresaId: number;
  startDate: string;
  endDate: string;
}): Promise<OperationalFortnightWindow[]> {
  const months = monthsCoveringRange(params.startDate, params.endDate);
  const minYear = Math.min(...months.map((item) => item.year));
  const maxYear = Math.max(...months.map((item) => item.year));
  const result = await params.db
    .prepare(
      `SELECT id, ano, mes, numero, data_inicio, data_fim
         FROM escalas_quinzenas
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND numero IN (1, 2)
          AND ano BETWEEN ? AND ?
          AND data_fim >= ?
          AND data_inicio <= ?
        ORDER BY data_inicio, numero`,
    )
    .bind(params.empresaId, minYear, maxYear, addDaysIso(params.startDate, -40), addDaysIso(params.endDate, 40))
    .all<{ id: number; ano: number; mes: number; numero: number; data_inicio: string; data_fim: string }>();

  const fromDb = new Map<string, OperationalFortnightWindow>();
  for (const row of result.results || []) {
    const number = Number(row.numero) === 2 ? 2 : 1;
    fromDb.set(monthKey(Number(row.ano), Number(row.mes), number), {
      id: Number(row.id),
      year: Number(row.ano),
      month: Number(row.mes),
      number,
      start_date: String(row.data_inicio).slice(0, 10),
      end_date: String(row.data_fim).slice(0, 10),
      source: 'DATABASE',
    });
  }

  const windows: OperationalFortnightWindow[] = [];
  for (const month of months) {
    for (const number of [1, 2] as const) {
      const existing = fromDb.get(monthKey(month.year, month.month, number));
      if (existing) {
        windows.push(existing);
      } else {
        const fallback = getDefaultOperationalFortnightRange(month.year, month.month, number);
        windows.push({
          id: null,
          year: month.year,
          month: month.month,
          number,
          start_date: fallback.start,
          end_date: fallback.end,
          source: 'DEFAULT',
        });
      }
    }
  }
  return windows
    .filter((window) => window.end_date >= params.startDate && window.start_date <= params.endDate)
    .sort((left, right) => left.start_date.localeCompare(right.start_date) || left.number - right.number);
}

export function resolveEmployeeFortnightDay(params: {
  employeeId: number;
  date: string;
  assignments: Map<number, EmployeeFortnightAssignment>;
  windows: OperationalFortnightWindow[];
}): EmployeeFortnightDay {
  const assignment = params.assignments.get(params.employeeId);
  if (!assignment?.fortnight_number) {
    return {
      employee_id: params.employeeId,
      date: params.date,
      state: 'DESCONHECIDO',
      fortnight_number: null,
      calendar_fortnight_number: null,
      source: 'MISSING_EMPLOYEE_FORTNIGHT',
      reason: 'Funcionário sem Escala 1/2 válida no cadastro.',
    };
  }
  const matches = params.windows.filter(
    (window) => window.start_date <= params.date && window.end_date >= params.date,
  );
  const numbers = [...new Set(matches.map((window) => window.number))];
  if (numbers.length !== 1) {
    return {
      employee_id: params.employeeId,
      date: params.date,
      state: 'DESCONHECIDO',
      fortnight_number: assignment.fortnight_number,
      calendar_fortnight_number: null,
      source: 'MISSING_CALENDAR',
      reason: 'Calendário operacional de quinzenas não resolve a data de forma única.',
    };
  }
  const calendarFortnight = numbers[0];
  const state = calendarFortnight === assignment.fortnight_number ? 'TRABALHO' : 'FOLGA';
  return {
    employee_id: params.employeeId,
    date: params.date,
    state,
    fortnight_number: assignment.fortnight_number,
    calendar_fortnight_number: calendarFortnight,
    source: 'EMPLOYEE_FORTNIGHT',
    reason: state === 'FOLGA'
      ? `Data pertence à quinzena oposta à Escala ${assignment.fortnight_number} cadastrada.`
      : `Data pertence à Escala ${assignment.fortnight_number} cadastrada do funcionário.`,
  };
}

export async function resolveEmployeeFortnightDayFromD1(params: {
  db: D1Database;
  empresaId: number;
  employeeId: number;
  date: string;
}): Promise<EmployeeFortnightDay> {
  const [assignments, windows] = await Promise.all([
    loadEmployeeFortnightAssignments({ db: params.db, empresaId: params.empresaId, employeeIds: [params.employeeId] }),
    loadOperationalFortnightWindows({ db: params.db, empresaId: params.empresaId, startDate: params.date, endDate: params.date }),
  ]);
  return resolveEmployeeFortnightDay({ employeeId: params.employeeId, date: params.date, assignments, windows });
}

export function createEmployeeFortnightPairEligibility(params: {
  needs: SimulatorTrainingSessionNeed[];
  referenceDate: string;
  horizonDays: number;
  rosterPolicy: SimulatorRosterPolicy;
  assignments: Map<number, EmployeeFortnightAssignment>;
  windows: OperationalFortnightWindow[];
}): {
  pairEligibility: SimulatorTrainingPairEligibility;
  employeesWithFixedFortnight: number;
  employeesWithEligibleDates: number;
  eligibleDateCount: number;
} {
  const employeeIds = [...new Set(params.needs.map((need) => need.employee_id))];
  const maxTarget = params.needs.map((need) => need.expiry_date).sort().at(-1) || params.referenceDate;
  const eligibleDatesByEmployee = new Map<number, Set<string>>();
  let eligibleDateCount = 0;

  for (const employeeId of employeeIds) {
    const dates = new Set<string>();
    for (let date = params.referenceDate; date <= maxTarget; date = addDaysIso(date, 1)) {
      const roster = resolveEmployeeFortnightDay({ employeeId, date, assignments: params.assignments, windows: params.windows });
      if (evaluateRosterEligibility(params.rosterPolicy, roster.state).eligible) {
        dates.add(date);
        eligibleDateCount += 1;
      }
    }
    eligibleDatesByEmployee.set(employeeId, dates);
  }

  const pairEligibility: SimulatorTrainingPairEligibility = (left, right) => {
    const targetDate = left.expiry_date <= right.expiry_date ? left.expiry_date : right.expiry_date;
    const earliestDate = params.referenceDate >= addDaysIso(targetDate, -Math.max(0, params.horizonDays))
      ? params.referenceDate
      : addDaysIso(targetDate, -Math.max(0, params.horizonDays));
    const leftDates = eligibleDatesByEmployee.get(left.employee_id);
    const rightDates = eligibleDatesByEmployee.get(right.employee_id);
    if (!leftDates || !rightDates) return false;
    for (let date = targetDate; date >= earliestDate; date = addDaysIso(date, -1)) {
      if (leftDates.has(date) && rightDates.has(date)) return true;
    }
    return false;
  };

  return {
    pairEligibility,
    employeesWithFixedFortnight: employeeIds.filter((id) => Boolean(params.assignments.get(id)?.fortnight_number)).length,
    employeesWithEligibleDates: [...eligibleDatesByEmployee.values()].filter((dates) => dates.size > 0).length,
    eligibleDateCount,
  };
}
