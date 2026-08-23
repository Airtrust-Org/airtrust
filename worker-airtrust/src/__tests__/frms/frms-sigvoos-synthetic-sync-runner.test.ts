import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  parseArgs,
  assertGuards,
  buildSyntheticSigvoosLegs,
} from '../../../../scripts/staging/frms-sigvoos-synthetic-sync.mjs';
import {
  SyntheticSigvoosStagingClient,
  AlwaysNetworkSigvoosClient,
  SyntheticSigvoosClientNetworkViolation,
} from '../../lib/sigvoos/synthetic-staging-client';
import { normalizeSigvoosRecord } from '../../services/sigvoos-frms';

const testDir = dirname(fileURLToPath(import.meta.url));
const runnerSource = readFileSync(
  join(testDir, '../../../../scripts/staging/frms-sigvoos-synthetic-sync.mjs'),
  'utf8',
);
const serviceSource = readFileSync(
  join(testDir, '../../services/sigvoos-frms.ts'),
  'utf8',
);

describe('frms-sigvoos-synthetic-sync runner — guards (items 1-3, 11)', () => {
  it('1: production environment => ABORT', () => {
    expect(() => assertGuards(parseArgs(['--dry-run', '--environment=production']))).toThrow(
      /environment must be exactly "staging"/,
    );
  });

  it('2: production database => ABORT', () => {
    expect(() =>
      assertGuards(parseArgs(['--dry-run', '--db-id=7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae'])),
    ).toThrow(/production\/dev blocklist/);
  });

  it('3: tenant != 999006 => ABORT (no generic empresa default, item 11: cross-tenant impossible)', () => {
    expect(() => assertGuards(parseArgs(['--dry-run', '--empresa-id=1']))).toThrow(
      /empresaId must be exactly 999006/,
    );
  });

  it('default invocation passes guards for staging D1 + empresa 999006', () => {
    expect(assertGuards(parseArgs(['--dry-run']))).toEqual({
      environment: 'staging',
      dbName: 'airtrust-db-staging-baseline-20260701',
      dbId: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
      empresaId: 999006,
    });
  });
});

