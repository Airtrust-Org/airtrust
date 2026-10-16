import { describe, expect, it, vi } from 'vitest';
import { persistRecoveryActivityDay } from '../../routes/frms-recovery';

type Params = Parameters<typeof persistRecoveryActivityDay>[0];

function fixture() {
  const run = vi.fn(async () => {
    throw new Error('D1 statement must not run outside atomic batch');
  });
  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => ({ sql, binds: args, run }),
  }));
  const batch = vi.fn(async (_statements: unknown[]) => []);
  const db = { prepare, batch } as unknown as D1Database;
  const params: Params = {
    db, empresaId: 11, funcionarioId: 22,
    activityId: 'new-activity', existingId: null,
    totalDutyMinutes: 0, noFlightConfirmed: 1, createdBy: 44,
    now: '2026-10-16 12:00:00',
    data: { reference_date: '2026-10-16', activity_type: 'OFF_DUTY' },
  };
  return { params, batch, run };
}

describe('FRMS recovery activity atomic persistence', () => {
  it('creates a single new day in one D1 batch, never a separate .run()', async () => {
    const { params, batch, run } = fixture();
    await persistRecoveryActivityDay(params);
    expect(batch).toHaveBeenCalledTimes(1);
    const statements = batch.mock.calls[0][0] as Array<{ sql: string; binds: unknown[] }>;
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain('INSERT INTO frms_recovery_activity_day');
    expect(statements[0].binds.slice(0, 5)).toEqual(['new-activity', 11, 22, '2026-10-16', 1]);
    expect(run).not.toHaveBeenCalled();
  });

  it('updates only the same tenant and crew, then inserts, in the same batch', async () => {
    const { params, batch, run } = fixture();
    await persistRecoveryActivityDay({ ...params, existingId: 'old-activity' });
    const statements = batch.mock.calls[0][0] as Array<{ sql: string; binds: unknown[] }>;
    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toContain('AND empresa_id = ? AND funcionario_id = ? AND deleted_at IS NULL');
    expect(statements[0].binds).toEqual([
      '2026-10-16 12:00:00', '2026-10-16 12:00:00', 'old-activity', 11, 22,
    ]);
    expect(statements[1].sql).toContain('INSERT INTO frms_recovery_activity_day');
    expect(run).not.toHaveBeenCalled();
  });

  it('persists the old-day change, replacement day and every MIXED segment atomically', async () => {
    const { params, batch } = fixture();
    await persistRecoveryActivityDay({
      ...params, existingId: 'old-activity',
      totalDutyMinutes: 120,
      data: {
        reference_date: '2026-10-16', activity_type: 'MIXED',
        segments: [
          { activity_type: 'OFF_DUTY', start_time: '00:00', end_time: '12:00' },
          { activity_type: 'ADMIN_TRAINING', start_time: '12:00', end_time: '14:00' },
        ],
      },
    });
    const statements = batch.mock.calls[0][0] as Array<{ sql: string; binds: unknown[] }>;
    expect(statements).toHaveLength(4);
    expect(statements[2].sql).toContain('INSERT INTO frms_recovery_activity_segment');
    expect(statements[2].binds.slice(1, 5)).toEqual(['new-activity', 11, 22, 1]);
    expect(statements[3].binds.slice(1, 5)).toEqual(['new-activity', 11, 22, 2]);
    expect(statements[3].binds[8]).toBe(120);
  });

  it('propagates batch failure and never falls through to a partial day write', async () => {
    const { params, batch, run } = fixture();
    batch.mockRejectedValueOnce(new Error('D1_ERROR: CHECK constraint failed in segment'));
    await expect(persistRecoveryActivityDay({
      ...params, existingId: 'old-activity',
    })).rejects.toThrow('CHECK constraint failed');
    expect(batch).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });
});
