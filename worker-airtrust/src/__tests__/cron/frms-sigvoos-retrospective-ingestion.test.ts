import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const mocks = vi.hoisted(() => ({
  runLease: vi.fn(),
  sync: vi.fn(),
  config: vi.fn(),
  shadowEnabled: vi.fn(async () => false),
}));

vi.mock('../../cron/resilient/job-runner', () => ({ runCronJobWithLease: mocks.runLease }));
vi.mock('../../services/sigvoos-frms', () => ({
  syncSigvoosForFrms: mocks.sync,
  getSigvoosConfig: mocks.config,
}));
vi.mock('../../lib/frms/controle-voos-shadow-flag', () => ({
  isControleVoosShadowModeEnabledForEmpresa: mocks.shadowEnabled,
}));

import { runTenantIngestion } from '../../cron/resilient/sigvoos-frms';

describe('SIGVOOS resilient daily retrospective flow', () => {
  const now = new Date('2026-11-03T19:00:00.000Z');
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const db = {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({ all: async () => ({ results: [] }) })),
    })),
  } as unknown as D1Database;
  const env = {} as Env;
  let state: { watermark_to?: string; watermark_from?: string; metadata_json?: string } | null;
  const checkpoints: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    checkpoints.length = 0;
    state = null;
    mocks.config.mockResolvedValue({
      username: 'qa', password: 'secret', auto_sync_enabled: 'true',
      auto_sync_hora_utc: '19', last_sync_to: '2026-11-02',
    });
    mocks.sync.mockResolvedValue({ totalRegistrosBrutos: 0, totalImportacoes: 0, totalErros: 0 });
    mocks.runLease.mockImplementation(async (options: {
      execute: (context: unknown) => Promise<unknown>;
    }) => options.execute({
      state,
      hasBudget: () => true,
      checkpoint: async (input: Record<string, unknown>) => { checkpoints.push(input); },
      heartbeat: async () => {},
    }));
  });

  it('rechecks only D-3..D-1 and does not run twice on the same operational date', async () => {
    state = {
      watermark_to: '2026-11-02',
      metadata_json: JSON.stringify({ stage: 'COMPLETE', lastReviewedOperationalDate: '2026-11-02' }),
    };
    const first = await runTenantIngestion(db, 7, env, logger, now);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(mocks.sync.mock.calls[0]?.[3]).toMatchObject({
      from: '2026-10-31', to: '2026-11-02', clearExisting: false,
    });
    expect(first.outcome).toBe('SUCCEEDED');
    expect(first.watermarkTo).toBe('2026-11-02');
    expect(first.metadata).toMatchObject({ lastReviewedOperationalDate: '2026-11-03' });
    expect(checkpoints[0]?.metadata).toMatchObject({ lastReviewedOperationalDate: '2026-11-03' });

    state = {
      watermark_to: '2026-11-02',
      watermark_from: '2026-10-31',
      metadata_json: JSON.stringify(first.metadata),
    };
    const second = await runTenantIngestion(db, 7, env, logger, now);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(second.outcome).toBe('SUCCEEDED');
    expect(second.metadata).toMatchObject({ lastReviewedOperationalDate: '2026-11-03' });
  });

  it('prioritizes the oldest missing closed day before retrospective rechecks', async () => {
    state = { watermark_to: '2026-10-29', metadata_json: JSON.stringify({ stage: 'COMPLETE' }) };
    mocks.config.mockResolvedValueOnce({
      username: 'qa', password: 'secret', auto_sync_enabled: 'true',
      auto_sync_hora_utc: '19', last_sync_to: '2026-10-29',
    });
    const result = await runTenantIngestion(db, 7, env, logger, now);
    expect(mocks.sync.mock.calls[0]?.[3]).toMatchObject({
      from: '2026-10-30', to: '2026-10-30',
    });
    expect(result.watermarkTo).toBe('2026-10-30');
    expect(result.metadata).not.toHaveProperty('lastReviewedOperationalDate', '2026-11-03');
  });

  it('refuses unresolved global tenant without any D1 reads, sync, or FRMS writes', async () => {
    const result = await runTenantIngestion(db, null, env, logger, now);
    expect(result).toMatchObject({
      outcome: 'FAILED', errorCode: 'SIGVOOS_CRON_TENANT_REQUIRED',
    });
    expect(mocks.runLease).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });
});
