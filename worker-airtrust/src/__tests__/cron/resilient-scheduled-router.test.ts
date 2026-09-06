import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildQualificacoesEadRenovacaoResilienteQuery,
  EAD_RENEWAL_DISCOVERY_BATCH,
  EAD_RENEWAL_PROCESS_BATCH,
} from '../../cron/resilient/ead-renewal';
import {
  buildLmsReminderDiscoveryQuery,
  LMS_REMINDER_DISCOVERY_BATCH,
  LMS_REMINDER_PROCESS_BATCH,
} from '../../cron/resilient/lms-reminders';
import {
  buildCronStateSchemaProbeQuery,
  getResilientCronPlan,
} from '../../cron/resilient/scheduled-router';
import {
  resolveNextSigvoosDay,
  shouldRunSigvoosAtCurrentHour,
  FRMS_REPROCESS_BATCH,
  SIGVOOS_TENANT_BATCH,
  SIGVOOS_TRIPULANTE_ENQUEUE_BATCH,
} from '../../cron/resilient/sigvoos-frms';

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('resilient scheduled router', () => {
  it('separa o cron de dez minutos dos trabalhos exclusivamente diários', () => {
    const atEightUtc = new Date('2026-08-02T08:20:00.000Z');
    const tenMinute = getResilientCronPlan('*/10 * * * *', atEightUtc);

    expect(tenMinute).toEqual({
      useResilientJobs: true,
      runDailyAlerts: false,
      runLmsReminders: true,
      runEadRenewal: true,
      runDailyFrms: false,
      runSigvoosFrms: true,
      runDomainEvents: true,
      runCronHealth: true,
      delegateLegacy: false,
    });

    const daily = getResilientCronPlan('0 8 * * *', atEightUtc);
    expect(daily.runDailyAlerts).toBe(true);
    expect(daily.runDailyFrms).toBe(true);
    expect(daily.runSigvoosFrms).toBe(false);
    expect(daily.runDomainEvents).toBe(false);
    expect(daily.runCronHealth).toBe(true);
    expect(daily.delegateLegacy).toBe(true);
  });

  it('delega triggers não relacionados sem ativar jobs resilientes', () => {
    expect(getResilientCronPlan('0 3 * * *').useResilientJobs).toBe(false);
    expect(getResilientCronPlan('0 4 * * SUN').useResilientJobs).toBe(false);
    expect(getResilientCronPlan('0 5 1 * *').useResilientJobs).toBe(false);
  });

  it('verifica todo o schema resiliente antes de qualquer efeito colateral', () => {
    const sql = compactSql(buildCronStateSchemaProbeQuery());
    expect(sql).toContain('FROM cron_job_state');
    expect(sql).toContain('FROM cron_job_items');
    expect(sql).toContain('FROM cron_job_runs');

    const router = readFileSync(
      resolve(process.cwd(), 'src/cron/resilient/scheduled-router.ts'),
      'utf8',
    );
    const schemaProbeIndex = router.indexOf('await assertCronStateSchemaAvailable(env.DB)');
    const dailyAlertsIndex = router.indexOf('await alertasDiariosHandler(event, env)');

    expect(schemaProbeIndex).toBeGreaterThan(-1);
    expect(dailyAlertsIndex).toBeGreaterThan(-1);
    expect(schemaProbeIndex).toBeLessThan(dailyAlertsIndex);
  });

  it('não executa o handler monolítico em cada tick de dez minutos', () => {
    const tenMinute = getResilientCronPlan('*/10 * * * *');
    expect(tenMinute.delegateLegacy).toBe(false);
    expect(tenMinute.runDomainEvents).toBe(true);
  });

  it('ativa o roteador no entrypoint sem alterar os triggers oficiais', () => {
    const entrypoint = readFileSync(
      resolve(process.cwd(), 'src/runtime/worker-entrypoint.ts'),
      'utf8',
    );
    const router = readFileSync(
      resolve(process.cwd(), 'src/cron/resilient/scheduled-router.ts'),
      'utf8',
    );

    expect(entrypoint).toContain('runResilientScheduledJobs(event, env, ctx, (legacyEvent');
    expect(entrypoint).toContain(
      'options.onScheduled(legacyEvent, legacyEnv, legacyCtx, jobContext)',
    );
    expect(router).toContain("const LEGACY_DELEGATED_CRON = '__airtrust_resilient_delegated__'");
    expect(router).toContain('Schema resiliente ausente; usando handler legado');
    expect(router).toContain('logCronHealthSnapshot(env.DB, logger, now)');
    expect(router).toContain('runDomainEventDispatchJob(env.DB, logger)');
    expect(router).toContain("await runStep('lms-reminders'");
    expect(router).toContain("await runStep('sigvoos-frms'");
    expect(router).toContain("await runStep('domain-events'");
    expect(router).toContain("await runStep('cron-health'");
    expect(router).toContain('CRON_TICK_PARTIAL_FAILURE');
    expect(router).not.toContain('Promise.allSettled');
  });
});

describe('bounded cron discovery', () => {
  it('usa keyset e limite explícito nos lembretes LMS', () => {
    const sql = compactSql(buildLmsReminderDiscoveryQuery());
    expect(sql).toContain('AND m.id > ?');
    expect(sql).toContain('ORDER BY m.id ASC');
    expect(sql).toContain('LIMIT ?');
    expect(LMS_REMINDER_DISCOVERY_BATCH).toBeLessThanOrEqual(100);
    expect(LMS_REMINDER_PROCESS_BATCH).toBeLessThanOrEqual(100);
  });

  it('usa keyset e limite explícito na renovação EAD', () => {
    const sql = compactSql(buildQualificacoesEadRenovacaoResilienteQuery());
    expect(sql).toContain('AND qh.id > ?');
    expect(sql).toContain('ORDER BY qh.id ASC');
    expect(sql).toContain('LIMIT ?');
    expect(EAD_RENEWAL_DISCOVERY_BATCH).toBeLessThanOrEqual(100);
    expect(EAD_RENEWAL_PROCESS_BATCH).toBeLessThanOrEqual(50);
  });

  it('mantém caps pequenos para SIGVOOS e FRMS', () => {
    expect(SIGVOOS_TENANT_BATCH).toBeLessThanOrEqual(25);
    expect(SIGVOOS_TRIPULANTE_ENQUEUE_BATCH).toBeLessThanOrEqual(100);
    expect(FRMS_REPROCESS_BATCH).toBeLessThanOrEqual(25);
  });
});

describe('SIGVOOS resumability', () => {
  it('avança somente um dia por execução', () => {
    expect(resolveNextSigvoosDay('2026-07-30', null, '2026-08-02')).toBe('2026-07-31');
    expect(resolveNextSigvoosDay(null, '2026-08-01', '2026-08-02')).toBe('2026-08-02');
    expect(resolveNextSigvoosDay('2026-08-02', null, '2026-08-02')).toBeNull();
  });

  it('limita catch-up a sete dias e permite retomada em qualquer execução da hora', () => {
    expect(resolveNextSigvoosDay('2026-06-01', null, '2026-08-02')).toBe('2026-07-26');
    expect(shouldRunSigvoosAtCurrentHour('19', new Date('2026-08-02T19:50:00.000Z'))).toBe(true);
    expect(shouldRunSigvoosAtCurrentHour('19', new Date('2026-08-02T20:00:00.000Z'))).toBe(false);
  });
});
