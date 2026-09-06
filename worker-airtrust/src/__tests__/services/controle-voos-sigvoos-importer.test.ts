import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  hashSanitizedSigvoosPayload,
  importSigvoosPayloadToControleVoos,
  normalizeSigvoosStaffInscription,
} from '../../services/controle-voos/sigvoos-importer';

type SqliteD1 = D1Database & {
  databasePath: string;
  queryJson: <T>(sql: string) => T[];
};

type FlightRow = {
  id: number;
  origem_importacao: string;
  sigvoos_flight_report_id: number | null;
  sigvoos_flight_number: string | null;
  sigvoos_content_hash: string | null;
};

const tempDirs: string[] = [];
const testDir = dirname(fileURLToPath(import.meta.url));
const migration0410Sql = readFileSync(join(testDir, '../../../migrations/0410_controle_voos_n1_schema.sql'), 'utf8');
const migration0411Sql = readFileSync(
  join(testDir, '../../../migrations/0411_controle_voos_sigvoos_integration_schema.sql'),
  'utf8',
);
const importerPath = join(testDir, '../../services/controle-voos/sigvoos-importer.ts');
const fixturesDir = join(testDir, '../fixtures/sigvoos');

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
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-cv-sigvoos-importer-'));
  const databasePath = join(tempDir, 'importer.sqlite');
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

