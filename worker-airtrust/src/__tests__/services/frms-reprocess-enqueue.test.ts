import { beforeEach, describe, expect, it, vi } from 'vitest';

const enqueueMock = vi.fn();
vi.mock('../../cron/job-state', () => ({
  buildCronScopeKey: (empresaId: number) => `empresa:${empresaId}`,
  enqueueCronJobItem: (...args: unknown[]) => enqueueMock(...args),
}));

import { enqueueFrmsReprocessForSigvoosWindow } from '../../services/frms-reprocess-enqueue';

beforeEach(() => enqueueMock.mockReset());

describe('enqueueFrmsReprocessForSigvoosWindow', () => {
  it('enfileira apenas tripulantes retornados pelo recorte tenant/SIGVOOS', async () => {
    const calls: unknown[][] = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...args: unknown[]) => ({
          all: async () => {
            calls.push([sql, ...args]);
            return { results: [{ tripulante_id: 7 }, { tripulante_id: 9 }] };
          },
        }),
      })),
    } as unknown as D1Database;
    const result = await enqueueFrmsReprocessForSigvoosWindow(db, {
      empresaId: 6,
      periodFrom: '2026-09-01',
      periodTo: '2026-09-26',
      operationKey: 'op-123',
    });

    expect(result.enqueued).toBe(2);
    expect(calls[0][0]).toContain("UPPER(COALESCE(j.origem, '')) = 'SIGVOOS'");
    expect(calls[0]).toEqual(expect.arrayContaining([6, '2026-09-01', '2026-09-26']));
    expect(enqueueMock).toHaveBeenCalledTimes(2);
    expect(enqueueMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      jobName: 'frms-reprocess',
      scopeKey: 'empresa:6',
      itemKey: 'manual:op-123:2026-09-01:2026-09-26:7',
      payload: expect.objectContaining({ empresa_id: 6, tripulante_id: 7, trigger: 'manual_sigvoos_sync' }),
    }));
  });

  it('rejeita tenant ou janela inválidos antes de consultar o banco', async () => {
    const db = { prepare: vi.fn() } as unknown as D1Database;
    await expect(enqueueFrmsReprocessForSigvoosWindow(db, {
      empresaId: 0, periodFrom: '2026-09-01', periodTo: '2026-09-02', operationKey: 'x',
    })).rejects.toThrow('INVALID_TENANT');
    expect((db as any).prepare).not.toHaveBeenCalled();
  });
});
