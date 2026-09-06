import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  blockDeadline,
  buildSyntheticCaeAvailability,
  classifyRosterRowsForEmployee,
  findCommonRosterDate,
  flattenPairedBlocks,
} from '../../../../scripts/validation/production-simulator-folga-readonly.mjs';

describe('production simulator FOLGA read-only proof helpers', () => {
  it('reads the real proposal classes/blocks shape', () => {
    const block = { sessions: [{ need_id: 'a' }, { need_id: 'b' }] };
    expect(flattenPairedBlocks({ classes: [{ blocks: [block] }] })).toEqual([block]);
  });

  it('classifies explicit published FOLGA and operational work without names/PII', () => {
    const rows = [
      { funcionario_id: 1, data_inicio: '2026-09-10', data_fim: '2026-09-10', situacao_tipo: 'FOLGA', status: 'planejado' },
      { funcionario_id: 2, data_inicio: '2026-09-10', data_fim: '2026-09-10', situacao_tipo: 'FOLGA', status: 'planejado' },
      { funcionario_id: 1, data_inicio: '2026-09-11', data_fim: '2026-09-11', situacao_tipo: null, aeronave_id: 7, funcao: 'PIC', status: 'planejado' },
      { funcionario_id: 2, data_inicio: '2026-09-11', data_fim: '2026-09-11', situacao_tipo: null, aeronave_id: 7, funcao: 'SIC', status: 'planejado' },
    ];
    expect(classifyRosterRowsForEmployee(rows, 1, '2026-09-10')).toBe('FOLGA');
    expect(classifyRosterRowsForEmployee(rows, 1, '2026-09-11')).toBe('TRABALHO');
    expect(findCommonRosterDate({ rows, employeeIds: [1, 2], start: '2026-09-10', end: '2026-09-12', wantedState: 'FOLGA' })).toBe('2026-09-10');
    expect(findCommonRosterDate({ rows, employeeIds: [1, 2], start: '2026-09-10', end: '2026-09-12', wantedState: 'TRABALHO' })).toBe('2026-09-11');
  });

  it('computes scheduler deadline and a valid in-memory CAE slot', () => {
    const block = {
      equipment: 'AW139',
      duration_minutes: 120,
      target_date: '2026-10-20',
      sessions: [
        { expiry_date: '2026-10-20', training_session_count: 4, session_order: 1 },
        { expiry_date: '2026-10-21', training_session_count: 4, session_order: 1 },
      ],
    };
    expect(blockDeadline(block, 2)).toBe('2026-10-19');
    const doc = buildSyntheticCaeAvailability(block, '2026-10-10');
    expect(doc.slots[0]).toMatchObject({
      equipment: 'AW139',
      date: '2026-10-10',
      start_time: '10:00',
      end_time: '12:00',
      duration_minutes: 120,
      state: 'OFFERED',
    });
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });
});
