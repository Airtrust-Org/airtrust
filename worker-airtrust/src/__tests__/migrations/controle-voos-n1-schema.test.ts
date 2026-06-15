import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

type NamedRow = {
  name: string;
};

type TableColumn = {
  name: string;
};

const requiredTables = [
  'cv_aeroportos',
  'cv_motivos_operacionais',
  'cv_naturezas_voo',
  'cv_rdv_operacional',
  'cv_tipos_voo',
  'cv_voo_eventos',
  'cv_voo_tripulantes',
  'cv_voos',
] as const;

const requiredIndexes = [
  'idx_cv_aeroportos_empresa_codigo',
  'idx_cv_aeroportos_empresa_tipo_ativo',
  'idx_cv_aeroportos_empresa_deleted',
  'idx_cv_tipos_voo_empresa_codigo',
  'idx_cv_tipos_voo_empresa_ativo',
  'idx_cv_tipos_voo_empresa_deleted',
  'idx_cv_naturezas_voo_empresa_codigo',
  'idx_cv_naturezas_voo_empresa_ativo',
  'idx_cv_naturezas_voo_empresa_deleted',
  'idx_cv_motivos_operacionais_empresa_codigo',
  'idx_cv_motivos_operacionais_empresa_tipo_ativo',
  'idx_cv_motivos_operacionais_empresa_deleted',
  'idx_cv_voos_empresa_data_status',
  'idx_cv_voos_empresa_aeronave_data',
  'idx_cv_voos_empresa_prefixo_data',
  'idx_cv_voos_empresa_deleted',
  'idx_cv_rdv_operacional_empresa_voo_ativo',
  'idx_cv_rdv_operacional_empresa_numero',
  'idx_cv_rdv_operacional_empresa_data_status',
  'idx_cv_rdv_operacional_empresa_responsavel_data',
  'idx_cv_rdv_operacional_empresa_deleted',
  'idx_cv_voo_tripulantes_empresa_voo_funcionario_funcao',
  'idx_cv_voo_tripulantes_empresa_voo',
  'idx_cv_voo_tripulantes_empresa_funcionario_apresentacao',
  'idx_cv_voo_tripulantes_empresa_deleted',
  'idx_cv_voo_eventos_empresa_voo_created',
  'idx_cv_voo_eventos_empresa_tipo_created',
  'idx_cv_voo_eventos_empresa_usuario_created',
  'idx_cv_voo_eventos_empresa_deleted',
] as const;

const prohibitedMigrationPatterns = [
  /\bassinatura\b/i,
  /\bassinado\b/i,
  /\bvalidado\b/i,
  /\bvalidacao\b/i,
  /\bhomologado\b/i,
  /\bANAC aprovado\b/i,
  /\beDB\b/i,
  /\bSDRMe\b/i,
  /\bRAS\b/i,
  /\bfiscal\b/i,
  /\bregulated_/i,
] as const;

const tempDirs: string[] = [];
const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../migrations/0410_controle_voos_n1_schema.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

