import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

type ColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

function runSqlite(dbPath: string, sql: string): string {
  const result = spawnSync('sqlite3', [dbPath], {
    input: sql,
    encoding: 'utf-8',
    timeout: 10_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sqlite3 exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
}

function scalar(dbPath: string, sql: string): string {
  return runSqlite(dbPath, `${sql}\n`).trim();
}

function colInfo(dbPath: string, table: string, column = 'empresa_id'): ColumnInfo {
  const [line] = runSqlite(
    dbPath,
    `SELECT cid, name, type, "notnull", COALESCE(dflt_value, 'NULL'), pk FROM pragma_table_info('${table}') WHERE name='${column}';`,
  )
    .trim()
    .split('\n');
  const [cid, name, type, notnull, dfltValue, pk] = line.split('|');
  return {
    cid: Number(cid),
    name,
    type,
    notnull: Number(notnull),
    dflt_value: dfltValue === 'NULL' ? null : dfltValue,
    pk: Number(pk),
  };
}

function migrationSql(): string {
  return readFileSync(join(__dirname, '../../../migrations/0402_harden_empresa_id_wave4.sql'), 'utf8');
}

describe('Wave 4 — empresa_id hardening', () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // noop
      }
    }
  });

  function setupTestDb(): string {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wave4-'));
    tempDirs.push(tmpDir);
    const dbPath = join(tmpDir, 'test.db');

    runSqlite(
      dbPath,
      `
      PRAGMA foreign_keys = ON;

      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT);
      INSERT INTO usuarios (id, nome) VALUES (1, 'Admin');

      CREATE TABLE auditoria_avancada_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tabela TEXT,
        registro_id INTEGER,
        acao TEXT,
        dados_anteriores TEXT,
        dados_novos TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE qualificacoes_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER,
        qualificacao_id INTEGER,
        tipo TEXT,
        codigo TEXT,
        tipo_codigo TEXT,
        categoria TEXT,
        deleted_at TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE qualificacoes_historico_reclass_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        historico_id INTEGER,
        target_tipo_id INTEGER,
        status TEXT DEFAULT 'PENDING',
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE _data_recovery_log (
        etapa TEXT,
        detalhes TEXT
      );

      CREATE TABLE importacoes_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entidade TEXT NOT NULL,
        usuario_id INTEGER,
        total_rows INTEGER NOT NULL DEFAULT 0,
        to_create INTEGER NOT NULL DEFAULT 0,
        to_update INTEGER NOT NULL DEFAULT 0,
        to_skip INTEGER NOT NULL DEFAULT 0,
        created INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        merge_mode TEXT,
        raw_data TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        empresa_id INTEGER DEFAULT 1,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );
      INSERT INTO importacoes_log (id, entidade, empresa_id) VALUES
        (1, 'funcionarios', 6),
        (2, 'escalas', 6),
        (3, 'qualificacoes', 7);

      CREATE TABLE qualificacoes_tipos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT,
        codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nome TEXT NOT NULL CHECK(length(trim(nome)) >= 3),
        descricao TEXT,
        categoria TEXT,
        carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0),
        carga_horaria_inicial REAL CHECK(carga_horaria_inicial IS NULL OR carga_horaria_inicial > 0),
        carga_horaria_recorrente REAL CHECK(carga_horaria_recorrente IS NULL OR carga_horaria_recorrente > 0),
        conteudo_programatico TEXT DEFAULT NULL,
        validade INTEGER CHECK(validade IS NULL OR validade > 0),
        vencimento_fim_mes INTEGER DEFAULT 0 CHECK(vencimento_fim_mes IN (0, 1)),
        observacoes TEXT,
        ativo INTEGER DEFAULT 1 CHECK(ativo IN (0, 1)),
        is_check INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        empresa_id INTEGER DEFAULT 1
      );
      INSERT INTO qualificacoes_tipos (id, codigo, nome, empresa_id, deleted_at) VALUES
        (1, 'CHT', 'Carteira Habilitação Técnica', 6, NULL),
        (2, 'CMA', 'Certificado Médico Aeronáutico', 6, NULL),
        (3, 'FDM', 'Flight Data Monitoring', 1, datetime('now')),
        (4, 'GTK', 'Gatekeeper', 1, datetime('now')),
        (5, 'IFR', 'Instrument Flight Rules', 6, NULL);

      CREATE TABLE sgso_spi_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        codigo TEXT NOT NULL,
        nome TEXT NOT NULL,
        descricao TEXT,
        unidade TEXT,
        meta_valor REAL,
        meta_operador TEXT CHECK (meta_operador IN ('>=', '<=', '=', '>', '<')),
        alerta_valor REAL,
        alerta_operador TEXT CHECK (alerta_operador IN ('>=', '<=', '=', '>', '<')),
        ativo INTEGER DEFAULT 1 CHECK (ativo IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          deleted_at TEXT,
        UNIQUE(empresa_id, codigo)
      );
      INSERT INTO sgso_spi_config (id, empresa_id, codigo, nome, ativo) VALUES
        (1, 6, 'TAXA_RELATOS', 'Taxa de Relatos', 1),
        (2, 6, 'TAXA_OCORRENCIA', 'Taxa de Ocorrências', 1),
        (3, 1, 'TAXA_RELATOS', 'Taxa de Relatos', 1),
        (4, 1, 'TAXA_OCORRENCIA', 'Taxa de Ocorrências', 1);
      `,
    );

    return dbPath;
  }

  function applyMigration(dbPath: string) {
    runSqlite(dbPath, migrationSql());
  }

  it('removes DEFAULT 1 and enforces NOT NULL on empresa_id for included tables', () => {
    const dbPath = setupTestDb();

    // Before
    expect(colInfo(dbPath, 'importacoes_log').dflt_value).toBe('1');
    expect(colInfo(dbPath, 'qualificacoes_tipos').dflt_value).toBe('1');

    applyMigration(dbPath);

    for (const table of ['importacoes_log', 'qualificacoes_tipos']) {
      const info = colInfo(dbPath, table);
      expect(info.notnull, `${table}.empresa_id NOT NULL`).toBe(1);
      expect(info.dflt_value, `${table}.empresa_id no default`).toBeNull();
    }
  });

  it('preserves row counts across all tables', () => {
    const dbPath = setupTestDb();
    applyMigration(dbPath);

    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM importacoes_log;'))).toBe(3);
    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM qualificacoes_tipos;'))).toBe(5);
    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM sgso_spi_config;'))).toBe(4);
  });

  it('eliminates empresa_id=1 residues and backfills qualificacoes_tipos soft-deleted rows', () => {
    const dbPath = setupTestDb();
    applyMigration(dbPath);

    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM importacoes_log WHERE empresa_id = 1;'))).toBe(0);
    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id = 1;'))).toBe(0);

    // The 2 soft-deleted rows (ids 3, 4) should have been moved to empresa_id=6
    expect(scalar(dbPath, 'SELECT empresa_id FROM qualificacoes_tipos WHERE id = 3;')).toBe('6');
    expect(scalar(dbPath, 'SELECT empresa_id FROM qualificacoes_tipos WHERE id = 4;')).toBe('6');

    // Active rows unchanged
    expect(scalar(dbPath, 'SELECT empresa_id FROM qualificacoes_tipos WHERE id = 1;')).toBe('6');
    expect(scalar(dbPath, 'SELECT empresa_id FROM qualificacoes_tipos WHERE id = 2;')).toBe('6');
    expect(scalar(dbPath, 'SELECT empresa_id FROM qualificacoes_tipos WHERE id = 5;')).toBe('6');
  });

  it('soft-deletes sgso_spi_config empresa_id=1 duplicates and keeps canonical rows', () => {
    const dbPath = setupTestDb();
    applyMigration(dbPath);

    // The 2 empresa_id=1 rows (ids 3, 4) should be soft-deleted
    expect(scalar(dbPath, 'SELECT deleted_at IS NOT NULL FROM sgso_spi_config WHERE id = 3;')).toBe('1');
    expect(scalar(dbPath, 'SELECT deleted_at IS NOT NULL FROM sgso_spi_config WHERE id = 4;')).toBe('1');

    // The 2 empresa_id=6 rows (ids 1, 2) should remain active
    expect(scalar(dbPath, 'SELECT deleted_at IS NULL FROM sgso_spi_config WHERE id = 1;')).toBe('1');
    expect(scalar(dbPath, 'SELECT deleted_at IS NULL FROM sgso_spi_config WHERE id = 2;')).toBe('1');

    // Zero active empresa_id=1 rows
    expect(Number(scalar(dbPath, "SELECT COUNT(*) FROM sgso_spi_config WHERE empresa_id = 1 AND deleted_at IS NULL;"))).toBe(0);
  });

  it('rejects tenantless inserts on qualificacoes_tipos and importacoes_log', () => {
    const dbPath = setupTestDb();
    applyMigration(dbPath);

    expect(() =>
      runSqlite(dbPath, "INSERT INTO importacoes_log (entidade) VALUES ('test')"),
    ).toThrow(/NOT NULL constraint failed/);

    expect(() =>
      runSqlite(dbPath, "INSERT INTO qualificacoes_tipos (codigo, nome) VALUES ('TST', 'Test Type')"),
    ).toThrow(/NOT NULL constraint failed/);
  });

  it('preserves qualificacoes_tipos unique codigo constraint scoped by deleted_at', () => {
    const dbPath = setupTestDb();
    applyMigration(dbPath);

    // Duplicate active code should fail
    expect(() =>
      runSqlite(dbPath, "INSERT INTO qualificacoes_tipos (codigo, nome, empresa_id) VALUES ('CHT', 'Duplicate CHT', 6)"),
    ).toThrow(/UNIQUE constraint failed/);

    // Same code on different tenant should succeed (if unique index is by codigo only)
    // Note: the rebuild creates a unique index on codigo WHERE deleted_at IS NULL
    // but no empresa_id scope — same code different tenant would fail. This is the existing behavior.
  });

  it('preserves integrity and foreign keys', () => {
    const dbPath = setupTestDb();
    applyMigration(dbPath);

    expect(scalar(dbPath, 'PRAGMA integrity_check;')).toBe('ok');
    expect(scalar(dbPath, 'PRAGMA foreign_key_check;')).toBe('');
  });
});
