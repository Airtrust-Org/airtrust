import { describe, expect, it } from 'vitest';
import { createRosterAwarePairEligibility } from '../../services/cae-planning-roster-pairing';
import type { SimulatorTrainingSessionNeed } from '../../services/cae-planning-session-proposal';
import type { PublishedRosterAllocationRow } from '../../services/cae-planning-roster-state';

function need(employeeId: number): SimulatorTrainingSessionNeed {
  return {
    need_id: `${employeeId}:1:101`,
    employee_id: employeeId,
    employee_name: `Piloto ${employeeId}`,
    employee_role: employeeId === 10 ? 'Comandante' : 'Copiloto',
    qualification_type_id: 1,
    qualification_code: 'G1',
    qualification_name: 'AW139 — Currículo de Voo - Anual (FFS)',
    expiry_date: '2027-06-17',
    equipment: 'AW139',
    session_model_id: 101,
    session_code: 'S1',
    session_name: 'Sessão 1',
    session_order: 1,
    duration_minutes: 120,
    training_session_count: 4,
  };
}

function allocation(
  employeeId: number,
  situation: 'FOLGA' | 'TRABALHO',
): PublishedRosterAllocationRow {
  return {
    allocation_id: `${employeeId}-${situation}`,
    employee_id: employeeId,
    date_start: '2027-06-01',
    date_end: '2027-06-17',
    aircraft_id: situation === 'TRABALHO' ? 99 : null,
    function_code: situation === 'TRABALHO' ? 'PIC' : null,
    situation_type: situation === 'FOLGA' ? 'FOLGA' : null,
    situation_blocks_allocation: 0,
    fortnight_id: 1,
    fortnight_number: 1,
    monthly_roster_id: 'escala-1',
    monthly_roster_status: 'publicada',
  };
}

describe('roster-aware simulator pairing', () => {
  it('rejects a structurally compatible partner without a common FOLGA date', () => {
    const a = need(10);
    const b = need(20);
    const result = createRosterAwarePairEligibility({
      needs: [a, b],
      referenceDate: '2027-06-01',
      horizonDays: 60,
      rosterPolicy: 'FOLGA',
      allocations: [allocation(10, 'FOLGA'), allocation(20, 'TRABALHO')],
    });

    expect(result.pairEligibility(a, b)).toBe(false);
    expect(result.employeesWithEligibleDates).toBe(1);
  });

  it('accepts partners that share an eligible published FOLGA date', () => {
    const a = need(10);
    const b = need(30);
    const result = createRosterAwarePairEligibility({
      needs: [a, b],
      referenceDate: '2027-06-01',
      horizonDays: 60,
      rosterPolicy: 'FOLGA',
      allocations: [allocation(10, 'FOLGA'), allocation(30, 'FOLGA')],
    });

    expect(result.pairEligibility(a, b)).toBe(true);
    expect(result.employeesWithEligibleDates).toBe(2);
    expect(result.eligibleDateCount).toBeGreaterThan(0);
  });

  it('fails closed when a partner has no published roster state', () => {
    const a = need(10);
    const b = need(40);
    const result = createRosterAwarePairEligibility({
      needs: [a, b],
      referenceDate: '2027-06-01',
      horizonDays: 60,
      rosterPolicy: 'AMBAS',
      allocations: [allocation(10, 'FOLGA')],
    });

    expect(result.pairEligibility(a, b)).toBe(false);
  });
});