function createDb() {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-controle-voos-n1-'));
  const databasePath = join(tempDir, 'schema.sqlite');
  tempDirs.push(tempDir);

  function sqlite(sql: string): string {
    const result = spawnSync('sqlite3', [databasePath], {
      input: sql,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }

  function sqliteResult(sql: string) {
    return spawnSync('sqlite3', [databasePath], {
      input: sql,
      encoding: 'utf8',
    });
  }

  function queryJson<T>(sql: string): T[] {
    const result = spawnSync('sqlite3', ['-json', databasePath, sql], {
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
  }

  sqlite('PRAGMA foreign_keys = ON;');
  sqlite(migrationSql);

  return { sqlite, sqliteResult, queryJson };
}

function expectSqlFailure(result: ReturnType<typeof spawnSync>, messagePattern: RegExp) {
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(messagePattern);
}

function seedMinimumCatalogs(sqlite: (sql: string) => string, empresaId = 6) {
  sqlite(`
    INSERT INTO cv_aeroportos (id, empresa_id, codigo, codigo_icao, nome, tipo)
    VALUES
      (101, ${empresaId}, 'SBRJ', 'SBRJ', 'Santos Dumont', 'aeroporto'),
      (102, ${empresaId}, 'SBSP', 'SBSP', 'Congonhas', 'aeroporto'),
      (103, ${empresaId}, 'SBPL01', 'SBPL01', 'Plataforma P-01', 'plataforma');

    INSERT INTO cv_tipos_voo (id, empresa_id, codigo, nome)
    VALUES (201, ${empresaId}, 'REG', 'Regular');

    INSERT INTO cv_naturezas_voo (id, empresa_id, codigo, nome)
    VALUES (301, ${empresaId}, 'PAX', 'Passageiro');

    INSERT INTO cv_motivos_operacionais (id, empresa_id, codigo, nome, tipo)
    VALUES (401, ${empresaId}, 'WX', 'Meteorologia', 'atraso');
  `);
}

function insertMinimumFlight(sqlite: (sql: string) => string, empresaId = 6) {
  sqlite(`
    INSERT INTO cv_voos (
      id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
      tipo_voo_id, natureza_voo_id, aeronave_id,
      horario_previsto_partida, horario_previsto_chegada, status, created_by
    ) VALUES (
      501, ${empresaId}, 'ATX-2101', '2026-06-14', 101, 102,
      201, 301, 9001,
      '2026-06-14T10:00:00', '2026-06-14T11:15:00', 'planejado', 10
    );
  `);
}

afterAll(() => {
  for (const tempDir of tempDirs) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('migration 0410 controle voos N1 schema', () => {
  it('creates only the B1 Controle de Voos tables', () => {
    const { queryJson } = createDb();

    const tables = queryJson<NamedRow>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cv_%' ORDER BY name;",
    ).map(({ name }) => name);

    expect(tables).toEqual([...requiredTables]);
    expect(tables).not.toContain('cv_observacoes');
    expect(tables).not.toContain('cv_hangaragens');
    expect(tables).not.toContain('cv_indisponibilidades');
    expect(tables).not.toContain('cv_indisponibilidade_voos');
  });

  it('creates the tenant-scoped indexes required by the B1 schema', () => {
    const { queryJson } = createDb();

    const indexes = queryJson<NamedRow>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_cv_%' ORDER BY name;",
    ).map(({ name }) => name);

    expect(indexes).toEqual(expect.arrayContaining([...requiredIndexes]));
  });

  it('keeps empresa_id, timestamps and soft delete anchors on every table', () => {
    const { queryJson } = createDb();

    for (const table of requiredTables) {
      const columns = queryJson<TableColumn>(`PRAGMA table_info(${table});`).map(({ name }) => name);
      expect(columns).toEqual(expect.arrayContaining(['id', 'empresa_id', 'created_at', 'updated_at', 'deleted_at']));
    }

    for (const table of requiredTables.filter((table) => table !== 'cv_voo_eventos')) {
      const columns = queryJson<TableColumn>(`PRAGMA table_info(${table});`).map(({ name }) => name);
      expect(columns).toEqual(expect.arrayContaining(['created_by', 'updated_by']));
    }

    const eventColumns = queryJson<TableColumn>('PRAGMA table_info(cv_voo_eventos);').map(({ name }) => name);
    expect(eventColumns).toEqual(expect.arrayContaining(['usuario_id', 'created_by', 'updated_by']));
  });

  it('rejects invalid status values', () => {
    const { sqlite, sqliteResult } = createDb();
    seedMinimumCatalogs(sqlite);

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_voos (
          empresa_id, prefixo, data_programacao, origem_id, destino_id,
          tipo_voo_id, natureza_voo_id, horario_previsto_partida, horario_previsto_chegada, status
        ) VALUES (
          6, 'ATX-9999', '2026-06-14', 101, 102,
          201, 301, '2026-06-14T10:00:00', '2026-06-14T11:00:00', 'em_aprovacao'
        );
      `),
      /CHECK constraint failed/i,
    );

    insertMinimumFlight(sqlite);

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_rdv_operacional (
          empresa_id, voo_id, numero, data_voo, status
        ) VALUES (
          6, 501, 'RDV-INV-1', '2026-06-14', 'encerrado'
        );
      `),
      /CHECK constraint failed/i,
    );
  });

  it('rejects negative RDV numeric values', () => {
    const { sqlite, sqliteResult } = createDb();
    seedMinimumCatalogs(sqlite);
    insertMinimumFlight(sqlite);

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_rdv_operacional (
          empresa_id, voo_id, numero, data_voo, horas_voadas, numero_pousos,
          ciclos, combustivel_decolagem, pob, carga_kg
        ) VALUES (
          6, 501, 'RDV-NEG-1', '2026-06-14', -1, 1,
          1, 100, 3, 50
        );
      `),
      /CHECK constraint failed/i,
    );

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_rdv_operacional (
          empresa_id, voo_id, numero, data_voo, horas_voadas, numero_pousos,
          ciclos, combustivel_decolagem, pob, carga_kg
        ) VALUES (
          6, 501, 'RDV-NEG-2', '2026-06-14', 1.2, -1,
          1, 100, 3, 50
        );
      `),
      /CHECK constraint failed/i,
    );

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_rdv_operacional (
          empresa_id, voo_id, numero, data_voo, horas_voadas, numero_pousos,
          ciclos, combustivel_decolagem, pob, carga_kg
        ) VALUES (
          6, 501, 'RDV-NEG-3', '2026-06-14', 1.2, 1,
          -1, 100, 3, 50
        );
      `),
      /CHECK constraint failed/i,
    );
  });

  it('allows a flight with the minimum valid B1 fields', () => {
    const { sqlite, queryJson } = createDb();
    seedMinimumCatalogs(sqlite);
    insertMinimumFlight(sqlite);

    const rows = queryJson<{ id: number; status: string }>(
      "SELECT id, status FROM cv_voos WHERE empresa_id = 6 AND prefixo = 'ATX-2101';",
    );

    expect(rows).toEqual([{ id: 501, status: 'planejado' }]);
  });

  it('allows one operational RDV for a flight and rejects a second active RDV', () => {
    const { sqlite, sqliteResult, queryJson } = createDb();
    seedMinimumCatalogs(sqlite);
    insertMinimumFlight(sqlite);

    sqlite(`
      INSERT INTO cv_rdv_operacional (
        empresa_id, voo_id, numero, data_voo, horario_decolagem_real, horario_pouso_real,
        horas_voadas, numero_pousos, ciclos, combustivel_decolagem, combustivel_pouso,
        combustivel_consumo, pob, carga_kg, status, responsavel_preenchimento_id
      ) VALUES (
        6, 501, 'RDV-20260614-001', '2026-06-14', '2026-06-14T10:05:00', '2026-06-14T11:10:00',
        1.08, 1, 1, 1200, 700,
        500, 4, 120.5, 'rascunho', 70
      );
    `);

    const rows = queryJson<{ numero: string; status: string }>(
      'SELECT numero, status FROM cv_rdv_operacional WHERE empresa_id = 6 AND voo_id = 501;',
    );
    expect(rows).toEqual([{ numero: 'RDV-20260614-001', status: 'rascunho' }]);

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_rdv_operacional (
          empresa_id, voo_id, numero, data_voo, status
        ) VALUES (
          6, 501, 'RDV-20260614-002', '2026-06-14', 'rascunho'
        );
      `),
      /UNIQUE constraint failed/i,
    );

    sqlite(`
      INSERT INTO cv_rdv_operacional (
        empresa_id, voo_id, numero, data_voo, status
      ) VALUES (
        6, 501, 'RDV-20260614-CAN', '2026-06-14', 'cancelado'
      );
    `);
  });

  it('requires a valid crew function', () => {
    const { sqlite, sqliteResult } = createDb();
    seedMinimumCatalogs(sqlite);
    insertMinimumFlight(sqlite);

    sqlite(`
      INSERT INTO cv_voo_tripulantes (
        empresa_id, voo_id, funcionario_id, funcao, horario_apresentacao
      ) VALUES (
        6, 501, 70, 'PIC', '2026-06-14T09:00:00'
      );
    `);

    expectSqlFailure(
      sqliteResult(`
        INSERT INTO cv_voo_tripulantes (
          empresa_id, voo_id, funcionario_id, funcao
        ) VALUES (
          6, 501, 71, 'CMTE'
        );
      `),
      /CHECK constraint failed/i,
    );
  });

  it('enforces catalog code uniqueness per tenant and permits the same code in different tenants', () => {
    const { sqlite, sqliteResult, queryJson } = createDb();

    sqlite(`
      INSERT INTO cv_tipos_voo (empresa_id, codigo, nome) VALUES (6, 'REG', 'Regular');
      INSERT INTO cv_tipos_voo (empresa_id, codigo, nome) VALUES (7, 'REG', 'Regular Tenant 7');
      INSERT INTO cv_naturezas_voo (empresa_id, codigo, nome) VALUES (6, 'PAX', 'Passageiro');
      INSERT INTO cv_naturezas_voo (empresa_id, codigo, nome) VALUES (7, 'PAX', 'Passageiro Tenant 7');
      INSERT INTO cv_motivos_operacionais (empresa_id, codigo, nome, tipo) VALUES (6, 'WX', 'Meteorologia', 'atraso');
      INSERT INTO cv_motivos_operacionais (empresa_id, codigo, nome, tipo) VALUES (7, 'WX', 'Meteorologia Tenant 7', 'atraso');
      INSERT INTO cv_aeroportos (empresa_id, codigo, nome, tipo) VALUES (6, 'SBRJ', 'Santos Dumont', 'aeroporto');
      INSERT INTO cv_aeroportos (empresa_id, codigo, nome, tipo) VALUES (7, 'SBRJ', 'Santos Dumont Tenant 7', 'aeroporto');
    `);

    expect(queryJson<{ total: number }>('SELECT COUNT(*) AS total FROM cv_tipos_voo WHERE codigo = \'REG\';')).toEqual([
      { total: 2 },
    ]);

    expectSqlFailure(
      sqliteResult("INSERT INTO cv_tipos_voo (empresa_id, codigo, nome) VALUES (6, 'REG', 'Duplicado');"),
      /UNIQUE constraint failed/i,
    );
    expectSqlFailure(
      sqliteResult("INSERT INTO cv_naturezas_voo (empresa_id, codigo, nome) VALUES (6, 'PAX', 'Duplicado');"),
      /UNIQUE constraint failed/i,
    );
    expectSqlFailure(
      sqliteResult("INSERT INTO cv_motivos_operacionais (empresa_id, codigo, nome) VALUES (6, 'WX', 'Duplicado');"),
      /UNIQUE constraint failed/i,
    );
    expectSqlFailure(
      sqliteResult("INSERT INTO cv_aeroportos (empresa_id, codigo, nome, tipo) VALUES (6, 'SBRJ', 'Duplicado', 'aeroporto');"),
      /UNIQUE constraint failed/i,
    );
  });

  it('does not create regulated-prefixed tables', () => {
    const { queryJson } = createDb();

    expect(
      queryJson<NamedRow>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'regulated_%';"),
    ).toEqual([]);
  });

  it('does not contain prohibited scope terms in the migration SQL', () => {
    for (const pattern of prohibitedMigrationPatterns) {
      expect(migrationSql).not.toMatch(pattern);
    }
  });
});
