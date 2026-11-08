import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const state = vi.hoisted(() => ({
  calls: [] as string[],
  failCleanup: false,
}));
const mark = (name: string) => async () => { state.calls.push(name); };
vi.mock('../../cron/alertasDiarios', () => ({
  alertasDiariosHandler: async () => { state.calls.push('daily-alerts'); },
}));
vi.mock('../../cron/notificacoes', () => ({
  TRAINING_ALERT_DAILY_CRON: '0 8 * * *',
  processarNotificacoes: async () => { state.calls.push('training-alerts'); },
}));
vi.mock('../../cron/training-compliance-notifications', () => ({
  refreshTrainingComplianceSnapshots: async () => { state.calls.push('snapshots'); },
}));
vi.mock('../../cron/training-compliance-reports', () => ({
  processTrainingComplianceReportAutomation: async () => { state.calls.push('reports'); },
}));
vi.mock('../../cron/resilient/cron-health', () => ({
  logCronHealthSnapshot: async () => { state.calls.push('health'); },
}));
vi.mock('../../cron/resilient/daily-frms', () => ({
  runDailyFrmsOperations: async () => { state.calls.push('frms'); },
}));
vi.mock('../../cron/resilient/domain-events', () => ({
  runDomainEventDispatchJob: async () => { state.calls.push('domain-events'); },
}));
vi.mock('../../cron/resilient/ead-renewal', () => ({
  runEadRenewalJob: async () => { state.calls.push('ead-renewal'); },
}));
vi.mock('../../cron/resilient/compliance-roster', () => ({
  runTrainingComplianceRosterJob: async () => { state.calls.push('roster'); },
}));
vi.mock('../../cron/resilient/sigvoos-frms', () => ({
  runSigvoosFrmsJobs: async () => { state.calls.push('sigvoos-frms'); },
}));
vi.mock('../../cron/license-alerts', () => ({
  processLicenseAlerts: async () => {
    state.calls.push('license-alerts');
    return { avaliadas: 0, enviadas: 0, erros: 0 };
  },
}));
vi.mock('../../services/auth-refresh-token', () => ({
  cleanupExpiredRefreshTokens: async () => {
    state.calls.push('refresh-token-cleanup');
    if (state.failCleanup) throw new Error('SYNTHETIC_TOKEN_CLEANUP_FAILURE');
    return 0;
  },
}));

import { runResilientScheduledJobs } from '../../cron/resilient/scheduled-router';

function createEnv(): Env {
  const db = {
    prepare: () => ({
      first: async () => ({ state_available: 1, items_available: 1, runs_available: 1 }),
    }),
  };
  return { DB: db, ENVIRONMENT: 'test' } as unknown as Env;
}
const ctx = {} as ExecutionContext;
const event = (cron: string) => ({ cron, scheduledTime: Date.now() }) as ScheduledEvent;

afterEach(() => {
  state.calls.length = 0;
  state.failCleanup = false;
});

describe('resilient cron daily maintenance runtime contract', () => {
  it('executes token cleanup and license alerts once on daily tick, then delegates only generic legacy maintenance', async () => {
    const legacy = vi.fn(async (e: ScheduledEvent) => {
      state.calls.push('legacy:' + e.cron);
    });
    await runResilientScheduledJobs(event('0 8 * * *'), createEnv(), ctx, legacy);
    expect(state.calls.filter((value) => value === 'refresh-token-cleanup')).toHaveLength(1);
    expect(state.calls.filter((value) => value === 'license-alerts')).toHaveLength(1);
    expect(state.calls.indexOf('license-alerts')).toBeLessThan(
      state.calls.indexOf('legacy:__airtrust_resilient_delegated__'),
    );
    expect(legacy).toHaveBeenCalledTimes(1);
  });

  it('never runs either daily maintenance job on 10-minute ticks', async () => {
    const legacy = vi.fn();
    await runResilientScheduledJobs(event('*/10 * * * *'), createEnv(), ctx, legacy);
    expect(state.calls).not.toContain('refresh-token-cleanup');
    expect(state.calls).not.toContain('license-alerts');
    expect(state.calls).toContain('sigvoos-frms');
    expect(legacy).not.toHaveBeenCalled();
  });

  it('continues license alerts when token cleanup fails and surfaces partial failure', async () => {
    state.failCleanup = true;
    const legacy = vi.fn(async (e: ScheduledEvent) => {
      state.calls.push('legacy:' + e.cron);
    });
    await expect(
      runResilientScheduledJobs(event('0 8 * * *'), createEnv(), ctx, legacy),
    ).rejects.toThrow(/CRON_TICK_PARTIAL_FAILURE: refresh-token-cleanup/);
    expect(state.calls).toContain('license-alerts');
    expect(legacy).toHaveBeenCalledTimes(1);
  });
});
