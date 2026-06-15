import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runSigvoosImporterBatch } from '../../services/controle-voos/sigvoos-importer-runner';

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
const runnerPath = join(testDir, '../../services/controle-voos/sigvoos-importer-runner.ts');

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
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-cv-sigvoos-runner-'));
  const databasePath = join(tempDir, 'runner.sqlite');
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

function seedPreviousStaffIdMapping(databasePath: string, staffId: number, funcionarioId: number) {
  const vooId = 6600;
  runSql(
    databasePath,
    `
      INSERT INTO cv_voos (
        id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
        tipo_voo_id, natureza_voo_id, horario_previsto_partida, horario_previsto_chegada,
        status, origem_importacao, created_by, updated_by
      ) VALUES (
        ${vooId}, 6, 'ATX-MAP', '2026-06-13', 6101, 6102,
        6201, 6301, '2026-06-13T08:00:00', '2026-06-13T09:00:00',
        'planejado', 'SIGVOOS', 10, 10
      );

      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number, origem_icao, destino_icao, origem_dados
      ) VALUES (
        6610, 6, ${vooId}, 1, 1, 'SBRJ', 'SBSP', 'SIGVOOS'
      );

      INSERT INTO cv_voo_tripulantes (
        id, empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id, created_by, updated_by
      ) VALUES (
        6620, 6, ${vooId}, ${funcionarioId}, 'PIC', 6610, ${staffId}, 10, 10
      );
    `,
  );
}

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as T;
}

afterAll(() => {
  for (const tempDir of tempDirs) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('controle-voos sigvoos importer runner', () => {
  it('runs multiple local fixtures in batch and aggregates metrics per payload', async () => {
    const db = createSqliteD1();
    const multileg = readFixture<{ variants: Record<string, unknown>[] }>('sigvoos-multileg-flight-report-id.json');
    const conflictFixture = readFixture<Record<string, unknown>>('sigvoos-staff-id-inscription-conflict.json');
    const tenantFixture = readFixture<Record<string, unknown>>('sigvoos-com-flight-report-id.json');
    seedPreviousStaffIdMapping(db.databasePath, 8899, 6002);

    const report = await runSigvoosImporterBatch(
      db,
      6,
      [
        { label: 'multileg', payload: multileg },
        { label: 'conflict', payload: conflictFixture },
        {
          label: 'tenant-b',
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
      { actorUserId: 10 },
    );

    expect(report.totalPayloads).toBe(3);
    expect(report.processedPayloads).toBe(3);
    expect(report.reusedPayloads).toBe(0);
    expect(report.failedPayloads).toBe(0);
    expect(report.processedRecords).toBe(3);
    expect(report.conflictRecords).toBe(1);
    expect(report.reusedStages).toBe(0);
    expect(report.createdFlights).toBe(3);
    expect(report.updatedFlights).toBe(1);
    expect(report.createdEtapas).toBe(4);
    expect(report.updatedEtapas).toBe(0);
    expect(report.createdTripulantes).toBe(3);
    expect(report.updatedTripulantes).toBe(0);
    expect(report.resolvedTripulantes).toBe(3);
    expect(report.createdConflicts).toBe(1);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]).toMatchObject({
      label: 'conflict',
      field: 'funcionario_id',
      justification: 'staff.id e staff.inscription resolvidos para funcionarios diferentes',
      severity: 'MEDIA',
      status: 'ABERTO',
    });
    expect(report.warnings.map((warning) => warning.code)).toContain('PAYLOAD_CONFLICT');

    expect(report.byPayload.map((payload) => ({ label: payload.label, status: payload.status }))).toEqual([
      { label: 'multileg', status: 'PROCESSED' },
      { label: 'conflict', status: 'CONFLICT' },
      { label: 'tenant-b', status: 'PROCESSED' },
    ]);
    expect(report.byPayload[0].payloadHashes).toHaveLength(2);
    expect(report.byPayload[0].stageIds).toHaveLength(2);
    expect(report.byPayload[1].conflicts).toHaveLength(1);

    const flights = db.queryJson<{ empresa_id: number; total: number }>(
      `SELECT empresa_id, COUNT(*) AS total
         FROM cv_voos
        WHERE sigvoos_flight_report_id = 700101
        GROUP BY empresa_id
        ORDER BY empresa_id`,
    );
    expect(flights).toEqual([
      { empresa_id: 7, total: 1 },
    ]);
  });

  it('reports reused payloads and reused stages when the batch runs twice', async () => {
    const db = createSqliteD1();
    const multileg = readFixture<{ variants: Record<string, unknown>[] }>('sigvoos-multileg-flight-report-id.json');
    const single = readFixture<Record<string, unknown>>('sigvoos-com-flight-report-id.json');

    const first = await runSigvoosImporterBatch(
      db,
      6,
      [
        { label: 'multileg', payload: multileg },
        { label: 'single', payload: single },
      ],
      { actorUserId: 10 },
    );
    const second = await runSigvoosImporterBatch(
      db,
      6,
      [
        { label: 'multileg', payload: multileg },
        { label: 'single', payload: single },
      ],
      { actorUserId: 10 },
    );

    expect(first.processedPayloads).toBe(2);
    expect(first.reusedPayloads).toBe(0);
    expect(first.createdFlights).toBe(2);
    expect(first.createdEtapas).toBe(3);
    expect(first.createdTripulantes).toBe(3);

    expect(second.processedPayloads).toBe(2);
    expect(second.reusedPayloads).toBe(2);
    expect(second.createdFlights).toBe(0);
    expect(second.updatedFlights).toBe(0);
    expect(second.createdEtapas).toBe(0);
    expect(second.createdTripulantes).toBe(0);
    expect(second.processedRecords).toBe(0);
    expect(second.reusedRecords).toBe(3);
    expect(second.reusedStages).toBe(3);
    expect(second.byPayload.map((payload) => payload.status)).toEqual(['REUSED', 'REUSED']);
    expect(second.warnings.filter((warning) => warning.code === 'PAYLOAD_REUSED')).toHaveLength(2);

    const stages = db.queryJson<{ import_status: string; tentativas: number }>(
      `SELECT import_status, tentativas
         FROM cv_sigvoos_staging
        WHERE empresa_id = 6
        ORDER BY id`,
    );
    expect(stages).toHaveLength(3);
    expect(stages.every((row) => row.import_status === 'PROCESSED')).toBe(true);
    expect(stages.every((row) => row.tentativas === 2)).toBe(true);
  });

  it('isolates imports by empresa_id without FRMS writes, network calls or frms-source-policy usage', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<Record<string, unknown>>('sigvoos-com-flight-report-id.json');
    const source = readFileSync(runnerPath, 'utf8');
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
      const report = await runSigvoosImporterBatch(
        db,
        6,
        [
          { label: 'tenant-a', payload: fixture, actorUserId: 10 },
          {
            label: 'tenant-b',
            empresaId: 7,
            actorUserId: 20,
            payload: {
              ...fixture,
              staff: {
                id: 9901,
                name: 'TRIPULANTE_SIG_B',
                inscription: '01234',
              },
            },
          },
        ],
      );

      expect(report.processedPayloads).toBe(2);
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
    expect(source).not.toMatch(/sigvoos-frms/);
  });
});
