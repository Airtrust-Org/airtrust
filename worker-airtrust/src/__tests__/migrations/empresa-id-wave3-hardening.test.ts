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

function rows(dbPath: string, sql: string): string[] {
  return runSqlite(dbPath, `${sql}\n`)
    .trim()
    .split('\n')
    .filter(Boolean);
}

function colInfo(dbPath: string, table: string, column = 'empresa_id'): ColumnInfo {
  const [line] = rows(
    dbPath,
    `SELECT cid, name, type, "notnull", COALESCE(dflt_value, 'NULL'), pk FROM pragma_table_info('${table}') WHERE name='${column}';`,
  );
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
  return readFileSync(join(__dirname, '../../../migrations/0399_harden_empresa_id_wave3.sql'), 'utf8');
}

describe('Wave 3 — empresa_id hardening', () => {
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
    const tmpDir = mkdtempSync(join(tmpdir(), 'wave3-'));
    tempDirs.push(tmpDir);
    const dbPath = join(tmpDir, 'test.db');

    runSqlite(
      dbPath,
      `
      PRAGMA foreign_keys = ON;

      CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT);
      INSERT INTO empresas (id, nome) VALUES (6, 'Tenant 6'), (7, 'Tenant 7');

      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );
      INSERT INTO funcionarios (id, nome, empresa_id, deleted_at) VALUES
        (1, 'Ativo 6', 6, NULL),
        (2, 'Soft Deleted 6', 6, datetime('now')),
        (3, 'Ativo 7', 7, NULL);

      CREATE TABLE documentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        funcionario_id INTEGER NOT NULL,
        nome_arquivo TEXT NOT NULL,
        tipo TEXT NOT NULL,
        tamanho INTEGER NOT NULL,
        r2_key TEXT NOT NULL UNIQUE,
        descricao TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT DEFAULT NULL,
        empresa_id INTEGER DEFAULT 1,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      );
      CREATE INDEX idx_documentos_deleted ON documentos(deleted_at);
      CREATE INDEX idx_documentos_empresa ON documentos(empresa_id);
      CREATE INDEX idx_documentos_funcionario ON documentos(funcionario_id);
      CREATE INDEX idx_documentos_funcionario_tipo ON documentos(funcionario_id, tipo) WHERE deleted_at IS NULL;
      CREATE INDEX idx_documentos_tipo ON documentos(tipo) WHERE deleted_at IS NULL;
      INSERT INTO documentos (id, uuid, funcionario_id, nome_arquivo, tipo, tamanho, r2_key, empresa_id, deleted_at)
      VALUES
        (1, 'doc-1', 1, 'ativo-a.pdf', 'application/pdf', 100, 'r2/a.pdf', 1, NULL),
        (2, 'doc-2', 2, 'soft-del.pdf', 'application/pdf', 200, 'r2/b.pdf', 6, NULL),
        (3, 'doc-3', 3, 'tenant7.pdf', 'application/pdf', 300, 'r2/c.pdf', 7, datetime('now'));

      CREATE TABLE pasta_virtual (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        tipo_documento TEXT NOT NULL,
        categoria TEXT,
        caminho_arquivo TEXT,
        arquivourl TEXT,
        nome_arquivo TEXT,
        nomeoriginal TEXT,
        arquivo_tamanho INTEGER,
        tamanho INTEGER,
        dataupload TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        uploadedby INTEGER,
        certificacao_id INTEGER,
        descricao TEXT,
        deleted_at TEXT,
        empresa_id INTEGER DEFAULT 1,
        FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_pasta_virtual_deleted ON pasta_virtual(deleted_at);
      CREATE INDEX idx_pasta_virtual_empresa ON pasta_virtual(empresa_id);
      CREATE INDEX idx_pasta_virtual_funcionario ON pasta_virtual(funcionario_id);
      INSERT INTO pasta_virtual (id, funcionario_id, tipo_documento, nome_arquivo, empresa_id, deleted_at)
      VALUES
        (10, 1, 'CERTIFICADO', 'pv-a.pdf', 1, NULL),
        (11, 2, 'CERTIFICADO', 'pv-b.pdf', 6, NULL),
        (12, 3, 'CERTIFICADO', 'pv-c.pdf', 7, datetime('now'));

      CREATE TABLE tipos_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL,
        nome TEXT NOT NULL,
        descricao TEXT,
        ativo INTEGER DEFAULT 1,
        ordem INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now')),
        deleted_at DATETIME,
        empresa_id INTEGER DEFAULT 1,
        UNIQUE(codigo, deleted_at)
      );
      CREATE INDEX idx_tipos_sessao_codigo ON tipos_sessao(codigo) WHERE deleted_at IS NULL;
      CREATE INDEX idx_tipos_sessao_deleted_at ON tipos_sessao(deleted_at);
      CREATE INDEX idx_tipos_sessao_empresa ON tipos_sessao(empresa_id);
      INSERT INTO tipos_sessao (id, codigo, nome, empresa_id, deleted_at) VALUES
        (14, 'INI', 'Inicial', 6, NULL),
        (15, 'INI', 'Inicial', 1, NULL),
        (16, 'SEM', 'Semestral', 1, NULL),
        (21, 'SEM', 'Semestral', 6, NULL),
        (17, 'VFR', 'VFR', 1, datetime('now')),
        (18, 'IFR', 'IFR', 1, datetime('now')),
        (20, 'EXA', 'Examinador', 1, datetime('now')),
        (23, 'EXA', 'Examinador', 6, NULL);

      CREATE TABLE simulador_agendamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo_sessao TEXT,
        empresa_id INTEGER,
        deleted_at TEXT
      );
      INSERT INTO simulador_agendamentos (id, tipo_sessao, empresa_id, deleted_at) VALUES
        (1, 'INI', 6, NULL),
        (2, 'SEM', 6, NULL);

      CREATE TABLE funcoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL,
        descricao TEXT,
        categoria TEXT,
        ativo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        empresa_id INTEGER DEFAULT 1
      );
      CREATE INDEX idx_funcoes_ativo ON funcoes(ativo) WHERE deleted_at IS NULL;
      CREATE INDEX idx_funcoes_codigo ON funcoes(codigo) WHERE deleted_at IS NULL;
      CREATE INDEX idx_funcoes_deleted_at ON funcoes(deleted_at);
      CREATE INDEX idx_funcoes_empresa ON funcoes(empresa_id);
      INSERT INTO funcoes (id, codigo, nome, empresa_id, deleted_at) VALUES
        (1, 'CMD', 'Comandante', 6, NULL),
        (2, 'COP', 'Copiloto', 7, NULL),
        (3, 'LEG', 'Legado', 6, datetime('now'));

      CREATE TABLE setores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL,
        descricao TEXT,
        responsavel TEXT,
        ativo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        empresa_id INTEGER DEFAULT 1
      );
      CREATE INDEX idx_setores_ativo ON setores(ativo) WHERE deleted_at IS NULL;
      CREATE INDEX idx_setores_codigo ON setores(codigo) WHERE deleted_at IS NULL;
      CREATE INDEX idx_setores_empresa ON setores(empresa_id);
      INSERT INTO setores (id, codigo, nome, empresa_id, deleted_at) VALUES
        (1, 'OPS', 'Operações', 6, NULL),
        (2, 'OPS7', 'Operações', 7, NULL),
        (3, 'LEG', 'Legado', 6, datetime('now'));

      CREATE TABLE notificacoes_convocacao_cc_gestores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        email TEXT,
        cargo TEXT,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );
      INSERT INTO notificacoes_convocacao_cc_gestores (id, nome, email, cargo, ativo, deleted_at)
      VALUES (1, 'Gestor', 'gestor@test', 'Manager', 1, NULL);

      CREATE TABLE setores_gestores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setor_id INTEGER NOT NULL,
        gestor_id INTEGER NOT NULL,
        empresa_id INTEGER NOT NULL,
        role TEXT DEFAULT 'manager',
        ativo INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT,
        FOREIGN KEY (setor_id) REFERENCES setores(id),
        FOREIGN KEY (gestor_id) REFERENCES notificacoes_convocacao_cc_gestores(id),
        FOREIGN KEY (empresa_id) REFERENCES empresas(id)
      );
      CREATE INDEX idx_setores_gestores_empresa ON setores_gestores(empresa_id) WHERE deleted_at IS NULL;
      CREATE INDEX idx_setores_gestores_gestor ON setores_gestores(gestor_id, empresa_id, ativo) WHERE deleted_at IS NULL;
      CREATE INDEX idx_setores_gestores_role ON setores_gestores(role, ativo) WHERE deleted_at IS NULL;
      CREATE INDEX idx_setores_gestores_setor ON setores_gestores(setor_id, empresa_id, ativo) WHERE deleted_at IS NULL;
      CREATE UNIQUE INDEX idx_setores_gestores_unique ON setores_gestores(setor_id, gestor_id, empresa_id) WHERE deleted_at IS NULL;
      INSERT INTO setores_gestores (id, setor_id, gestor_id, empresa_id, role, ativo, deleted_at)
      VALUES (1, 1, 1, 6, 'manager', 1, NULL);

      CREATE VIEW vw_setores_gestores_ativo AS
      SELECT
        sg.id,
        sg.setor_id,
        sg.gestor_id,
        sg.empresa_id,
        sg.role,
        s.nome as setor_nome,
        s.codigo as setor_codigo,
        g.nome as gestor_nome,
        g.email as gestor_email,
        g.cargo as gestor_cargo,
        sg.created_at
      FROM setores_gestores sg
      INNER JOIN setores s ON s.id = sg.setor_id
      INNER JOIN notificacoes_convocacao_cc_gestores g ON g.id = sg.gestor_id
      WHERE sg.deleted_at IS NULL
        AND sg.ativo = 1
        AND s.deleted_at IS NULL
        AND s.ativo = 1
        AND g.deleted_at IS NULL
        AND g.ativo = 1;

      CREATE TABLE arquivos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER NOT NULL,
        nome_original TEXT NOT NULL,
        nome_arquivo TEXT NOT NULL,
        categoria TEXT DEFAULT 'geral',
        tamanho INTEGER,
        tipo TEXT,
        url_r2 TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT,
        deleted_at TEXT,
        empresa_id INTEGER DEFAULT 1,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
      );
      CREATE INDEX idx_arquivos_empresa ON arquivos(empresa_id);
      `,
    );

    return dbPath;
  }

  function applyMigration(dbPath: string) {
    runSqlite(dbPath, migrationSql());
  }

  it('hardens empresa_id and preserves row counts across the included tables', () => {
    const dbPath = setupTestDb();

    expect(colInfo(dbPath, 'documentos').dflt_value).toBe('1');
    applyMigration(dbPath);

    for (const table of ['documentos', 'pasta_virtual', 'tipos_sessao', 'funcoes', 'setores', 'arquivos']) {
      const info = colInfo(dbPath, table);
      expect(info.notnull).toBe(1);
      expect(info.dflt_value).toBeNull();
    }

    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM documentos;'))).toBe(3);
    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM pasta_virtual;'))).toBe(3);
    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM tipos_sessao;'))).toBe(8);
    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM funcoes;'))).toBe(3);
    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM setores;'))).toBe(3);
    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM arquivos;'))).toBe(0);
  });

  it('eliminates empresa_id=1 residuals and keeps deterministic tenant resolution', () => {
    const dbPath = setupTestDb();
    applyMigration(dbPath);

    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM documentos WHERE empresa_id = 1;'))).toBe(0);
    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM pasta_virtual WHERE empresa_id = 1;'))).toBe(0);
    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM tipos_sessao WHERE empresa_id = 1;'))).toBe(0);

    expect(scalar(dbPath, 'SELECT empresa_id FROM documentos WHERE id = 1;')).toBe('6');
    expect(scalar(dbPath, 'SELECT empresa_id FROM documentos WHERE id = 2;')).toBe('6');
    expect(scalar(dbPath, 'SELECT empresa_id FROM pasta_virtual WHERE id = 10;')).toBe('6');
    expect(scalar(dbPath, 'SELECT empresa_id FROM pasta_virtual WHERE id = 11;')).toBe('6');

    expect(scalar(dbPath, 'SELECT empresa_id FROM tipos_sessao WHERE id = 15;')).toBe('6');
    expect(scalar(dbPath, 'SELECT empresa_id FROM tipos_sessao WHERE id = 16;')).toBe('6');
    expect(scalar(dbPath, 'SELECT empresa_id FROM tipos_sessao WHERE id = 17;')).toBe('6');
    expect(scalar(dbPath, 'SELECT empresa_id FROM tipos_sessao WHERE id = 18;')).toBe('6');
    expect(Number(scalar(dbPath, "SELECT COUNT(*) FROM tipos_sessao WHERE codigo = 'INI' AND empresa_id = 6 AND deleted_at IS NULL;"))).toBe(1);
    expect(Number(scalar(dbPath, "SELECT COUNT(*) FROM tipos_sessao WHERE codigo = 'SEM' AND empresa_id = 6 AND deleted_at IS NULL;"))).toBe(1);
    expect(scalar(dbPath, 'SELECT deleted_at IS NOT NULL FROM tipos_sessao WHERE id = 15;')).toBe('1');
    expect(scalar(dbPath, 'SELECT deleted_at IS NOT NULL FROM tipos_sessao WHERE id = 16;')).toBe('1');
  });

  it('preserves expected indexes and keeps dependent views queryable', () => {
    const dbPath = setupTestDb();
    applyMigration(dbPath);

    expect(rows(dbPath, "SELECT name FROM pragma_index_list('documentos') ORDER BY name;")).toEqual([
      'idx_documentos_deleted',
      'idx_documentos_empresa',
      'idx_documentos_funcionario',
      'idx_documentos_funcionario_tipo',
      'idx_documentos_tipo',
      'sqlite_autoindex_documentos_1',
      'sqlite_autoindex_documentos_2',
    ]);
    expect(rows(dbPath, "SELECT name FROM pragma_index_list('tipos_sessao') ORDER BY name;")).toEqual([
      'idx_tipos_sessao_codigo',
      'idx_tipos_sessao_deleted_at',
      'idx_tipos_sessao_empresa',
    ]);
    expect(rows(dbPath, "SELECT name FROM pragma_index_list('funcoes') ORDER BY name;")).toEqual([
      'idx_funcoes_ativo',
      'idx_funcoes_codigo',
      'idx_funcoes_deleted_at',
      'idx_funcoes_empresa',
    ]);
    expect(rows(dbPath, "SELECT name FROM pragma_index_list('setores') ORDER BY name;")).toEqual([
      'idx_setores_ativo',
      'idx_setores_codigo',
      'idx_setores_empresa',
    ]);

    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM vw_setores_gestores_ativo;'))).toBe(1);
    expect(scalar(dbPath, 'PRAGMA integrity_check;')).toBe('ok');
    expect(scalar(dbPath, 'PRAGMA foreign_key_check;')).toBe('');
  });

  it('enforces active codigo uniqueness per tenant after rebuild', () => {
    const dbPath = setupTestDb();
    applyMigration(dbPath);

    runSqlite(
      dbPath,
      `
      INSERT INTO funcoes (codigo, nome, empresa_id) VALUES ('DUP', 'Dup A', 6);
      INSERT INTO funcoes (codigo, nome, empresa_id) VALUES ('DUP', 'Dup B', 7);
      INSERT INTO setores (codigo, nome, empresa_id) VALUES ('OPSX', 'Ops X', 6);
      INSERT INTO setores (codigo, nome, empresa_id) VALUES ('OPSX', 'Ops X 7', 7);
      INSERT INTO tipos_sessao (codigo, nome, empresa_id) VALUES ('CHK', 'Check', 6);
      INSERT INTO tipos_sessao (codigo, nome, empresa_id) VALUES ('CHK', 'Check 7', 7);
      `,
    );

    expect(() =>
      runSqlite(dbPath, `INSERT INTO funcoes (codigo, nome, empresa_id) VALUES ('DUP', 'Dup Again', 6);`),
    ).toThrow(/UNIQUE constraint failed/);
    expect(() =>
      runSqlite(dbPath, `INSERT INTO setores (codigo, nome, empresa_id) VALUES ('OPSX', 'Ops Again', 6);`),
    ).toThrow(/UNIQUE constraint failed/);
    expect(() =>
      runSqlite(dbPath, `INSERT INTO tipos_sessao (codigo, nome, empresa_id) VALUES ('CHK', 'Check Again', 6);`),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('rejects tenantless inserts on the hardened tables, including empty arquivos', () => {
    const dbPath = setupTestDb();
    applyMigration(dbPath);

    expect(() =>
      runSqlite(
        dbPath,
        `INSERT INTO arquivos (funcionario_id, nome_original, nome_arquivo, url_r2) VALUES (1, 'raw.pdf', 'raw.pdf', 'r2/raw.pdf');`,
      ),
    ).toThrow(/NOT NULL constraint failed: arquivos.empresa_id/);

    runSqlite(
      dbPath,
      `INSERT INTO arquivos (funcionario_id, nome_original, nome_arquivo, url_r2, empresa_id) VALUES (1, 'raw.pdf', 'raw.pdf', 'r2/raw.pdf', 6);`,
    );
    expect(Number(scalar(dbPath, 'SELECT COUNT(*) FROM arquivos WHERE empresa_id = 6;'))).toBe(1);
  });
});
