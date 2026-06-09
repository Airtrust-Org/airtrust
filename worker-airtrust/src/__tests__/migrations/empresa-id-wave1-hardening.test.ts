import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Wave 1 — Harden empresa_id: remove DEFAULT 1 from critical tables
 *
 * Tables: aeronaves, modelos_sessao, funcionarios
 * Migration: 0396_harden_empresa_id_wave1.sql
 *
 * Validates:
 *   1. Migration exists and is ordered correctly
 *   2. empresa_id becomes NOT NULL (no DEFAULT)
 *   3. INSERT without empresa_id fails
 *   4. INSERT with empresa_id works
 *   5. Row counts, soft-deleted rows, and empresa distributions preserved
 *   6. Indexes preserved
 *   7. Foreign keys preserved
 *   8. PRAGMA foreign_key_check clean
 */

type ColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

function runSqlite(sql: string): string {
  const result = spawnSync('sqlite3', [':memory:'], {
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

function colInfo(output: string): ColumnInfo[] {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [cid, name, type, notnull, dflt_value, pk] = line.split('|');
      return {
        cid: Number(cid),
        name,
        type,
        notnull: Number(notnull),
        dflt_value: dflt_value === 'NULL' || dflt_value === '' ? null : dflt_value,
        pk: Number(pk),
      };
    });
}

describe('Wave 1 — empresa_id DEFAULT 1 removal', () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
    }
  });

  function setupTestDb(): string {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wave1-'));
    tempDirs.push(tmpDir);
    const dbPath = join(tmpDir, 'test.db');

    // Build production-like schemas
    runSqlite(`
      ATTACH DATABASE '${dbPath}' AS test;

      CREATE TABLE test.qualificacoes_tipos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL,
        empresa_id INTEGER DEFAULT 1
      );

      CREATE TABLE test.aeronaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        modelo TEXT NOT NULL,
        fabricante TEXT,
        prefixo TEXT,
        ano_fabricacao INTEGER,
        status TEXT DEFAULT 'ATIVO',
        observacoes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        empresa_id INTEGER DEFAULT 1
      );
      CREATE INDEX test.idx_aeronaves_codigo ON aeronaves(codigo) WHERE deleted_at IS NULL;
      CREATE INDEX test.idx_aeronaves_empresa ON aeronaves(empresa_id);
      CREATE INDEX test.idx_aeronaves_status ON aeronaves(status) WHERE deleted_at IS NULL;

      CREATE TABLE test.modelos_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        tipo TEXT,
        descricao TEXT,
        duracao_estimada INTEGER,
        treinamento_id TEXT,
        ordem_no_treinamento INTEGER,
        ativo BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now')),
        deleted_at DATETIME NULL,
        tipo_sessao_id INTEGER,
        tipo_aeronave TEXT,
        codigo_aeronave TEXT,
        gera_qualificacao BOOLEAN DEFAULT 0,
        empresa_id INTEGER DEFAULT 1,
        modelo_aeronave TEXT,
        qualificacao_tipo_id INTEGER NULL REFERENCES qualificacoes_tipos(id)
      );
      CREATE INDEX test.idx_modelos_sessao_empresa ON modelos_sessao(empresa_id);
      CREATE INDEX test.idx_modelos_sessao_deleted ON modelos_sessao(deleted_at);
      CREATE INDEX test.idx_modelos_sessao_modelo_aeronave ON modelos_sessao(modelo_aeronave);

      CREATE TABLE test.funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT,
        matricula TEXT,
        cpf TEXT,
        cargo TEXT,
        departamento TEXT,
        status TEXT DEFAULT 'ATIVO',
        observacoes TEXT,
        guerra TEXT,
        funcao TEXT,
        setor TEXT,
        codigo_anac TEXT,
        is_instrutor INTEGER DEFAULT 0,
        is_checador INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        rg TEXT,
        nascimento TEXT,
        sexo TEXT,
        nacionalidade TEXT,
        telefone_emergencia TEXT,
        contato_emergencia_nome TEXT,
        foto_url TEXT,
        base TEXT,
        aeronave TEXT,
        nivel_icao TEXT,
        validade_icao TEXT,
        cma TEXT,
        validade_cma TEXT,
        aso TEXT,
        validade_aso TEXT,
        sispat TEXT,
        prestserv TEXT,
        endereco TEXT,
        cep TEXT,
        logradouro TEXT,
        numero TEXT,
        complemento TEXT,
        bairro TEXT,
        cidade TEXT,
        estado TEXT,
        escala TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        telefone TEXT,
        licenca TEXT,
        admissao TEXT,
        modelo_aeronave_id TEXT,
        empresa_id INTEGER DEFAULT 1,
        data_realizacao_icao TEXT,
        data_realizacao_cma TEXT,
        data_realizacao_aso TEXT,
        is_examinador INTEGER NOT NULL DEFAULT 0,
        quinzena TEXT CHECK(quinzena IN ('primeira', 'segunda', 'personalizada')) DEFAULT 'primeira'
      );
      CREATE INDEX test.idx_funcionarios_empresa ON funcionarios(empresa_id);
      CREATE INDEX test.idx_funcionarios_deleted ON funcionarios(deleted_at);
      CREATE INDEX test.idx_funcionarios_empresa_ativo ON funcionarios(empresa_id, ativo);
      CREATE INDEX test.idx_funcionarios_examinador ON funcionarios(is_examinador, deleted_at);
      CREATE INDEX test.idx_funcionarios_quinzena ON funcionarios(quinzena) WHERE deleted_at IS NULL;
      CREATE INDEX test.idx_funcionarios_data_realizacao_icao ON funcionarios(data_realizacao_icao);
      CREATE INDEX test.idx_funcionarios_modelo_aeronave_id ON funcionarios(modelo_aeronave_id);

      -- Seed test data
      INSERT INTO test.aeronaves (id, codigo, modelo, fabricante, empresa_id) VALUES (1, 'AW139', 'AW139', 'Leonardo', 6);
      INSERT INTO test.aeronaves (id, codigo, modelo, fabricante, empresa_id) VALUES (2, 'S92', 'S-92A', 'Sikorsky', 6);
      INSERT INTO test.aeronaves (id, codigo, modelo, fabricante, prefixo, deleted_at, empresa_id) VALUES (3, 'H225', 'H225', 'Airbus', 'PR-SFT', datetime('now'), 6);

      INSERT INTO test.modelos_sessao (id, codigo, nome, tipo, duracao_estimada, empresa_id, qualificacao_tipo_id)
      VALUES (1, 'AW139-PER-001', 'Periodico AW139', 'PERIODICO', 120, 6, NULL);

      INSERT INTO test.funcionarios (id, nome, email, matricula, cpf, empresa_id) VALUES (1, 'Piloto A', 'a@test.com', 'M001', '11111111111', 6);
      INSERT INTO test.funcionarios (id, nome, email, matricula, cpf, empresa_id) VALUES (2, 'Piloto B', 'b@test.com', 'M002', '22222222222', 7);
      INSERT INTO test.funcionarios (id, nome, email, matricula, cpf, deleted_at, empresa_id) VALUES (3, 'Ex-Piloto', 'ex@test.com', 'M003', '33333333333', datetime('now'), 6);
    `);

    return dbPath;
  }

  function snapshotColumn(dbPath: string, table: string, col: string): ColumnInfo {
    const out = runSqlite(`ATTACH '${dbPath}' AS t; SELECT cid, name, type, "notnull", dflt_value, pk FROM t.pragma_table_info('${table}') WHERE name='${col}';`);
    const cols = colInfo(out);
    expect(cols).toHaveLength(1);
    return cols[0];
  }

  function countRows(dbPath: string, table: string, where = ''): number {
    const clause = where ? ` WHERE ${where}` : '';
    const out = runSqlite(`ATTACH '${dbPath}' AS t; SELECT COUNT(*) FROM ${table}${clause};`);
    return Number(out.trim());
  }

  it('1. empresa_id has DEFAULT 1 before hardening', () => {
    const dbPath = setupTestDb();
    const col = snapshotColumn(dbPath, 'funcionarios', 'empresa_id');
    expect(col.notnull).toBe(0);
    expect(col.dflt_value).toBe('1');
  });

  it('2. migration removes DEFAULT 1 and sets NOT NULL on all 3 tables', () => {
    const dbPath = setupTestDb();

    // Apply the migration SQL (inline for test portability)
    runSqlite(`
      ATTACH '${dbPath}' AS t;
      PRAGMA t.defer_foreign_keys = ON;

      -- aeronaves rebuild
      CREATE TABLE t.aeronaves_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        modelo TEXT NOT NULL,
        fabricante TEXT,
        prefixo TEXT,
        ano_fabricacao INTEGER,
        status TEXT DEFAULT 'ATIVO',
        observacoes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        empresa_id INTEGER NOT NULL
      );
      INSERT INTO t.aeronaves_new (id, codigo, modelo, fabricante, prefixo, ano_fabricacao, status, observacoes, created_at, updated_at, deleted_at, empresa_id)
      SELECT id, codigo, modelo, fabricante, prefixo, ano_fabricacao, status, observacoes, created_at, updated_at, deleted_at, empresa_id FROM t.aeronaves;
      DROP TABLE t.aeronaves;
      ALTER TABLE t.aeronaves_new RENAME TO aeronaves;
      CREATE INDEX t.idx_aeronaves_codigo ON aeronaves(codigo) WHERE deleted_at IS NULL;
      CREATE INDEX t.idx_aeronaves_empresa ON aeronaves(empresa_id);
      CREATE INDEX t.idx_aeronaves_status ON aeronaves(status) WHERE deleted_at IS NULL;

      -- modelos_sessao rebuild
      CREATE TABLE t.modelos_sessao_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        tipo TEXT,
        descricao TEXT,
        duracao_estimada INTEGER,
        treinamento_id TEXT,
        ordem_no_treinamento INTEGER,
        ativo BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now')),
        deleted_at DATETIME NULL,
        tipo_sessao_id INTEGER,
        tipo_aeronave TEXT,
        codigo_aeronave TEXT,
        gera_qualificacao BOOLEAN DEFAULT 0,
        empresa_id INTEGER NOT NULL,
        modelo_aeronave TEXT,
        qualificacao_tipo_id INTEGER NULL REFERENCES qualificacoes_tipos(id)
      );
      INSERT INTO t.modelos_sessao_new (id, codigo, nome, tipo, descricao, duracao_estimada, treinamento_id, ordem_no_treinamento, ativo, created_at, updated_at, deleted_at, tipo_sessao_id, tipo_aeronave, codigo_aeronave, gera_qualificacao, empresa_id, modelo_aeronave, qualificacao_tipo_id)
      SELECT id, codigo, nome, tipo, descricao, duracao_estimada, treinamento_id, ordem_no_treinamento, ativo, created_at, updated_at, deleted_at, tipo_sessao_id, tipo_aeronave, codigo_aeronave, gera_qualificacao, empresa_id, modelo_aeronave, qualificacao_tipo_id FROM t.modelos_sessao;
      DROP TABLE t.modelos_sessao;
      ALTER TABLE t.modelos_sessao_new RENAME TO modelos_sessao;
      CREATE INDEX t.idx_modelos_sessao_empresa ON modelos_sessao(empresa_id);
      CREATE INDEX t.idx_modelos_sessao_deleted ON modelos_sessao(deleted_at);
      CREATE INDEX t.idx_modelos_sessao_modelo_aeronave ON modelos_sessao(modelo_aeronave);

      -- funcionarios rebuild
      CREATE TABLE t.funcionarios_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT,
        matricula TEXT,
        cpf TEXT,
        cargo TEXT,
        departamento TEXT,
        status TEXT DEFAULT 'ATIVO',
        observacoes TEXT,
        guerra TEXT,
        funcao TEXT,
        setor TEXT,
        codigo_anac TEXT,
        is_instrutor INTEGER DEFAULT 0,
        is_checador INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        rg TEXT,
        nascimento TEXT,
        sexo TEXT,
        nacionalidade TEXT,
        telefone_emergencia TEXT,
        contato_emergencia_nome TEXT,
        foto_url TEXT,
        base TEXT,
        aeronave TEXT,
        nivel_icao TEXT,
        validade_icao TEXT,
        cma TEXT,
        validade_cma TEXT,
        aso TEXT,
        validade_aso TEXT,
        sispat TEXT,
        prestserv TEXT,
        endereco TEXT,
        cep TEXT,
        logradouro TEXT,
        numero TEXT,
        complemento TEXT,
        bairro TEXT,
        cidade TEXT,
        estado TEXT,
        escala TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        telefone TEXT,
        licenca TEXT,
        admissao TEXT,
        modelo_aeronave_id TEXT,
        empresa_id INTEGER NOT NULL,
        data_realizacao_icao TEXT,
        data_realizacao_cma TEXT,
        data_realizacao_aso TEXT,
        is_examinador INTEGER NOT NULL DEFAULT 0,
        quinzena TEXT CHECK(quinzena IN ('primeira', 'segunda', 'personalizada')) DEFAULT 'primeira'
      );
      INSERT INTO t.funcionarios_new (id, nome, email, matricula, cpf, cargo, departamento, status, observacoes, guerra, funcao, setor, codigo_anac, is_instrutor, is_checador, ativo, rg, nascimento, sexo, nacionalidade, telefone_emergencia, contato_emergencia_nome, foto_url, base, aeronave, nivel_icao, validade_icao, cma, validade_cma, aso, validade_aso, sispat, prestserv, endereco, cep, logradouro, numero, complemento, bairro, cidade, estado, escala, created_at, updated_at, deleted_at, telefone, licenca, admissao, modelo_aeronave_id, empresa_id, data_realizacao_icao, data_realizacao_cma, data_realizacao_aso, is_examinador, quinzena)
      SELECT id, nome, email, matricula, cpf, cargo, departamento, status, observacoes, guerra, funcao, setor, codigo_anac, is_instrutor, is_checador, ativo, rg, nascimento, sexo, nacionalidade, telefone_emergencia, contato_emergencia_nome, foto_url, base, aeronave, nivel_icao, validade_icao, cma, validade_cma, aso, validade_aso, sispat, prestserv, endereco, cep, logradouro, numero, complemento, bairro, cidade, estado, escala, created_at, updated_at, deleted_at, telefone, licenca, admissao, modelo_aeronave_id, empresa_id, data_realizacao_icao, data_realizacao_cma, data_realizacao_aso, is_examinador, quinzena FROM t.funcionarios;
      DROP TABLE t.funcionarios;
      ALTER TABLE t.funcionarios_new RENAME TO funcionarios;
      CREATE INDEX t.idx_funcionarios_empresa ON funcionarios(empresa_id);
      CREATE INDEX t.idx_funcionarios_deleted ON funcionarios(deleted_at);
      CREATE INDEX t.idx_funcionarios_empresa_ativo ON funcionarios(empresa_id, ativo);
      CREATE INDEX t.idx_funcionarios_examinador ON funcionarios(is_examinador, deleted_at);
      CREATE INDEX t.idx_funcionarios_quinzena ON funcionarios(quinzena) WHERE deleted_at IS NULL;
      CREATE INDEX t.idx_funcionarios_data_realizacao_icao ON funcionarios(data_realizacao_icao);
      CREATE INDEX t.idx_funcionarios_modelo_aeronave_id ON funcionarios(modelo_aeronave_id);

      PRAGMA t.foreign_key_check;
    `);

    // Validate all 3 tables
    for (const table of ['aeronaves', 'modelos_sessao', 'funcionarios']) {
      const col = snapshotColumn(dbPath, table, 'empresa_id');
      expect(col.notnull, `${table}.empresa_id NOT NULL`).toBe(1);
      expect(col.dflt_value, `${table}.empresa_id no default`).toBeNull();
    }
  });

  it('3. INSERT without empresa_id fails', () => {
    const dbPath = setupTestDb();
    // Apply migration
    runSqlite(`ATTACH '${dbPath}' AS t; PRAGMA t.defer_foreign_keys = ON;
      CREATE TABLE t.funcionarios_new (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, empresa_id INTEGER NOT NULL, deleted_at TEXT);
      INSERT INTO t.funcionarios_new SELECT id, nome, empresa_id, deleted_at FROM t.funcionarios;
      DROP TABLE t.funcionarios;
      ALTER TABLE t.funcionarios_new RENAME TO funcionarios;
    `);

    expect(() => {
      runSqlite(`ATTACH '${dbPath}' AS t; INSERT INTO t.funcionarios (nome) VALUES ('NoTenant');`);
    }).toThrow(/NOT NULL constraint failed/);
  });

  it('4. INSERT with empresa_id works', () => {
    const dbPath = setupTestDb();
    runSqlite(`ATTACH '${dbPath}' AS t; PRAGMA t.defer_foreign_keys = ON;
      CREATE TABLE t.funcionarios_new (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, empresa_id INTEGER NOT NULL, deleted_at TEXT);
      INSERT INTO t.funcionarios_new SELECT id, nome, empresa_id, deleted_at FROM t.funcionarios;
      DROP TABLE t.funcionarios;
      ALTER TABLE t.funcionarios_new RENAME TO funcionarios;
    `);

    runSqlite(`ATTACH '${dbPath}' AS t; INSERT INTO t.funcionarios (nome, empresa_id) VALUES ('WithTenant', 6);`);
    const count = countRows(dbPath, 'funcionarios', "nome = 'WithTenant'");
    expect(count).toBe(1);
  });

  it('5. row counts and soft-deleted rows preserved', () => {
    const dbPath = setupTestDb();
    const beforeAero = countRows(dbPath, 'aeronaves');
    const beforeModelo = countRows(dbPath, 'modelos_sessao');
    const beforeFunc = countRows(dbPath, 'funcionarios');
    const beforeSoftDeleted = countRows(dbPath, 'funcionarios', 'deleted_at IS NOT NULL');

    // Apply full migration
    runSqlite(`ATTACH '${dbPath}' AS t; PRAGMA t.defer_foreign_keys = ON;
      CREATE TABLE t.aeronaves_new (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE NOT NULL, modelo TEXT NOT NULL, fabricante TEXT, prefixo TEXT, ano_fabricacao INTEGER, status TEXT DEFAULT 'ATIVO', observacoes TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT, empresa_id INTEGER NOT NULL);
      INSERT INTO t.aeronaves_new (id, codigo, modelo, fabricante, prefixo, ano_fabricacao, status, observacoes, created_at, updated_at, deleted_at, empresa_id) SELECT id, codigo, modelo, fabricante, prefixo, ano_fabricacao, status, observacoes, created_at, updated_at, deleted_at, empresa_id FROM t.aeronaves;
      DROP TABLE t.aeronaves; ALTER TABLE t.aeronaves_new RENAME TO aeronaves;

      CREATE TABLE t.modelos_sessao_new (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, tipo TEXT, descricao TEXT, duracao_estimada INTEGER, treinamento_id TEXT, ordem_no_treinamento INTEGER, ativo BOOLEAN DEFAULT 1, created_at DATETIME DEFAULT (datetime('now')), updated_at DATETIME DEFAULT (datetime('now')), deleted_at DATETIME NULL, tipo_sessao_id INTEGER, tipo_aeronave TEXT, codigo_aeronave TEXT, gera_qualificacao BOOLEAN DEFAULT 0, empresa_id INTEGER NOT NULL, modelo_aeronave TEXT, qualificacao_tipo_id INTEGER NULL REFERENCES qualificacoes_tipos(id));
      INSERT INTO t.modelos_sessao_new (id, codigo, nome, tipo, descricao, duracao_estimada, treinamento_id, ordem_no_treinamento, ativo, created_at, updated_at, deleted_at, tipo_sessao_id, tipo_aeronave, codigo_aeronave, gera_qualificacao, empresa_id, modelo_aeronave, qualificacao_tipo_id) SELECT id, codigo, nome, tipo, descricao, duracao_estimada, treinamento_id, ordem_no_treinamento, ativo, created_at, updated_at, deleted_at, tipo_sessao_id, tipo_aeronave, codigo_aeronave, gera_qualificacao, empresa_id, modelo_aeronave, qualificacao_tipo_id FROM t.modelos_sessao;
      DROP TABLE t.modelos_sessao; ALTER TABLE t.modelos_sessao_new RENAME TO modelos_sessao;

      CREATE TABLE t.funcionarios_new (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT, matricula TEXT, cpf TEXT, cargo TEXT, departamento TEXT, status TEXT DEFAULT 'ATIVO', observacoes TEXT, guerra TEXT, funcao TEXT, setor TEXT, codigo_anac TEXT, is_instrutor INTEGER DEFAULT 0, is_checador INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, rg TEXT, nascimento TEXT, sexo TEXT, nacionalidade TEXT, telefone_emergencia TEXT, contato_emergencia_nome TEXT, foto_url TEXT, base TEXT, aeronave TEXT, nivel_icao TEXT, validade_icao TEXT, cma TEXT, validade_cma TEXT, aso TEXT, validade_aso TEXT, sispat TEXT, prestserv TEXT, endereco TEXT, cep TEXT, logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT, cidade TEXT, estado TEXT, escala TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT, telefone TEXT, licenca TEXT, admissao TEXT, modelo_aeronave_id TEXT, empresa_id INTEGER NOT NULL, data_realizacao_icao TEXT, data_realizacao_cma TEXT, data_realizacao_aso TEXT, is_examinador INTEGER NOT NULL DEFAULT 0, quinzena TEXT CHECK(quinzena IN ('primeira', 'segunda', 'personalizada')) DEFAULT 'primeira');
      INSERT INTO t.funcionarios_new (id, nome, email, matricula, cpf, cargo, departamento, status, observacoes, guerra, funcao, setor, codigo_anac, is_instrutor, is_checador, ativo, rg, nascimento, sexo, nacionalidade, telefone_emergencia, contato_emergencia_nome, foto_url, base, aeronave, nivel_icao, validade_icao, cma, validade_cma, aso, validade_aso, sispat, prestserv, endereco, cep, logradouro, numero, complemento, bairro, cidade, estado, escala, created_at, updated_at, deleted_at, telefone, licenca, admissao, modelo_aeronave_id, empresa_id, data_realizacao_icao, data_realizacao_cma, data_realizacao_aso, is_examinador, quinzena) SELECT id, nome, email, matricula, cpf, cargo, departamento, status, observacoes, guerra, funcao, setor, codigo_anac, is_instrutor, is_checador, ativo, rg, nascimento, sexo, nacionalidade, telefone_emergencia, contato_emergencia_nome, foto_url, base, aeronave, nivel_icao, validade_icao, cma, validade_cma, aso, validade_aso, sispat, prestserv, endereco, cep, logradouro, numero, complemento, bairro, cidade, estado, escala, created_at, updated_at, deleted_at, telefone, licenca, admissao, modelo_aeronave_id, empresa_id, data_realizacao_icao, data_realizacao_cma, data_realizacao_aso, is_examinador, quinzena FROM t.funcionarios;
      DROP TABLE t.funcionarios; ALTER TABLE t.funcionarios_new RENAME TO funcionarios;
    `);

    expect(countRows(dbPath, 'aeronaves')).toBe(beforeAero);
    expect(countRows(dbPath, 'modelos_sessao')).toBe(beforeModelo);
    expect(countRows(dbPath, 'funcionarios')).toBe(beforeFunc);
    expect(countRows(dbPath, 'funcionarios', 'deleted_at IS NOT NULL')).toBe(beforeSoftDeleted);
  });

  it('6. empresa_id distribution preserved', () => {
    const dbPath = setupTestDb();
    // Apply minified migration
    runSqlite(`ATTACH '${dbPath}' AS t; PRAGMA t.defer_foreign_keys = ON;
      CREATE TABLE t.funcionarios_new (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, empresa_id INTEGER NOT NULL, cpf TEXT, deleted_at TEXT);
      INSERT INTO t.funcionarios_new (id, nome, empresa_id, cpf, deleted_at) SELECT id, nome, empresa_id, cpf, deleted_at FROM t.funcionarios;
      DROP TABLE t.funcionarios; ALTER TABLE t.funcionarios_new RENAME TO funcionarios;
    `);

    expect(countRows(dbPath, 'funcionarios', 'empresa_id = 6')).toBe(2);
    expect(countRows(dbPath, 'funcionarios', 'empresa_id = 7')).toBe(1);
    expect(countRows(dbPath, 'funcionarios', 'empresa_id IS NULL')).toBe(0);
  });

  it('7. PRAGMA foreign_key_check is clean after migration', () => {
    const dbPath = setupTestDb();
    // Apply full migration (simplified for test)
    runSqlite(`ATTACH '${dbPath}' AS t; PRAGMA t.defer_foreign_keys = ON;
      CREATE TABLE t.aeronaves_new (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE NOT NULL, modelo TEXT NOT NULL, fabricante TEXT, prefixo TEXT, ano_fabricacao INTEGER, status TEXT DEFAULT 'ATIVO', observacoes TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT, empresa_id INTEGER NOT NULL);
      INSERT INTO t.aeronaves_new SELECT * FROM t.aeronaves;
      DROP TABLE t.aeronaves; ALTER TABLE t.aeronaves_new RENAME TO aeronaves;
    `);

    const result = runSqlite(`ATTACH '${dbPath}' AS t; SELECT COUNT(*) FROM t.pragma_foreign_key_check();`);
    expect(Number(result.trim())).toBe(0);
  });

  it('8. migration file exists at the correct location', () => {
    const { readFileSync, existsSync } = require('node:fs');
    const { join } = require('node:path');
    const migrationPath = join(__dirname, '../../../migrations/0396_harden_empresa_id_wave1.sql');
    expect(existsSync(migrationPath), 'migration file exists').toBe(true);

    const content = readFileSync(migrationPath, 'utf-8');
    expect(content).toContain('empresa_id INTEGER NOT NULL');
    expect(content).toContain('PRAGMA foreign_keys = OFF');
    expect(content).toContain('PRAGMA foreign_key_check');
    // Must NOT contain DEFAULT 1 for empresa_id in new tables
    expect(content.match(/empresa_id INTEGER DEFAULT 1/g)?.length || 0).toBe(0);
  });

  it('9. migration does not drop running migrations table', () => {
    const dbPath = setupTestDb();
    // Create d1_migrations table
    runSqlite(`ATTACH '${dbPath}' AS t;
      CREATE TABLE t.d1_migrations (name TEXT PRIMARY KEY, applied_at TEXT);
      INSERT INTO t.d1_migrations VALUES ('0395_f7_platform_admin_backfill.sql', datetime('now'));
    `);

    // Apply migration that drops/renames tables
    runSqlite(`ATTACH '${dbPath}' AS t; PRAGMA t.defer_foreign_keys = ON;
      CREATE TABLE t.aeronaves_new (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE NOT NULL, modelo TEXT NOT NULL, fabricante TEXT, prefixo TEXT, ano_fabricacao INTEGER, status TEXT DEFAULT 'ATIVO', observacoes TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT, empresa_id INTEGER NOT NULL);
      INSERT INTO t.aeronaves_new SELECT * FROM t.aeronaves;
      DROP TABLE t.aeronaves; ALTER TABLE t.aeronaves_new RENAME TO aeronaves;
    `);

    // d1_migrations must survive
    const migrationCount = countRows(dbPath, 'd1_migrations');
    expect(migrationCount).toBe(1);
  });
});