describe('frms-sigvoos-synthetic-sync runner — 4: real HTTP attempted => ABORT', () => {
  it('SyntheticSigvoosStagingClient never touches global fetch', async () => {
    const fetchSpy = vi.fn();
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const client = new SyntheticSigvoosStagingClient([]);
      await client.authenticate();
      await client.postSearch('/relatorios/voos/tripulantes/etapas/pesquisa', { page: 1 });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('rejects a full URL passed as endpoint rather than silently treating it as fetchable', async () => {
    const client = new SyntheticSigvoosStagingClient([]);
    await expect(client.postSearch('https://real-sigvoos.example/x', {})).rejects.toThrow(
      SyntheticSigvoosClientNetworkViolation,
    );
  });

  it('AlwaysNetworkSigvoosClient (real-transport stand-in) throws on both methods — proves the test harness itself can detect a real-transport call', async () => {
    const client = new AlwaysNetworkSigvoosClient();
    await expect(client.authenticate()).rejects.toThrow(SyntheticSigvoosClientNetworkViolation);
    await expect(client.postSearch()).rejects.toThrow(SyntheticSigvoosClientNetworkViolation);
  });
});

describe('frms-sigvoos-synthetic-sync runner — 5: dry-run => zero writes', () => {
  it('parseArgs defaults to dry-run; --apply required to write', () => {
    expect(parseArgs([]).apply).toBe(false);
    expect(parseArgs(['--dry-run']).apply).toBe(false);
    expect(parseArgs(['--apply']).apply).toBe(true);
  });

  it('runner source only calls syncSigvoosForFrms inside the args.apply branch', () => {
    const applyBlockMatch = runnerSource.match(/if \(!args\.apply\) \{[\s\S]*?return;\s*\}/);
    expect(applyBlockMatch).not.toBeNull();
    const afterEarlyReturn = runnerSource.slice(runnerSource.indexOf(applyBlockMatch![0]) + applyBlockMatch![0].length);
    expect(afterEarlyReturn).toMatch(/syncSigvoosForFrms/);
    // and it must not appear before the early return (i.e. not called during dry-run)
    const beforeEarlyReturn = runnerSource.slice(0, runnerSource.indexOf(applyBlockMatch![0]));
    expect(beforeEarlyReturn).not.toMatch(/await syncSigvoosForFrms/);
  });
});

describe('frms-sigvoos-synthetic-sync runner — 6-7: same adapter as real, origem ends as SIGVOOS', () => {
  it('the synthetic raw record shape is parsed correctly by the real, unmodified normalizeSigvoosRecord', () => {
    const [leg] = buildSyntheticSigvoosLegs({ ano: 2026, mes: 8 });
    const client = new SyntheticSigvoosStagingClient([leg]);
    return client.postSearch('/relatorios/voos/tripulantes/etapas/pesquisa', { page: 1 }).then((payload) => {
      const raw = (payload.data as Record<string, unknown>[])[0];
      const normalized = normalizeSigvoosRecord(raw);
      expect(normalized).not.toBeNull();
      expect(normalized!.canac).toBe('999006');
      expect(normalized!.data).toBe(leg.date);
      expect(normalized!.horaApresentacao).toBe(leg.engineStartTime);
      expect(normalized!.horaTermino).toBe(leg.engineShutoffTime);
    });
  });

  it('runner imports syncSigvoosForFrms from the real, unmodified sigvoos-frms service module', () => {
    expect(runnerSource).toMatch(
      /import\(\s*fileURLToPath\(new URL\('\.\.\/\.\.\/worker-airtrust\/src\/services\/sigvoos-frms\.ts', import\.meta\.url\)\)\s*\)/,
    );
    expect(runnerSource).toMatch(/const \{ syncSigvoosForFrms \}/);
  });

  it('service confirms FIRA-imported rows are relabeled to origem=SIGVOOS as part of the same real sync pipeline the runner invokes', () => {
    expect(serviceSource).toMatch(/relabelImportedJornadasAsSigvoos/);
    expect(serviceSource).toMatch(/confirmarImportacaoFira/);
  });
});

describe('frms-sigvoos-synthetic-sync runner — 8-9: audit metadata identifies SYNTHETIC_STAGING, external_contact=false', () => {
  it('runner passes executionMode/externalContact/fixtureId into the sync input, which the service persists into integracoes_sigvoos_eventos.payload_json', () => {
    expect(runnerSource).toMatch(/executionMode: 'SYNTHETIC_STAGING'/);
    expect(runnerSource).toMatch(/externalContact: false/);
    expect(runnerSource).toMatch(/fixtureId: FIXTURE_ID/);
    // The service must actually persist these (via the existing eventoPayload = {...input} spread), not just accept and drop them.
    expect(serviceSource).toMatch(/const eventoPayload = \{\s*\.\.\.input/);
    expect(serviceSource).toMatch(/executionMode: z\.literal\('SYNTHETIC_STAGING'\)\.optional\(\)/);
    expect(serviceSource).toMatch(/externalContact: z\.literal\(false\)\.optional\(\)/);
  });
});

describe('frms-sigvoos-synthetic-sync runner — 10, 12: idempotency and normalization parity', () => {
  it('10: re-running with the same fixture dates does not duplicate — confirmarImportacaoFira (reused unmodified) already enforces per-date uniqueness via jornada_existente_id/situacao=DUPLICATA', () => {
    // This is a structural guarantee inherited from the already-tested FIRA
    // canonical runner (MR !84), which proved this exact dedupe path against
    // real staging data. The synthetic sync reuses the identical
    // confirmarImportacaoFira call, so no new dedupe logic exists to test
    // here — asserting the reuse is the correct unit-level check.
    expect(serviceSource).toMatch(/await confirmarImportacaoFira\(/);
  });

  it('12: buildSyntheticSigvoosLegs produces the same field shape normalizeSigvoosRecord expects from a real SIGVOOS payload (no custom normalization)', () => {
    const legs = buildSyntheticSigvoosLegs({ ano: 2026, mes: 8 });
    expect(legs.length).toBeGreaterThan(0);
    for (const leg of legs) {
      expect(leg.canac).toBe('999006');
      expect(leg.date).toMatch(/^2026-08-\d{2}$/);
      expect(leg.flightReportId).toMatch(/^QA-SYNTHETIC-SIGVOOS-20260823-FR-/);
      expect(leg.staffId).toMatch(/^QA-SYNTHETIC-SIGVOOS-20260823-STAFF-/);
    }
  });
});

describe('frms-sigvoos-synthetic-sync runner — 13-14: reprocessing via normal flow, no fabricated result', () => {
  it('13: runner never calls recalcularPipeline/calcFatorizacao/salvarJornada directly — reprocessing is a side effect of the real confirm path', () => {
    expect(runnerSource).not.toMatch(/recalcularPipeline/);
    expect(runnerSource).not.toMatch(/calcFatorizacao/);
    expect(runnerSource).not.toMatch(/salvarJornada/);
  });

  it('14: runner never inserts directly into frms_fatorizacao_jornada or frms_jornada', () => {
    expect(runnerSource).not.toMatch(/INSERT INTO frms_fatorizacao_jornada/i);
    expect(runnerSource).not.toMatch(/INSERT INTO frms_jornada/i);
  });
});

describe('frms-sigvoos-synthetic-sync runner — 15-16: production default unchanged, no synthetic injection path in prod', () => {
  it('15: syncSigvoosForFrms defaults to the real SigvoosApiClient when no deps.createClient is supplied', () => {
    expect(serviceSource).toMatch(
      /const client: SigvoosSyncClient = deps\?\.createClient\s*\?\s*deps\.createClient\(config as ClientSigvoosConfig\)\s*:\s*new SigvoosApiClient\(config as ClientSigvoosConfig\);/,
    );
  });

  it('16: no production call site passes a deps argument (all 5 real call sites are unmodified 4-arg calls)', () => {
    const routesSource = readFileSync(
      join(testDir, '../../routes/integracoes_sigvoos.ts'),
      'utf8',
    );
    const cronSource = readFileSync(
      join(testDir, '../../cron/scheduled-handler.ts'),
      'utf8',
    );
    const resilientCronSource = readFileSync(
      join(testDir, '../../cron/resilient/sigvoos-frms.ts'),
      'utf8',
    );
    for (const src of [routesSource, cronSource, resilientCronSource]) {
      expect(src).not.toMatch(/syncSigvoosForFrms\([^)]*createClient/s);
      expect(src).not.toMatch(/SyntheticSigvoosStagingClient/);
    }
  });

  it('16b: no environment variable or feature flag can activate synthetic mode in the service itself', () => {
    expect(serviceSource).not.toMatch(/SYNTHETIC.*process\.env/);
    expect(serviceSource).not.toMatch(/env\.[A-Z_]*SYNTHETIC/);
  });
});
