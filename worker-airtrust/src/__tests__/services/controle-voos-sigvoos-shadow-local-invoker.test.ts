import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { invokeSigvoosShadowLocal } from '../../services/controle-voos/sigvoos-shadow-local-invoker';

type SqliteD1 = D1Database & {
  databasePath: string;
  queryJson: <T>(sql: string) => T[];
};

const tempDirs: string[] = [];
const testDir = dirname(fileURLToPath(import.meta.url));
const migration0410Sql = readFileSync(join(testDir, '../../../migrations/0410_controle_voos_n1_schema.sql'), 'utf8');
const migration0411Sql = readFileSync(
  join(testDir, '../../../migrations/0411_controle_voos_sigvoos_integration_schema.sql'),
  'utf8',
);
const fixturesDir = join(testDir, '../fixtures/sigvoos');
const invokerPath = join(testDir, '../../services/controle-voos/sigvoos-shadow-local-invoker.ts');

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
  const result = spawnSync('sqlite3', [databasePath], {
    input: sql,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function queryJson<T>(databasePath: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', databasePath, sql], {
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

function createSqliteD1(): SqliteD1 {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-cv-sigvoos-shadow-invoker-'));
  const databasePath = join(tempDir, 'invoker.sqlite');
  tempDirs.push(tempDir);

  runSql(databasePath, 'PRAGMA foreign_keys = ON;');
  runSql(databasePath, migration0410Sql);
  runSql(databasePath, migration0411Sql);
  runSql(
    databasePath,
    `
      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        matricula TEXT,
        codigo_anac TEXT,
        empresa_id INTEGER NOT NULL,
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
    `,
  );

  seedCatalogs(databasePath, 6);
  seedCatalogs(databasePath, 7);
  seedFuncionarios(databasePath);

  return {
    databasePath,
    queryJson: <T>(sql: string) => queryJson<T>(databasePath, sql),
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
        all: async <T = unknown>() => ({
          results: queryJson<T>(databasePath, interpolate(sql, binds)),
        }),
        run: async () => {
          runSql(databasePath, interpolate(sql, binds));

          const insertMatch = sql.match(/INSERT INTO\s+([a-zA-Z0-9_]+)/i);
          let lastId = 0;
          if (insertMatch) {
            const tableName = insertMatch[1];
            const row = queryJson<{ id: number }>(databasePath, `SELECT id FROM ${tableName} ORDER BY id DESC LIMIT 1`)[0];
            lastId = Number(row?.id || 0);
          }

          return { meta: { changes: 1, last_row_id: lastId } };
        },
      };
      return statement;
    },
  } as unknown as SqliteD1;
}

function seedCatalogs(databasePath: string, empresaId: number) {
  const origemId = empresaId * 1000 + 101;
  const destinoId = empresaId * 1000 + 102;
  const terceiraId = empresaId * 1000 + 103;
  const quartaId = empresaId * 1000 + 104;
  const tipoId = empresaId * 1000 + 201;
  const naturezaId = empresaId * 1000 + 301;
  const motivoId = empresaId * 1000 + 401;

  runSql(
    databasePath,
    `
      INSERT INTO cv_aeroportos (id, empresa_id, codigo, codigo_icao, nome, tipo, ativo, ordem)
      VALUES
        (${origemId}, ${empresaId}, 'SBRJ', 'SBRJ', 'Santos Dumont ${empresaId}', 'aeroporto', 1, 1),
        (${destinoId}, ${empresaId}, 'SBSP', 'SBSP', 'Congonhas ${empresaId}', 'aeroporto', 1, 2),
        (${terceiraId}, ${empresaId}, 'SBMI', 'SBMI', 'Macae ${empresaId}', 'aeroporto', 1, 3),
        (${quartaId}, ${empresaId}, 'SBJR', 'SBJR', 'Jacarepagua ${empresaId}', 'aeroporto', 1, 4);

      INSERT INTO cv_tipos_voo (id, empresa_id, codigo, nome, ativo, ordem)
      VALUES (${tipoId}, ${empresaId}, 'REG', 'Regular ${empresaId}', 1, 1);

      INSERT INTO cv_naturezas_voo (id, empresa_id, codigo, nome, ativo, ordem)
      VALUES (${naturezaId}, ${empresaId}, 'PAX', 'Passageiro ${empresaId}', 1, 1);

      INSERT INTO cv_motivos_operacionais (id, empresa_id, codigo, nome, tipo, ativo, ordem)
      VALUES (${motivoId}, ${empresaId}, 'WX', 'Meteorologia ${empresaId}', 'atraso', 1, 1);
    `,
  );
}

function seedFuncionarios(databasePath: string) {
  runSql(
    databasePath,
    `
      INSERT INTO funcionarios (id, nome, matricula, codigo_anac, empresa_id, deleted_at)
      VALUES
        (6001, 'Tripulante Um', '01234', '90001', 6, NULL),
        (6002, 'Tripulante Dois', '04567', '90002', 6, NULL),
        (6003, 'Tripulante Tres', '00252', '90003', 6, NULL),
        (6004, 'Tripulante Quatro', '07890', '90004', 6, NULL),
        (7001, 'Tripulante Tenant B', '01234', '99001', 7, NULL);
    `,
  );
}

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as T;
}

function writeTempFile(name: string, contents: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-cv-sigvoos-shadow-input-'));
  const absolutePath = join(tempDir, name);
  tempDirs.push(tempDir);
  writeFileSync(absolutePath, contents, 'utf8');
  return absolutePath;
}

