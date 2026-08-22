import { describe, expect, it } from 'vitest';
import { resolvePublishedRosterDayFromD1, type D1LikeDatabase } from './../../services/cae-planning-roster-d1';

function dbWithRows(rows: any[]): { db: D1LikeDatabase; calls: { sql: string; binds: unknown[] }[] } {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db: D1LikeDatabase = {
    prepare(sql) {
      const call = { sql, binds: [] as unknown[] };
      calls.push(call);
      const statement: any = {
        bind(...values: unknown[]) {
          call.binds = values;
          return statement;
        },
        async all() {
          return { results: rows };
        },
      };
      return statement;
    },
  };
  return { db, calls };
}

describe('resolvePublishedRosterDayFromD1', () => {
  it('mantém isolamento tenant e resolve trabalho a partir da escala publicada', async () => {
    const { db, calls } = dbWithRows([
      {
        allocation_id: 'a1',
        employee_id: 7,
        date_start: '2026-11-15',
        date_end: '2026-11-30',
        aircraft_id: 10,
        function_code: 'PIC',
        fortnight_id: 2,
        fortnight_number: 2,
        monthly_roster_status: 'publicada',
      },
    ]);

    const result = await resolvePublishedRosterDayFromD1({
      db,
      empresaId: 99,
      employeeId: 7,
      date: '2026-11-20',
    });

    expect(result.state).toBe('TRABALHO');
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('em.empresa_id = ?');
    expect(calls[0].sql).not.toContain('funcionarios.quinzena');
    expect(calls[0].binds).toEqual([99, 7, '2026-11-20', '2026-11-20']);
  });

  it('sem alocação publicada falha fechado como DESCONHECIDO', async () => {
    const { db } = dbWithRows([]);
    const result = await resolvePublishedRosterDayFromD1({
      db,
      empresaId: 99,
      employeeId: 7,
      date: '2026-11-20',
    });
    expect(result.state).toBe('DESCONHECIDO');
  });
});
