import { describe, expect, it, vi } from 'vitest';

import { persistirAcumuloRolling } from '../../lib/frms/db-service-jornadas';

describe('persistirAcumuloRolling atomic persistence', () => {
  it('soft-deletes the previous snapshot and inserts the replacement in one D1 batch', async () => {
    const prepared: Array<{ sql: string; args: unknown[] }> = [];
    const prepare = vi.fn((sql: string) => ({
      bind: (...args: unknown[]) => {
        const statement = { sql, args };
        prepared.push(statement);
        return statement;
      },
    }));
    const batch = vi.fn(async (statements: unknown[]) =>
      statements.map(() => ({ success: true })),
    );

    const db = { prepare, batch } as unknown as D1Database;

    await persistirAcumuloRolling(db, 42, '2026-09-09', {
      hv_7_dias_min: 120,
      hv_28_dias_min: 360,
      hv_365_dias_min: 1200,
      hv_mes_calendario_min: 240,
      hv_dia_min: 60,
      pct_limite_7d: 10,
      pct_limite_28d: 20,
      pct_limite_mes_calendario: 30,
      pct_limite_365d: 40,
      pct_limite_dia: 50,
      repouso_anterior_min: 720,
      repouso_suficiente: 1,
    });

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(batch).toHaveBeenCalledTimes(1);

    const [batchedStatements] = batch.mock.calls[0] ?? [];
    expect(batchedStatements).toEqual(prepared);
    expect(prepared[0]?.sql).toContain('UPDATE frms_acumulo_rolling SET deleted_at');
    expect(prepared[1]?.sql).toContain('INSERT INTO frms_acumulo_rolling');
    expect(prepared[0]?.args).toEqual([expect.any(String), '42', '2026-09-09']);
    expect(prepared[1]?.args[1]).toBe('42');
    expect(prepared[1]?.args[2]).toBe('2026-09-09');
  });
});
