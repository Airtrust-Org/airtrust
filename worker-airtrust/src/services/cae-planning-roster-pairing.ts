import {
  addDaysIso,
  evaluateRosterEligibility,
  type SimulatorRosterPolicy,
} from './cae-planning-policy';
import {
  resolveRosterDayFromPublishedAllocations,
  type PublishedRosterAllocationRow,
} from './cae-planning-roster-state';
import type {
  SimulatorTrainingPairEligibility,
  SimulatorTrainingSessionNeed,
} from './cae-planning-session-proposal';

export async function loadPublishedRosterAllocations(params: {
  db: D1Database;
  empresaId: number;
  employeeIds: number[];
  startDate: string;
  endDate: string;
}): Promise<PublishedRosterAllocationRow[]> {
  if (params.employeeIds.length === 0) return [];
  const placeholders = params.employeeIds.map(() => '?').join(', ');
  const rows = await params.db
    .prepare(
      `SELECT
         CAST(ea.id AS TEXT) AS allocation_id,
         CAST(ea.funcionario_id AS INTEGER) AS employee_id,
         ea.data_inicio AS date_start,
         ea.data_fim AS date_end,
         ea.aeronave_id AS aircraft_id,
         ea.funcao AS function_code,
         ea.situacao_tipo AS situation_type,
         est.bloqueia_alocacao AS situation_blocks_allocation,
         ea.quinzena_id AS fortnight_id,
         eq.numero AS fortnight_number,
         CAST(em.id AS TEXT) AS monthly_roster_id,
         em.status AS monthly_roster_status,
         COALESCE(CAST(ea.updated_at AS TEXT), CAST(em.updated_at AS TEXT)) AS source_revision
       FROM escala_alocacoes ea
       JOIN escalas_mensais em
         ON em.id = ea.escala_id
        AND em.empresa_id = ?
        AND em.deleted_at IS NULL
       LEFT JOIN escalas_quinzenas eq
         ON eq.id = ea.quinzena_id
        AND eq.deleted_at IS NULL
       LEFT JOIN escala_situacao_tipos est
         ON UPPER(est.codigo) = UPPER(COALESCE(ea.situacao_tipo, ''))
        AND est.deleted_at IS NULL
      WHERE CAST(ea.funcionario_id AS INTEGER) IN (${placeholders})
        AND ea.deleted_at IS NULL
        AND COALESCE(LOWER(ea.status), '') != 'cancelado'
        AND LOWER(COALESCE(em.status, '')) = 'publicada'
        AND ea.data_inicio <= ?
        AND ea.data_fim >= ?
      ORDER BY ea.funcionario_id, ea.data_inicio, ea.data_fim, ea.id`,
    )
    .bind(params.empresaId, ...params.employeeIds, params.endDate, params.startDate)
    .all<PublishedRosterAllocationRow>();
  return rows.results || [];
}

function maxIso(left: string, right: string): string {
  return left >= right ? left : right;
}

function minIso(left: string, right: string): string {
  return left <= right ? left : right;
}

export function createRosterAwarePairEligibility(params: {
  needs: SimulatorTrainingSessionNeed[];
  referenceDate: string;
  horizonDays: number;
  rosterPolicy: SimulatorRosterPolicy;
  allocations: PublishedRosterAllocationRow[];
}): {
  pairEligibility: SimulatorTrainingPairEligibility;
  employeesWithEligibleDates: number;
  eligibleDateCount: number;
} {
  const employeeIds = [...new Set(params.needs.map((need) => need.employee_id))];
  const maxTarget = params.needs.map((need) => need.expiry_date).sort().at(-1) || params.referenceDate;
  const allocationsByEmployee = new Map<number, PublishedRosterAllocationRow[]>();
  for (const allocation of params.allocations) {
    const employeeId = Number(allocation.employee_id);
    const bucket = allocationsByEmployee.get(employeeId) || [];
    bucket.push(allocation);
    allocationsByEmployee.set(employeeId, bucket);
  }

  const eligibleDatesByEmployee = new Map<number, Set<string>>();
  let eligibleDateCount = 0;
  for (const employeeId of employeeIds) {
    const dates = new Set<string>();
    const employeeAllocations = allocationsByEmployee.get(employeeId) || [];
    for (let date = params.referenceDate; date <= maxTarget; date = addDaysIso(date, 1)) {
      const roster = resolveRosterDayFromPublishedAllocations({
        employee_id: employeeId,
        date,
        allocations: employeeAllocations,
      });
      if (evaluateRosterEligibility(params.rosterPolicy, roster.state).eligible) {
        dates.add(date);
        eligibleDateCount += 1;
      }
    }
    eligibleDatesByEmployee.set(employeeId, dates);
  }

  const pairEligibility: SimulatorTrainingPairEligibility = (left, right) => {
    const targetDate = minIso(left.expiry_date, right.expiry_date);
    const earliestDate = maxIso(params.referenceDate, addDaysIso(targetDate, -Math.max(0, params.horizonDays)));
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
    employeesWithEligibleDates: [...eligibleDatesByEmployee.values()].filter((dates) => dates.size > 0).length,
    eligibleDateCount,
  };
}
