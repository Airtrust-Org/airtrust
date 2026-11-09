import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const state = vi.hoisted(() => ({
  calls: [] as string[],
  failCleanup: false,
  failRetention: false,
  failDomainOverload: false,
}));
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
  runDomainEventDispatchJob: async () => {
    state.calls.push('domain-events');
    if (state.failDomainOverload) throw new Error('D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window');
  },
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

vi.mock('../../cron/resilient/cron-runs-retention', () => ({
  purgeOldCronJobRuns: async () => {
    state.calls.push('cron-runs-retention');
    if (state.failRetention) throw new Error('SYNTHETIC_CRON_RETENTION_FAILURE');
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
const event = (cron: string, minute = 20) => ({ cron, scheduledTime: Date.parse(`2026-08-02T08:${String(minute).padStart(2, '0')}:00Z`) }) as ScheduledEvent;

afterEach(() => {
  state.calls.length = 0;
  state.failCleanup = false;
  state.failRetention = false;
  state.failDomainOverload = false;
});

describe('resilient cron daily maintenance runtime contract', () => {
  it('executes token cleanup and license alerts once on daily tick, then delegates only generic legacy maintenance', async () => {
    const legacy = vi.fn(async (e: ScheduledEvent) => {
      state.calls.push('legacy:' + e.cron);
    });
    await runResilientScheduledJobs(event('0 8 * * *'), createEnv(), ctx, legacy);
    expect(state.calls.filter((value) => value === 'refresh-token-cleanup')).toHaveLength(1);
    expect(state.calls.filter((value) => value === 'cron-runs-retention')).toHaveLength(1);
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
    expect(state.calls).not.toContain('cron-runs-retention');
    expect(state.calls).not.toContain('license-alerts');
    expect(state.calls).toContain('sigvoos-frms');
    expect(state.calls).toContain('health');
    expect(state.calls).not.toContain('domain-events');
    expect(legacy).not.toHaveBeenCalled();
  });


  it('runs domain events on the adjacent slot without launching SIGVOOS, preserving deferred processing', async () => {
    await runResilientScheduledJobs(event('*/10 * * * *', 10), createEnv(), ctx, vi.fn());
    expect(state.calls).toContain('domain-events');
    expect(state.calls).not.toContain('sigvoos-frms');
    expect(state.calls).not.toContain('health');
  });


  it('stops further D1 cron work in the same tick on overload and retries normally on a later slot', async () => {
    state.failDomainOverload = true;
    await expect(
      runResilientScheduledJobs(event('*/10 * * * *', 50), createEnv(), ctx, vi.fn()),
    ).rejects.toThrow('CRON_TICK_PARTIAL_FAILURE: domain-events');
    expect(state.calls).toContain('domain-events');
    expect(state.calls).not.toContain('health');
    state.calls.length = 0;
    state.failDomainOverload = false;
    await runResilientScheduledJobs(event('*/10 * * * *', 20), createEnv(), ctx, vi.fn());
    expect(state.calls).toContain('health');
    expect(state.calls).toContain('sigvoos-frms');
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

  it('P13-08: falha da retencao de cron_job_runs nao impede os demais jobs do tick diario', async () => {
    state.failRetention = true;
    const legacy = vi.fn(async (e: ScheduledEvent) => {
      state.calls.push('legacy:' + e.cron);
    });
    await expect(
      runResilientScheduledJobs(event('0 8 * * *'), createEnv(), ctx, legacy),
    ).rejects.toThrow(/CRON_TICK_PARTIAL_FAILURE: cron-runs-retention/);
    expect(state.calls).toContain('refresh-token-cleanup');
    expect(state.calls).toContain('license-alerts');
    expect(legacy).toHaveBeenCalledTimes(1);
  });
});
