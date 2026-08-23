import { describe, expect, it } from 'vitest';
import { resolveRosterDayFromPublishedAllocations } from './../../services/cae-planning-roster-state';

const base = {
  employee_id: 10,
  date_start: '2026-11-16',
  date_end: '2026-11-30',
  monthly_roster_status: 'publicada',
};

describe('CAE roster live resolver', () => {
  it('classifica trabalho pela alocação publicada atual', () => {
    const result = resolveRosterDayFromPublishedAllocations({
      employee_id: 10,
      date: '2026-11-20',
      allocations: [{ ...base, allocation_id: 'w1', aircraft_id: 2, function_code: 'PIC', fortnight_id: 7, fortnight_number: 2 }],
    });
    expect(result.state).toBe('TRABALHO');
    expect(result.fortnight_number).toBe(2);
  });

  it('classifica folga por situação publicada atual', () => {
    const result = resolveRosterDayFromPublishedAllocations({
      employee_id: 10,
      date: '2026-11-20',
      allocations: [{ ...base, allocation_id: 'f1', situation_type: 'FOLGA', fortnight_id: 7, fortnight_number: 2 }],
    });
    expect(result.state).toBe('FOLGA');
  });

  it('bloqueia férias/afastamento configurado como bloqueante', () => {
    const result = resolveRosterDayFromPublishedAllocations({
      employee_id: 10,
      date: '2026-11-20',
      allocations: [{ ...base, allocation_id: 'a1', situation_type: 'FERIAS', situation_blocks_allocation: 1 }],
    });
    expect(result.state).toBe('INDISPONIVEL');
  });

  it('falha fechado quando escala publicada é contraditória', () => {
    const result = resolveRosterDayFromPublishedAllocations({
      employee_id: 10,
      date: '2026-11-20',
      allocations: [
        { ...base, allocation_id: 'w1', aircraft_id: 2, function_code: 'PIC' },
        { ...base, allocation_id: 'f1', situation_type: 'FOLGA' },
      ],
    });
    expect(result.state).toBe('DESCONHECIDO');
  });

  it('não usa cadastro estático quando não há escala publicada', () => {
    const result = resolveRosterDayFromPublishedAllocations({ employee_id: 10, date: '2026-11-20', allocations: [] });
    expect(result.state).toBe('DESCONHECIDO');
  });
});
