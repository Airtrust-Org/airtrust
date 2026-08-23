import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  runSigvoosShadowIngestion,
  SigvoosShadowConcurrentRunError,
  SigvoosShadowTenantRequiredError,
  type SigvoosShadowDeps,
} from '../../services/sigvoos-shadow-service';
import { classifyShadowComparison } from '../../lib/sigvoos/sigvoos-shadow-compare';
import type { SigvoosSyncClient } from '../../services/sigvoos-frms';

const testDir = dirname(fileURLToPath(import.meta.url));
const migration0467Sql = readFileSync(join(testDir, '../../../migrations/0467_sigvoos_shadow_parallel_v1.sql'), 'utf8');
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function sqlString(value: unknown): string {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function interpolate(sql: string, args: unknown[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => sqlString(args[index++]));
}

function runSql(databasePath: string, sql: string) {
  const result = spawnSync('sqlite3', [databasePath], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function queryJson<T>(databasePath: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', databasePath, sql], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

function createSqliteD1(): D1Database {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-sigvoos-shadow-'));
  const databasePath = join(tempDir, 'shadow.sqlite');
  tempDirs.push(tempDir);

  runSql(databasePath, 'PRAGMA foreign_keys = ON;');
  runSql(databasePath, migration0467Sql);
  runSql(
    databasePath,
    `
      CREATE TABLE integracoes_sigvoos_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER,
        chave TEXT NOT NULL,
        valor TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      );

      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        matricula TEXT,
        codigo_anac TEXT,
        funcao TEXT,
        cargo TEXT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE sigvoos_mapeamento_manual (
        id TEXT PRIMARY KEY,
        empresa_id INTEGER,
        nome_sigvoos TEXT NOT NULL,
        canac_sigvoos TEXT,
        inscricao_sigvoos TEXT,
        funcionario_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE integracoes_sigvoos_mapeamentos (
        id TEXT PRIMARY KEY,
        empresa_id INTEGER,
        nome_sigvoos TEXT NOT NULL,
        canac_sigvoos TEXT,
        funcionario_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE frms_jornada (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        origem TEXT,
        deleted_at TEXT
      );

      CREATE TABLE frms_alerta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      INSERT INTO funcionarios (id, nome, matricula, codigo_anac, funcao, cargo, empresa_id)
      VALUES (501, 'Piloto Um', 'MAT-1', 'CANAC-1', 'COMANDANTE', 'PILOTO', 10);
    `,
  );

  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return statement;
        },
        first: async <T = unknown>() => {
          const rows = queryJson<T>(databasePath, interpolate(sql, binds));
          return rows[0] || null;
        },
        all: async <T = unknown>() => ({ results: queryJson<T>(databasePath, interpolate(sql, binds)) }),
        run: async () => {
          runSql(databasePath, interpolate(sql, binds));
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function makeClient(pages: Array<Record<string, unknown>[]>): SigvoosSyncClient {
  let call = 0;
  return {
    authenticate: async () => 'TEST-TOKEN',
    postSearch: async () => {
      const items = pages[call] ?? [];
      call += 1;
      return { data: items };
    },
  };
}

function rawLeg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    staff: { id: 'STAFF-1', canac: 'CANAC-1', name: 'Piloto Um' },
    flight_report: { id: 'FR-100', aircraft: { registration: 'PT-ABC' } },
    flight_report_leg: {
      number: 1,
      departure_location: { icao_code: 'SBGR' },
      arrival_location: { icao_code: 'SBSP' },
      engine_start_time_str: '10:00',
      engine_shutoff_time_str: '12:00',
      landing_time_str: '11:50',
      navigation_time_str: '1:50',
      night_time_str: '0:00',
      ifr_time_str: '0:00',
      day_landings: 1,
      night_landings: 0,
      starts: 1,
    },
    date: '2026-08-01',
    ...overrides,
  };
}

const NO_NETWORK_CLIENT: SigvoosSyncClient = {
  authenticate: async () => {
    throw new Error('REAL_NETWORK_REACHED');
  },
  postSearch: async () => {
    throw new Error('REAL_NETWORK_REACHED');
  },
};

describe('sigvoos-shadow-service: identity + idempotency', () => {
  it('1. processes the same payload twice without creating duplicate shadow legs', async () => {
    const db = createSqliteD1();
    const deps: SigvoosShadowDeps = { createClient: () => makeClient([[rawLeg()], [], [rawLeg()], []]) };

    await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, deps);
    await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, deps);

    const legs = await db.prepare('SELECT * FROM sigvoos_shadow_legs WHERE empresa_id = 10').all();
    expect(legs.results?.length).toBe(1);
  });

  it('2. same flightReportId+legNumber with changed content marks SOURCE_CHANGED and keeps history', async () => {
    const db = createSqliteD1();
    const depsV1: SigvoosShadowDeps = { createClient: () => makeClient([[rawLeg()], []]) };
    await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, depsV1);

    const depsV2: SigvoosShadowDeps = {
      createClient: () => makeClient([[rawLeg({ flight_report_leg: { ...rawLeg().flight_report_leg as object, landing_time_str: '11:55' } })], []]),
    };
    await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, depsV2);

    const legs = await db.prepare('SELECT * FROM sigvoos_shadow_legs WHERE empresa_id = 10').all<{ source_state: string }>();
    expect(legs.results?.length).toBe(1);
    expect(legs.results?.[0].source_state).toBe('SOURCE_CHANGED');

    const history = await db.prepare("SELECT * FROM sigvoos_shadow_leg_history WHERE empresa_id = 10 AND transition = 'SOURCE_CHANGED'").all();
    expect(history.results?.length).toBe(1);
    const created = await db.prepare("SELECT * FROM sigvoos_shadow_leg_history WHERE empresa_id = 10 AND transition = 'CREATED'").all();
    expect(created.results?.length).toBe(1);
  });

  it('3. missing flightReportId classifies UNSTABLE_IDENTITY and is not the STABLE identity path', async () => {
    const db = createSqliteD1();
    const deps: SigvoosShadowDeps = {
      createClient: () => makeClient([[rawLeg({ flight_report: { id: null, aircraft: { registration: 'PT-ABC' } } })], []]),
    };
    await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, deps);

    const legs = await db.prepare('SELECT * FROM sigvoos_shadow_legs WHERE empresa_id = 10').all<{ external_identity_quality: string; identity_key: string }>();
    expect(legs.results?.[0].external_identity_quality).toBe('UNSTABLE_IDENTITY');
    expect(legs.results?.[0].identity_key.startsWith('UNSTABLE::')).toBe(true);

    const comparisons = await db.prepare('SELECT classification FROM sigvoos_shadow_comparisons WHERE empresa_id = 10').all<{ classification: string }>();
    expect(comparisons.results?.[0].classification).toBe('UNSTABLE_IDENTITY');
  });

  it('4. tenant A never reads or writes tenant B shadow data', async () => {
    const db = createSqliteD1();
    const depsA: SigvoosShadowDeps = { createClient: () => makeClient([[rawLeg()], []]) };
    await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, depsA);

    const depsB: SigvoosShadowDeps = {
      createClient: () => makeClient([[rawLeg({ flight_report: { id: 'FR-200', aircraft: { registration: 'PT-XYZ' } } })], []]),
    };
    await runSigvoosShadowIngestion(db, 20, { from: '2026-08-01', to: '2026-08-01' }, {}, depsB);

    const legsA = await db.prepare('SELECT * FROM sigvoos_shadow_legs WHERE empresa_id = 10').all();
    const legsB = await db.prepare('SELECT * FROM sigvoos_shadow_legs WHERE empresa_id = 20').all();
    expect(legsA.results?.length).toBe(1);
    expect(legsB.results?.length).toBe(1);

    const crossLeak = await db.prepare('SELECT * FROM sigvoos_shadow_legs WHERE empresa_id = 10 AND flight_report_id = "FR-200"').all();
    expect(crossLeak.results?.length).toBe(0);
  });

  it('5. unmapped crew member classifies UNMAPPED_CREW and is visible in the comparator', async () => {
    const db = createSqliteD1();
    const deps: SigvoosShadowDeps = {
      createClient: () => makeClient([[rawLeg({ staff: { id: 'STAFF-9', canac: 'CANAC-UNKNOWN', name: 'Ninguem Cadastrado' } })], []]),
    };
    const summary = await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, deps);

    expect(summary.unmapped).toBe(1);
    const comparisons = await db.prepare('SELECT classification FROM sigvoos_shadow_comparisons WHERE empresa_id = 10').all<{ classification: string }>();
    expect(comparisons.results?.[0].classification).toBe('UNMAPPED_CREW');
  });

  it('6. missing timezone resolution classifies TIMEZONE_UNRESOLVED with no invented conversion', async () => {
    const db = createSqliteD1();
    const deps: SigvoosShadowDeps = { createClient: () => makeClient([[rawLeg()], []]) };
    // No resolveTimezone provided at all -> must default closed to TIMEZONE_UNRESOLVED.
    await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, deps);

    const legs = await db.prepare('SELECT timezone_status FROM sigvoos_shadow_legs WHERE empresa_id = 10').all<{ timezone_status: string }>();
    expect(legs.results?.[0].timezone_status).toBe('TIMEZONE_UNRESOLVED');
    const comparisons = await db.prepare('SELECT classification FROM sigvoos_shadow_comparisons WHERE empresa_id = 10').all<{ classification: string }>();
    expect(comparisons.results?.[0].classification).toBe('TIMEZONE_UNRESOLVED');
  });

  it('7. manual CV conflict blocks with MANUAL_CONFLICT and never overwrites', async () => {
    const db = createSqliteD1();
    const deps: SigvoosShadowDeps = {
      createClient: () => makeClient([[rawLeg()], []]),
    };
    const summary = await runSigvoosShadowIngestion(
      db,
      10,
      { from: '2026-08-01', to: '2026-08-01', resolveTimezone: () => 'America/Sao_Paulo', detectManualConflict: () => true },
      {},
      deps,
    );
    expect(summary.classifications.MANUAL_CONFLICT).toBe(1);
    // The shadow leg row itself is still written (evidence preserved) — it's the
    // classification, not the persistence, that blocks silent overwrite.
    const legs = await db.prepare('SELECT * FROM sigvoos_shadow_legs WHERE empresa_id = 10').all();
    expect(legs.results?.length).toBe(1);
  });

  it('8. external cancellation/removal never hard-deletes — marks MISSING_FROM_SOURCE', async () => {
    const db = createSqliteD1();
    const depsV1: SigvoosShadowDeps = { createClient: () => makeClient([[rawLeg()], []]) };
    await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, depsV1);

    const depsV2: SigvoosShadowDeps = { createClient: () => makeClient([[], []]) };
    await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, depsV2);

    const legs = await db.prepare('SELECT * FROM sigvoos_shadow_legs WHERE empresa_id = 10').all<{ source_state: string; deleted_at: string | null }>();
    expect(legs.results?.length).toBe(1);
    expect(legs.results?.[0].source_state).toBe('MISSING_FROM_SOURCE');
    expect(legs.results?.[0].deleted_at).toBeNull();
  });

  it('9. retry after a failure converges without duplicating', async () => {
    const db = createSqliteD1();
    let firstCall = true;
    const flakyDeps: SigvoosShadowDeps = {
      createClient: () => ({
        authenticate: async () => 'TOKEN',
        postSearch: async (_endpoint: string, payload: Record<string, unknown>) => {
          if (firstCall && Number(payload.page) === 1) {
            firstCall = false;
            throw new Error('TRANSIENT_NETWORK_ERROR');
          }
          return Number(payload.page) === 1 ? { data: [rawLeg()] } : { data: [] };
        },
      }),
    };

    const first = await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, flakyDeps);
    expect(first.status).toBe('FAILED');

    const retryDeps: SigvoosShadowDeps = { createClient: () => makeClient([[rawLeg()], []]) };
    const second = await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, retryDeps);
    expect(second.status).toBe('COMPLETE');

    const legs = await db.prepare('SELECT * FROM sigvoos_shadow_legs WHERE empresa_id = 10').all();
    expect(legs.results?.length).toBe(1);
  });

  it('10. checkpoint does not advance before the unit is persisted and compared', async () => {
    const db = createSqliteD1();
    const deps: SigvoosShadowDeps = { createClient: () => makeClient([[rawLeg()], []]) };
    const summary = await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, deps);

    const run = await db.prepare('SELECT cursor_json FROM sigvoos_shadow_runs WHERE id = ?').bind(summary.runId).first<{ cursor_json: string }>();
    const cursor = JSON.parse(run!.cursor_json);
    expect(cursor.processed).toBe(1);

    const legCount = (await db.prepare('SELECT COUNT(*) as c FROM sigvoos_shadow_legs WHERE empresa_id = 10').first<{ c: number }>())!.c;
    const comparisonCount = (await db.prepare('SELECT COUNT(*) as c FROM sigvoos_shadow_comparisons WHERE empresa_id = 10').first<{ c: number }>())!.c;
    expect(legCount).toBe(1);
    expect(comparisonCount).toBe(1);
  });

  it('11. a partial run (one leg fails to persist) is never marked COMPLETE', async () => {
    const inner = createSqliteD1();
    // Wrap the D1 so the INSERT for one specific identity (FR-FAIL) throws,
    // simulating a real per-unit persistence failure mid-run, while the
    // other leg in the same run persists and compares successfully.
    const db: D1Database = {
      prepare(sql: string) {
        const stmt = inner.prepare(sql);
        return {
          bind: (...args: unknown[]) => {
            const bound = stmt.bind(...args);
            return {
              first: bound.first.bind(bound),
              all: bound.all.bind(bound),
              run: async () => {
                if (sql.includes('INSERT INTO sigvoos_shadow_legs') && args.includes('FR-FAIL')) {
                  throw new Error('SIMULATED_PERSISTENCE_FAILURE');
                }
                return bound.run();
              },
            };
          },
          first: stmt.first.bind(stmt),
          all: stmt.all.bind(stmt),
          run: stmt.run.bind(stmt),
        };
      },
    } as unknown as D1Database;

    const deps: SigvoosShadowDeps = {
      createClient: () =>
        makeClient([
          [rawLeg(), rawLeg({ flight_report: { id: 'FR-FAIL', aircraft: { registration: 'PT-FAIL' } } })],
          [],
        ]),
    };
    const summary = await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, deps);

    expect(summary.status).toBe('PARTIAL');
    expect(summary.failed).toBe(1);
    expect(summary.processed).toBe(1);
  });

  it('12. concurrent runs for the same tenant/period fail closed instead of crossing state', async () => {
    const db = createSqliteD1();
    await db
      .prepare(
        `INSERT INTO sigvoos_shadow_runs (id, empresa_id, period_from, period_to, execution_mode, source, status, attempted_count, processed_count, failed_count, unmapped_count, started_at, created_at, updated_at)
         VALUES ('existing-run', 10, '2026-08-01', '2026-08-01', 'SHADOW', 'SIGVOOS', 'RUNNING', 0,0,0,0, '2026-08-01 00:00:00','2026-08-01 00:00:00','2026-08-01 00:00:00')`,
      )
      .run();

    const deps: SigvoosShadowDeps = { createClient: () => makeClient([[rawLeg()], []]) };
    await expect(
      runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, deps),
    ).rejects.toThrow(SigvoosShadowConcurrentRunError);
  });

  it('13. shadow requires an explicit tenant and fails closed without one (path A untouched)', async () => {
    const db = createSqliteD1();
    const deps: SigvoosShadowDeps = { createClient: () => makeClient([[rawLeg()], []]) };
    await expect(runSigvoosShadowIngestion(db, null, { from: '2026-08-01', to: '2026-08-01' }, {}, deps)).rejects.toThrow(
      SigvoosShadowTenantRequiredError,
    );
    await expect(runSigvoosShadowIngestion(db, undefined, { from: '2026-08-01', to: '2026-08-01' }, {}, deps)).rejects.toThrow(
      SigvoosShadowTenantRequiredError,
    );
  });

  it('14. shadow processing creates zero operational frms_jornada/frms_alerta/rolling side effects', async () => {
    const db = createSqliteD1();
    const deps: SigvoosShadowDeps = { createClient: () => makeClient([[rawLeg()], []]) };
    await runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, deps);

    const jornadas = await db.prepare('SELECT COUNT(*) as c FROM frms_jornada').first<{ c: number }>();
    const alertas = await db.prepare('SELECT COUNT(*) as c FROM frms_alerta').first<{ c: number }>();
    expect(jornadas!.c).toBe(0);
    expect(alertas!.c).toBe(0);
  });

  it('15. comparator classifies MATCH and each relevant divergence class deterministically', () => {
    const base = {
      flightReportId: 'FR-1',
      legNumber: 1,
      funcionarioId: '501',
      engineStartTime: '10:00',
      takeoffTime: '10:10',
      landingTime: '11:50',
      engineShutoffTime: '12:00',
      departureIcao: 'SBGR',
      arrivalIcao: 'SBSP',
      dayLandings: 1,
      nightLandings: 0,
      starts: 1,
    };

    expect(
      classifyShadowComparison({
        identityQuality: 'STABLE',
        timezoneStatus: 'RESOLVED',
        crewResolutionMethod: 'CANAC',
        sourceChanged: false,
        manualConflict: false,
        direct: base,
        shadow: { ...base },
      }).classification,
    ).toBe('MATCH');

    expect(
      classifyShadowComparison({
        identityQuality: 'STABLE',
        timezoneStatus: 'RESOLVED',
        crewResolutionMethod: 'CANAC',
        sourceChanged: false,
        manualConflict: false,
        direct: base,
        shadow: { ...base, dayLandings: 2 },
      }).classification,
    ).toBe('DIFF_CRITICAL');

    expect(
      classifyShadowComparison({
        identityQuality: 'STABLE',
        timezoneStatus: 'RESOLVED',
        crewResolutionMethod: 'CANAC',
        sourceChanged: false,
        manualConflict: false,
        direct: base,
        shadow: null,
      }).classification,
    ).toBe('ONLY_DIRECT_PATH');

    expect(
      classifyShadowComparison({
        identityQuality: 'STABLE',
        timezoneStatus: 'RESOLVED',
        crewResolutionMethod: 'CANAC',
        sourceChanged: false,
        manualConflict: false,
        direct: null,
        shadow: base,
      }).classification,
    ).toBe('ONLY_SHADOW_PATH');

    expect(
      classifyShadowComparison({
        identityQuality: 'UNSTABLE_IDENTITY',
        timezoneStatus: 'RESOLVED',
        crewResolutionMethod: 'CANAC',
        sourceChanged: false,
        manualConflict: false,
        direct: base,
        shadow: base,
      }).classification,
    ).toBe('UNSTABLE_IDENTITY');

    expect(
      classifyShadowComparison({
        identityQuality: 'STABLE',
        timezoneStatus: 'RESOLVED',
        crewResolutionMethod: 'NAO_ENCONTRADO',
        sourceChanged: false,
        manualConflict: false,
        direct: base,
        shadow: base,
      }).classification,
    ).toBe('UNMAPPED_CREW');
  });

  it('16. zero real HTTP contact to SIGVOOS anywhere — the real client/fetch is never invoked', async () => {
    const db = createSqliteD1();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const deps: SigvoosShadowDeps = { createClient: () => NO_NETWORK_CLIENT };

    await expect(
      runSigvoosShadowIngestion(db, 10, { from: '2026-08-01', to: '2026-08-01' }, {}, deps),
    ).resolves.toMatchObject({ status: 'FAILED' });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