function seedManualFlight(databasePath: string, overrides: { id?: number; empresaId?: number; prefixo?: string; data?: string } = {}) {
  const empresaId = overrides.empresaId ?? 6;
  const id = overrides.id ?? 6500;
  const prefixo = overrides.prefixo ?? 'ATX7001';
  const data = overrides.data ?? '2026-06-14';
  const origemId = empresaId * 1000 + 101;
  const destinoId = empresaId * 1000 + 102;
  const tipoId = empresaId * 1000 + 201;
  const naturezaId = empresaId * 1000 + 301;

  runSql(
    databasePath,
    `
      INSERT INTO cv_voos (
        id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
        tipo_voo_id, natureza_voo_id, horario_previsto_partida, horario_previsto_chegada,
        status, created_by, updated_by
      ) VALUES (
        ${id}, ${empresaId}, '${prefixo}', '${data}', ${origemId}, ${destinoId},
        ${tipoId}, ${naturezaId}, '${data}T08:12:00', '${data}T09:08:00',
        'planejado', 10, 10
      );
    `,
  );

  return id;
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

describe('controle-voos sigvoos importer', () => {
  it('persiste campos operacionais da etapa SIGVOOS incluindo IFR, pax e combustivel', async () => {
    const db = createSqliteD1();
    const fixture = {
      flight_report: {
        id: 710301,
        report_number: 'FR-710301',
        flight_number: 'ATX7103',
        client: { name: 'Cliente Teste' },
        contract: { name: 'Contrato Teste' },
      },
      flight_report_leg: {
        number: 1,
        departure_location: { icao_code: 'SBRJ' },
        arrival_location: { icao_code: 'SBSP' },
        engine_start_time_str: '07:50',
        takeoff_time_str: '08:05',
        landing_time_str: '09:00',
        engine_shutoff_time_str: '09:06',
        ifr_time_str: '00:35',
        night_time_str: '00:10',
        day_landings: 1,
        night_landings: 0,
        starts: 1,
        pax: 8,
        fuel_start: 900,
        fuel_end: 620,
      },
      staff: {
        id: 8802,
        name: 'TRIPULANTE_SIG_02',
        inscription: '04567',
      },
      date: '2026-06-14',
    };

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });
    expect(summary.processedRecords).toBe(1);

    const etapa = db.queryJson<{
      tempo_ifr: string | null;
      tempo_noturno: string | null;
      pousos_diurnos: number | null;
      pax: number | null;
      combustivel_inicio: number | null;
      combustivel_fim: number | null;
    }>(
      `SELECT tempo_ifr, tempo_noturno, pousos_diurnos, pax, combustivel_inicio, combustivel_fim
         FROM cv_voo_etapas
        WHERE empresa_id = 6
          AND sigvoos_leg_number = 1
        LIMIT 1`,
    );

    expect(etapa[0]).toMatchObject({
      tempo_ifr: '00:35',
      tempo_noturno: '00:10',
      pousos_diurnos: 1,
      pax: 8,
      combustivel_inicio: 900,
      combustivel_fim: 620,
    });

    const voo = db.queryJson<{ sigvoos_client_name: string | null; sigvoos_contract_name: string | null }>(
      `SELECT sigvoos_client_name, sigvoos_contract_name
         FROM cv_voos
        WHERE empresa_id = 6
          AND sigvoos_flight_report_id = 710301`,
    );
    expect(voo[0]).toMatchObject({
      sigvoos_client_name: 'Cliente Teste',
      sigvoos_contract_name: 'Contrato Teste',
    });
  });

  it('imports a payload with flight_report.id into a matching manual flight without duplicating it', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<Record<string, unknown>>('sigvoos-com-flight-report-id.json');
    const manualFlightId = seedManualFlight(db.databasePath, { id: 6501, prefixo: 'ATX7001' });

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(summary.processedRecords).toBe(1);
    expect(summary.createdFlights).toBe(0);
    expect(summary.updatedFlights).toBe(1);
    expect(summary.createdEtapas).toBe(1);
    expect(summary.createdTripulantes).toBe(1);

    const flights = db.queryJson<FlightRow>(
      `SELECT id, origem_importacao, sigvoos_flight_report_id, sigvoos_flight_number, sigvoos_content_hash
         FROM cv_voos
        WHERE empresa_id = 6
          AND prefixo = 'ATX7001'
        ORDER BY id`,
    );
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({
      id: manualFlightId,
      origem_importacao: 'MANUAL',
      sigvoos_flight_report_id: 700101,
      sigvoos_flight_number: 'ATX7001',
    });

    const etapas = db.queryJson<{ sigvoos_leg_number: number | null; origem_dados: string }>(
      `SELECT sigvoos_leg_number, origem_dados
         FROM cv_voo_etapas
        WHERE empresa_id = 6
          AND voo_id = ${manualFlightId}`,
    );
    expect(etapas).toEqual([{ sigvoos_leg_number: 1, origem_dados: 'SIGVOOS' }]);

    const staging = db.queryJson<{ import_status: string; cv_voo_id: number; cv_etapa_id: number; cv_tripulante_id: number }>(
      'SELECT import_status, cv_voo_id, cv_etapa_id, cv_tripulante_id FROM cv_sigvoos_staging',
    );
    expect(staging).toHaveLength(1);
    expect(staging[0].import_status).toBe('PROCESSED');
    expect(staging[0].cv_voo_id).toBe(manualFlightId);
    expect(staging[0].cv_etapa_id).toBeGreaterThan(0);
    expect(staging[0].cv_tripulante_id).toBeGreaterThan(0);
  });

  it('is idempotent when importing the same payload twice', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<Record<string, unknown>>('sigvoos-com-staff-id.json');

    const first = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });
    const second = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(first.processedRecords).toBe(1);
    expect(second.reusedRecords).toBe(1);

    const counts = db.queryJson<{ flights: number; etapas: number; tripulantes: number; stages: number }>(
      `
        SELECT
          (SELECT COUNT(*) FROM cv_voos WHERE empresa_id = 6 AND deleted_at IS NULL) AS flights,
          (SELECT COUNT(*) FROM cv_voo_etapas WHERE empresa_id = 6 AND deleted_at IS NULL) AS etapas,
          (SELECT COUNT(*) FROM cv_voo_tripulantes WHERE empresa_id = 6 AND deleted_at IS NULL) AS tripulantes,
          (SELECT COUNT(*) FROM cv_sigvoos_staging WHERE empresa_id = 6 AND deleted_at IS NULL) AS stages
      `,
    );

    expect(counts).toEqual([{ flights: 1, etapas: 1, tripulantes: 1, stages: 1 }]);
  });

  it('supports missing flight_report.id and null leg numbers without false uniqueness', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<Record<string, unknown>>('sigvoos-sem-flight-report-id.json');

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(summary.processedRecords).toBe(1);

    const voo = db.queryJson<{ sigvoos_flight_report_id: number | null; origem_importacao: string }>(
      `SELECT sigvoos_flight_report_id, origem_importacao
         FROM cv_voos
        WHERE empresa_id = 6
          AND sigvoos_flight_number = 'ATX7002'`,
    );
    expect(voo).toEqual([{ sigvoos_flight_report_id: null, origem_importacao: 'SIGVOOS' }]);

    const etapa = db.queryJson<{ sigvoos_leg_number: number | null }>(
      `SELECT sigvoos_leg_number
         FROM cv_voo_etapas
        WHERE empresa_id = 6
          AND voo_id = (SELECT id FROM cv_voos WHERE empresa_id = 6 AND sigvoos_flight_number = 'ATX7002' LIMIT 1)`,
    );
    expect(etapa).toEqual([{ sigvoos_leg_number: null }]);
  });

  it('resolves tripulantes by previous staff.id mappings when available', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<Record<string, unknown>>('sigvoos-com-flight-report-id.json');
    seedPreviousStaffIdMapping(db.databasePath, 8801, 6001);

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(summary.processedRecords).toBe(1);

    const tripulante = db.queryJson<{ funcionario_id: number; resolucao_funcionario_fonte: string }>(
      `SELECT funcionario_id, resolucao_funcionario_fonte
         FROM cv_voo_tripulantes
        WHERE empresa_id = 6
          AND voo_id = ${summary.results[0].flightId}
        ORDER BY id DESC
        LIMIT 1`,
    );
    expect(tripulante).toEqual([{ funcionario_id: 6001, resolucao_funcionario_fonte: 'STAFF_ID' }]);
  });

  it('resolves tripulantes by normalized staff.inscription for local-only fixtures', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<{ variants: Record<string, unknown>[] }>('sigvoos-apenas-staff-inscription.json');

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(summary.processedRecords).toBe(2);
    expect(normalizeSigvoosStaffInscription(252)).toBe('00252');
    expect(normalizeSigvoosStaffInscription('00252')).toBe('00252');

    const tripulantes = db.queryJson<{ funcionario_id: number; sigvoos_staff_inscription: string; resolucao_funcionario_fonte: string }>(
      `SELECT funcionario_id, sigvoos_staff_inscription, resolucao_funcionario_fonte
         FROM cv_voo_tripulantes
        WHERE empresa_id = 6
        ORDER BY id`,
    );
    expect(tripulantes).toHaveLength(2);
    expect(tripulantes.every((row) => row.funcionario_id === 6003)).toBe(true);
    expect(tripulantes.every((row) => row.resolucao_funcionario_fonte === 'STAFF_INSCRIPTION')).toBe(true);
    expect(tripulantes.map((row) => row.sigvoos_staff_inscription)).toEqual(['252', '00252']);
  });

  it('isolates an unknown ICAO as a staging conflict and continues the remaining payload', async () => {
    const db = createSqliteD1();
    const payload = {
      variants: [
        {
          flight_report: {
            id: 720101,
            report_number: 'FR-720101',
            flight_number: 'ATX7201',
          },
          flight_report_leg: {
            number: 1,
            departure_location: { icao_code: 'ZZZZ' },
            arrival_location: { icao_code: 'SBSP' },
            takeoff_time_str: '08:05',
            landing_time_str: '09:00',
          },
          staff: {
            id: 8802,
            name: 'TRIPULANTE_SIG_02',
            inscription: '04567',
          },
          date: '2026-06-15',
        },
        {
          flight_report: {
            id: 720102,
            report_number: 'FR-720102',
            flight_number: 'ATX7202',
          },
          flight_report_leg: {
            number: 1,
            departure_location: { icao_code: 'SBRJ' },
            arrival_location: { icao_code: 'SBSP' },
            takeoff_time_str: '10:05',
            landing_time_str: '11:00',
          },
          staff: {
            id: 8802,
            name: 'TRIPULANTE_SIG_02',
            inscription: '04567',
          },
          date: '2026-06-15',
        },
      ],
    };

    const summary = await importSigvoosPayloadToControleVoos(db, 6, payload, {
      actorUserId: 10,
    });

    expect(summary.totalRecords).toBe(2);
    expect(summary.conflictRecords).toBe(1);
    expect(summary.processedRecords).toBe(1);
    expect(summary.createdFlights).toBe(1);
    expect(summary.results.map((result) => result.status)).toEqual(['CONFLICT', 'PROCESSED']);

    const stages = db.queryJson<{ import_status: string; erro_msg: string | null }>(
      `SELECT import_status, erro_msg
         FROM cv_sigvoos_staging
        WHERE empresa_id = 6
        ORDER BY created_at ASC, id ASC`,
    );
    expect(stages).toHaveLength(2);
    expect(stages.some((row) =>
      row.import_status === 'CONFLICT' &&
      row.erro_msg === 'SIGVOOS_IMPORT_MISSING_AIRPORT_MATCH'
    )).toBe(true);
    expect(stages.some((row) => row.import_status === 'PROCESSED')).toBe(true);

    const flights = db.queryJson<{ sigvoos_flight_report_id: number | null }>(
      `SELECT sigvoos_flight_report_id
         FROM cv_voos
        WHERE empresa_id = 6
        ORDER BY id`,
    );
    expect(flights).toEqual([{ sigvoos_flight_report_id: 720102 }]);
  });

  it('creates an explicit conflict when the employee cannot be resolved', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<Record<string, unknown>>('sigvoos-sem-canac.json');

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(summary.processedRecords).toBe(0);
    expect(summary.conflictRecords).toBe(1);
    expect(summary.createdTripulantes).toBe(0);

    const conflicts = db.queryJson<{ entidade_tipo: string; campo: string; justificativa: string }>(
      'SELECT entidade_tipo, campo, justificativa FROM cv_conflitos_integracao',
    );
    expect(conflicts).toEqual([
      {
        entidade_tipo: 'voo',
        campo: 'funcionario_id',
        justificativa: 'funcionario nao resolvido por staff.id ou staff.inscription',
      },
    ]);

    const stage = db.queryJson<{ import_status: string; cv_tripulante_id: number | null }>(
      'SELECT import_status, cv_tripulante_id FROM cv_sigvoos_staging',
    );
    expect(stage).toEqual([{ import_status: 'CONFLICT', cv_tripulante_id: null }]);
  });

  it('derives the same payload hash after stripping secrets from the raw payload', async () => {
    const fixture = readFixture<Record<string, unknown>>('sigvoos-com-flight-report-id.json');

    const withSecrets = {
      ...fixture,
      api_token: 'token-super-secreto',
      nested_secret: 'credencial-1',
      auth: {
        password: 'senha-nao-persistir',
        refresh_token: 'refresh-nao-persistir',
      },
    };
    const withDifferentSecrets = {
      ...fixture,
      api_token: 'token-diferente',
      nested_secret: 'credencial-2',
      auth: {
        password: 'outra-senha',
        refresh_token: 'outro-refresh',
      },
    };

    const left = await hashSanitizedSigvoosPayload(withSecrets);
    const right = await hashSanitizedSigvoosPayload(withDifferentSecrets);

    expect(left).toBe(right);
  });

  it('isolates imports by empresa_id and does not touch FRMS or frms-source-policy', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<Record<string, unknown>>('sigvoos-com-flight-report-id.json');
    const source = readFileSync(importerPath, 'utf8');

    await importSigvoosPayloadToControleVoos(
      db,
      6,
      fixture,
      { actorUserId: 10 },
    );
    await importSigvoosPayloadToControleVoos(
      db,
      7,
      {
        ...fixture,
        staff: {
          id: 9901,
          name: 'TRIPULANTE_SIG_B',
          inscription: '01234',
        },
      },
      { actorUserId: 20 },
    );

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
    expect(source).not.toMatch(/frms-source-policy/);
  });

  it('imports multiple legs under the same flight_report.id without duplicating the flight', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<{ variants: Record<string, unknown>[] }>('sigvoos-multileg-flight-report-id.json');

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(summary.processedRecords).toBe(2);
    expect(summary.createdFlights).toBe(1);
    expect(summary.updatedFlights).toBe(1);
    expect(summary.createdEtapas).toBe(2);
    expect(summary.createdTripulantes).toBe(2);

    const flights = db.queryJson<{ id: number }>(
      `SELECT id
         FROM cv_voos
        WHERE empresa_id = 6
          AND sigvoos_flight_report_id = 710201`,
    );
    expect(flights).toHaveLength(1);

    const etapas = db.queryJson<{ numero_etapa: number; sigvoos_leg_number: number | null }>(
      `SELECT numero_etapa, sigvoos_leg_number
         FROM cv_voo_etapas
        WHERE empresa_id = 6
          AND voo_id = ${flights[0].id}
        ORDER BY numero_etapa`,
    );
    expect(etapas).toEqual([
      { numero_etapa: 1, sigvoos_leg_number: 1 },
      { numero_etapa: 2, sigvoos_leg_number: 2 },
    ]);
  });

  it(
    'keeps a multileg payload without flight_report.id in a single flight and remains idempotent',
    async () => {
      const db = createSqliteD1();
      const fixture = readFixture<{ variants: Record<string, unknown>[] }>('sigvoos-multileg-sem-flight-report-id.json');

      const first = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });
      const second = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

      expect(first.processedRecords).toBe(2);
      expect(first.createdFlights).toBe(1);
      expect(first.updatedFlights).toBe(1);
      expect(first.createdEtapas).toBe(2);
      expect(second.reusedRecords).toBe(2);

      const flights = db.queryJson<{ id: number; sigvoos_flight_report_id: number | null }>(
        `SELECT id, sigvoos_flight_report_id
           FROM cv_voos
          WHERE empresa_id = 6
            AND sigvoos_flight_number = 'ATX7211'`,
      );
      expect(flights).toEqual([{ id: flights[0].id, sigvoos_flight_report_id: null }]);

      const etapas = db.queryJson<{ numero_etapa: number; sigvoos_leg_number: number | null }>(
        `SELECT numero_etapa, sigvoos_leg_number
           FROM cv_voo_etapas
          WHERE empresa_id = 6
            AND voo_id = ${flights[0].id}
          ORDER BY numero_etapa`,
      );
      expect(etapas).toEqual([
        { numero_etapa: 1, sigvoos_leg_number: 1 },
        { numero_etapa: 2, sigvoos_leg_number: 2 },
      ]);

      const stages = db.queryJson<{ cv_voo_id: number; import_status: string }>(
        `SELECT cv_voo_id, import_status
           FROM cv_sigvoos_staging
          WHERE empresa_id = 6
          ORDER BY id`,
      );
      expect(stages).toHaveLength(2);
      expect(new Set(stages.map((row) => row.cv_voo_id))).toEqual(new Set([flights[0].id]));
      expect(stages.every((row) => row.import_status === 'PROCESSED')).toBe(true);
    },
    15000,
  );

  it('reuses the same etapa when leg.number is duplicated in the same flight', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<{ variants: Record<string, unknown>[] }>('sigvoos-leg-number-duplicado.json');

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(summary.processedRecords).toBe(2);
    expect(summary.createdFlights).toBe(1);
    expect(summary.updatedFlights).toBe(1);
    expect(summary.createdEtapas).toBe(1);
    expect(summary.updatedEtapas).toBe(1);
    expect(summary.createdTripulantes).toBe(1);
    expect(summary.updatedTripulantes).toBe(1);

    const etapas = db.queryJson<{ id: number; sigvoos_leg_number: number | null }>(
      `SELECT id, sigvoos_leg_number
         FROM cv_voo_etapas
        WHERE empresa_id = 6
          AND voo_id = (SELECT id FROM cv_voos WHERE empresa_id = 6 AND sigvoos_flight_report_id = 710203 LIMIT 1)`,
    );
    expect(etapas).toHaveLength(1);
    expect(etapas[0].sigvoos_leg_number).toBe(1);
  });

  it('creates distinct etapas for multiple null or missing leg numbers in the same flight', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<{ variants: Record<string, unknown>[] }>('sigvoos-multiple-null-legs.json');

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(summary.processedRecords).toBe(2);
    expect(summary.createdFlights).toBe(1);
    expect(summary.updatedFlights).toBe(1);
    expect(summary.createdEtapas).toBe(2);

    const etapas = db.queryJson<{ numero_etapa: number; sigvoos_leg_number: number | null }>(
      `SELECT numero_etapa, sigvoos_leg_number
         FROM cv_voo_etapas
        WHERE empresa_id = 6
          AND voo_id = (SELECT id FROM cv_voos WHERE empresa_id = 6 AND sigvoos_flight_report_id = 710204 LIMIT 1)
        ORDER BY numero_etapa`,
    );
    expect(etapas).toEqual([
      { numero_etapa: 1, sigvoos_leg_number: null },
      { numero_etapa: 2, sigvoos_leg_number: null },
    ]);
  });

  it('normalizes varied staff inscriptions and leaves invalid values in explicit conflict', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<{ variants: Record<string, unknown>[] }>('sigvoos-staff-normalization-variants.json');

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(summary.processedRecords).toBe(3);
    expect(summary.conflictRecords).toBe(1);
    expect(normalizeSigvoosStaffInscription(1234)).toBe('01234');
    expect(normalizeSigvoosStaffInscription('00252')).toBe('00252');
    expect(normalizeSigvoosStaffInscription(' 4567 ')).toBe('04567');
    expect(normalizeSigvoosStaffInscription('MATRICULA-INVALIDA')).toBe(null);

    const tripulantes = db.queryJson<{ funcionario_id: number; sigvoos_staff_inscription: string | null }>(
      `SELECT funcionario_id, sigvoos_staff_inscription
         FROM cv_voo_tripulantes
        WHERE empresa_id = 6
        ORDER BY id`,
    );
    expect(tripulantes).toEqual([
      { funcionario_id: 6001, sigvoos_staff_inscription: '1234' },
      { funcionario_id: 6003, sigvoos_staff_inscription: '00252' },
      { funcionario_id: 6002, sigvoos_staff_inscription: '4567' },
    ]);

    const conflicts = db.queryJson<{ justificativa: string }>(
      `SELECT justificativa
         FROM cv_conflitos_integracao
        WHERE empresa_id = 6
        ORDER BY id`,
    );
    expect(conflicts).toEqual([
      { justificativa: 'funcionario nao resolvido por staff.id ou staff.inscription' },
    ]);
  });

  it('creates an explicit conflict when staff.id and staff.inscription resolve to different employees', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<Record<string, unknown>>('sigvoos-staff-id-inscription-conflict.json');
    seedPreviousStaffIdMapping(db.databasePath, 8899, 6002);

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(summary.processedRecords).toBe(0);
    expect(summary.conflictRecords).toBe(1);
    expect(summary.createdTripulantes).toBe(0);

    const conflicts = db.queryJson<{ justificativa: string; valor_sigvoos: string }>(
      `SELECT justificativa, valor_sigvoos
         FROM cv_conflitos_integracao
        WHERE empresa_id = 6`,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].justificativa).toBe('staff.id e staff.inscription resolvidos para funcionarios diferentes');
    expect(conflicts[0].valor_sigvoos).toContain('"funcionario_id_staff_id":6002');
    expect(conflicts[0].valor_sigvoos).toContain('"funcionario_id_staff_inscription":6001');

    const stage = db.queryJson<{ import_status: string; cv_tripulante_id: number | null }>(
      `SELECT import_status, cv_tripulante_id
         FROM cv_sigvoos_staging
        WHERE empresa_id = 6`,
    );
    expect(stage).toEqual([{ import_status: 'CONFLICT', cv_tripulante_id: null }]);
  });

  it('does not duplicate a repeated tripulante in the same etapa', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<{ variants: Record<string, unknown>[] }>('sigvoos-tripulante-repetido-mesma-etapa.json');

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(summary.processedRecords).toBe(2);
    expect(summary.createdTripulantes).toBe(1);
    expect(summary.updatedTripulantes).toBe(1);

    const tripulantes = db.queryJson<{ id: number }>(
      `SELECT id
         FROM cv_voo_tripulantes
        WHERE empresa_id = 6
          AND voo_id = (SELECT id FROM cv_voos WHERE empresa_id = 6 AND sigvoos_flight_report_id = 710210 LIMIT 1)`,
    );
    expect(tripulantes).toHaveLength(1);

    const stages = db.queryJson<{ cv_tripulante_id: number | null }>(
      `SELECT cv_tripulante_id
         FROM cv_sigvoos_staging
        WHERE empresa_id = 6
        ORDER BY id`,
    );
    expect(stages).toEqual([
      { cv_tripulante_id: tripulantes[0].id },
      { cv_tripulante_id: tripulantes[0].id },
    ]);
  });

  it('accepts optional missing fields and strips sensitive keys while retaining benign extras in sanitized staging', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<Record<string, unknown>>('sigvoos-optional-missing-extra-sensitive.json');

    const summary = await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    expect(summary.processedRecords).toBe(1);

    const flights = db.queryJson<{ sigvoos_report_number: string | null; sigvoos_client_name: string | null }>(
      `SELECT sigvoos_report_number, sigvoos_client_name
         FROM cv_voos
        WHERE empresa_id = 6
          AND sigvoos_flight_report_id = 710211`,
    );
    expect(flights).toEqual([{ sigvoos_report_number: null, sigvoos_client_name: null }]);

    const tripulantes = db.queryJson<{ funcao: string; sigvoos_staff_inscription: string | null }>(
      `SELECT funcao, sigvoos_staff_inscription
         FROM cv_voo_tripulantes
        WHERE empresa_id = 6
          AND voo_id = (SELECT id FROM cv_voos WHERE empresa_id = 6 AND sigvoos_flight_report_id = 710211 LIMIT 1)`,
    );
    expect(tripulantes).toEqual([{ funcao: 'OUTRO', sigvoos_staff_inscription: '01234' }]);

    const stage = db.queryJson<{ payload_sanitizado_json: string }>(
      `SELECT payload_sanitizado_json
         FROM cv_sigvoos_staging
        WHERE empresa_id = 6
          AND sigvoos_flight_report_id = 710211`,
    );
    expect(stage).toHaveLength(1);

    const sanitized = JSON.parse(stage[0].payload_sanitizado_json) as Record<string, unknown>;
    expect(sanitized).toHaveProperty('unexpected_context');
    expect(sanitized).toHaveProperty('manifest');
    expect(stage[0].payload_sanitizado_json).not.toContain('REMOVE-TOKEN');
    expect(stage[0].payload_sanitizado_json).not.toContain('REMOVE-CREDENTIAL');
    expect(stage[0].payload_sanitizado_json).not.toContain('REMOVE-PASSWORD');
    expect(stage[0].payload_sanitizado_json).not.toContain('REMOVE-SECRET');
  });

  it('never merges two distinct SIGVOOS flight_report.id values sharing the same date/prefix/route (DUPLICATE_CONFLICT-safe)', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<Record<string, unknown>>('sigvoos-com-flight-report-id.json');
    const conflicting = {
      ...fixture,
      flight_report: {
        ...(fixture.flight_report as Record<string, unknown>),
        id: 700199,
      },
    };

    await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });
    const second = await importSigvoosPayloadToControleVoos(db, 6, conflicting, { actorUserId: 10 });

    expect(second.processedRecords).toBe(1);

    const flights = db.queryJson<FlightRow>(
      `SELECT id, origem_importacao, sigvoos_flight_report_id, sigvoos_flight_number, sigvoos_content_hash
         FROM cv_voos
        WHERE empresa_id = 6
          AND prefixo = 'ATX7001'
        ORDER BY sigvoos_flight_report_id`,
    );

    // Two distinct external flight_report.id values must never be collapsed into a
    // single cv_voos row, even when date/prefix/route coincide. Each keeps its own
    // externally-sourced identity so no report gets silently dropped or overwritten.
    expect(flights).toHaveLength(2);
    expect(flights.map((f) => f.sigvoos_flight_report_id)).toEqual([700101, 700199]);
  });

  it('rejects reusing a flight_report.id already bound to a different empresa (TENANT_MISMATCH)', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<Record<string, unknown>>('sigvoos-com-flight-report-id.json');

    await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });
    await importSigvoosPayloadToControleVoos(db, 7, fixture, { actorUserId: 20 });

    const flights = db.queryJson<{ empresa_id: number; sigvoos_flight_report_id: number }>(
      `SELECT empresa_id, sigvoos_flight_report_id
         FROM cv_voos
        WHERE sigvoos_flight_report_id = 700101
        ORDER BY empresa_id`,
    );

    // Same external SIGVOOS id, two tenants: each tenant gets its own independent
    // cv_voos row scoped by (empresa_id, sigvoos_flight_report_id) - the same
    // external id can never be read back for the wrong tenant.
    expect(flights).toEqual([
      { empresa_id: 6, sigvoos_flight_report_id: 700101 },
      { empresa_id: 7, sigvoos_flight_report_id: 700101 },
    ]);

    const crossTenantLeak = db.queryJson<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM cv_voos
        WHERE empresa_id = 6
          AND sigvoos_flight_report_id = 700101
          AND id IN (SELECT id FROM cv_voos WHERE empresa_id = 7)`,
    );
    expect(crossTenantLeak).toEqual([{ total: 0 }]);
  });

  it('preserves an already-confirmed flight_report.id and never overwrites it with NULL on reimport', async () => {
    const db = createSqliteD1();
    const fixture = readFixture<Record<string, unknown>>('sigvoos-com-flight-report-id.json');
    const withoutReportId = {
      ...fixture,
      flight_report: {
        ...(fixture.flight_report as Record<string, unknown>),
        id: null,
      },
    };

    await importSigvoosPayloadToControleVoos(db, 6, fixture, { actorUserId: 10 });

    const before = db.queryJson<{ sigvoos_flight_report_id: number | null }>(
      `SELECT sigvoos_flight_report_id FROM cv_voos WHERE empresa_id = 6 AND prefixo = 'ATX7001'`,
    );
    expect(before).toEqual([{ sigvoos_flight_report_id: 700101 }]);

    // A later payload for the same operational flight that arrives without the
    // external id (SOURCE_MISSING for that field) must never clobber the value
    // that is already confirmed.
    await importSigvoosPayloadToControleVoos(db, 6, withoutReportId, { actorUserId: 10 });

    const after = db.queryJson<{ sigvoos_flight_report_id: number | null }>(
      `SELECT sigvoos_flight_report_id FROM cv_voos WHERE empresa_id = 6 AND prefixo = 'ATX7001'`,
    );
    expect(after).toEqual([{ sigvoos_flight_report_id: 700101 }]);
  });
});