afterAll(() => {
  for (const tempDir of tempDirs) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('controle-voos sigvoos shadow local invoker', () => {
  it('processes multiple local fixtures, returns a local shadow report and stays idempotent on the second run', async () => {
    const db = createSqliteD1();
    const inputs = [
      join(fixturesDir, 'sigvoos-multileg-flight-report-id.json'),
      join(fixturesDir, 'sigvoos-com-flight-report-id.json'),
    ];

    const first = await invokeSigvoosShadowLocal(db, 6, inputs);
    const second = await invokeSigvoosShadowLocal(db, 6, inputs);

    expect(first.mode).toBe('LOCAL_SHADOW');
    expect(first.totalFiles).toBe(2);
    expect(first.loadedFiles).toBe(2);
    expect(first.failedFiles).toBe(0);
    expect(first.runnerSummary.totalPayloads).toBe(2);
    expect(first.runnerSummary.processedPayloads).toBe(2);
    expect(first.runnerSummary.failedPayloads).toBe(0);
    expect(first.fileResults.map((result) => result.loadStatus)).toEqual(['LOADED', 'LOADED']);
    expect(first.fileResults.map((result) => result.runnerStatus)).toEqual(['PROCESSED', 'PROCESSED']);

    expect(second.totalFiles).toBe(2);
    expect(second.loadedFiles).toBe(2);
    expect(second.failedFiles).toBe(0);
    expect(second.runnerSummary.totalPayloads).toBe(2);
    expect(second.runnerSummary.reusedPayloads).toBe(2);
    expect(second.runnerSummary.reusedRecords).toBeGreaterThan(0);
    expect(second.fileResults.map((result) => result.runnerStatus)).toEqual(['REUSED', 'REUSED']);
  });

  it('rejects external URLs and unsafe local paths unless the explicit dev-only flag is enabled', async () => {
    const db = createSqliteD1();
    const externalPath = writeTempFile(
      'sigvoos-dev-only.json',
      JSON.stringify(readFixture<Record<string, unknown>>('sigvoos-com-flight-report-id.json')),
    );

    const blocked = await invokeSigvoosShadowLocal(db, 6, ['https://example.com/sigvoos.json', externalPath]);

    expect(blocked.totalFiles).toBe(2);
    expect(blocked.loadedFiles).toBe(0);
    expect(blocked.failedFiles).toBe(2);
    expect(blocked.runnerSummary.totalPayloads).toBe(0);
    expect(blocked.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['EXTERNAL_URL_REJECTED', 'UNSAFE_LOCAL_PATH_REJECTED', 'NO_PAYLOADS_LOADED']),
    );

    const allowed = await invokeSigvoosShadowLocal(db, 6, [externalPath], {
      allowUnsafeLocalPathForDevOnly: true,
    });

    expect(allowed.totalFiles).toBe(1);
    expect(allowed.loadedFiles).toBe(1);
    expect(allowed.failedFiles).toBe(0);
    expect(allowed.runnerSummary.totalPayloads).toBe(1);
    expect(allowed.runnerSummary.processedPayloads).toBe(1);
    expect(allowed.fileResults[0]?.runnerStatus).toBe('PROCESSED');
  });

  it('handles invalid JSON as a controlled warning and preserves tenant isolation without network or FRMS side effects', async () => {
    const db = createSqliteD1();
    const validFixturePath = join(fixturesDir, 'sigvoos-com-flight-report-id.json');
    const tenantFixture = readFixture<Record<string, unknown>>('sigvoos-com-flight-report-id.json');
    const invalidJsonPath = writeTempFile('sigvoos-invalid.json', '{"broken": ');
    const source = readFileSync(invokerPath, 'utf8');
    const fetchSpy = vi.fn(async () => {
      throw new Error('NETWORK_NOT_ALLOWED');
    });
    const originalFetch = globalThis.fetch;

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchSpy,
      writable: true,
    });

    try {
      const report = await invokeSigvoosShadowLocal(
        db,
        6,
        [
          validFixturePath,
          invalidJsonPath,
          {
            label: 'tenant-b-inline',
            empresaId: 7,
            actorUserId: 20,
            payload: {
              ...tenantFixture,
              staff: {
                id: 9901,
                name: 'TRIPULANTE_SIG_B',
                inscription: '01234',
              },
            },
          },
        ],
        {
          allowUnsafeLocalPathForDevOnly: true,
          actorUserId: 10,
        },
      );

      expect(report.mode).toBe('LOCAL_SHADOW');
      expect(report.totalFiles).toBe(3);
      expect(report.loadedFiles).toBe(2);
      expect(report.failedFiles).toBe(1);
      expect(report.runnerSummary.totalPayloads).toBe(2);
      expect(report.runnerSummary.processedPayloads).toBe(2);
      expect(report.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['INVALID_JSON']));
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
        writable: true,
      });
    }

    const flights = db.queryJson<{ empresa_id: number; total: number }>(
      `SELECT empresa_id, COUNT(*) AS total
         FROM cv_voos
        WHERE sigvoos_flight_report_id = 700101
        GROUP BY empresa_id
        ORDER BY empresa_id`,
    );
    expect(flights).toEqual([
      { empresa_id: 6, total: 1 },
      { empresa_id: 7, total: 1 },
    ]);

    const frmsCounts = db.queryJson<{ jornadas: number; alertas: number }>(
      `
        SELECT
          (SELECT COUNT(*) FROM frms_jornada) AS jornadas,
          (SELECT COUNT(*) FROM frms_alerta) AS alertas
      `,
    );
    expect(frmsCounts).toEqual([{ jornadas: 0, alertas: 0 }]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(source).not.toMatch(/frms-source-policy/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
