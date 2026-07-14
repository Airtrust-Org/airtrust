import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runSqlite(dbPath: string, sql: string): string {
  const result = spawnSync('sqlite3', [dbPath], {
    input: `${sql}\n`,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`sqlite3 exited ${result.status}: ${result.stderr}`);
  }

  return result.stdout.trim();
}

const MIGRATION_429 = readFileSync(
  join(__dirname, '../../../migrations/0429_instructor_event_models.sql'),
  'utf8',
);

function setupDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-inst-event-'));
  const dbPath = join(dir, 'inst-event.db');

  runSqlite(
    dbPath,
    `
      CREATE TABLE tipos_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE fichas_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT,
        empresa_id INTEGER NOT NULL
      );

      CREATE TABLE modelos_sessao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT,
        tipo TEXT,
        descricao TEXT,
        duracao_estimada INTEGER,
        tipo_aeronave TEXT,
        tipo_sessao_id INTEGER,
        ativo INTEGER DEFAULT 1,
        empresa_id INTEGER NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        deleted_at TEXT
      );

      CREATE TABLE manobras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT,
        descricao TEXT,
        categoria TEXT,
        tipo_sessao TEXT,
        tipo_aeronave TEXT,
        ordem INTEGER,
        empresa_id INTEGER,
        deleted_at TEXT
      );

      CREATE TABLE modelos_sessao_manobras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        modelo_id INTEGER NOT NULL,
        manobra_id INTEGER NOT NULL,
        ordem INTEGER NOT NULL DEFAULT 0,
        obrigatoria INTEGER DEFAULT 1,
        tripulante TEXT DEFAULT 'AB',
        deleted_at TEXT
      );

      CREATE TABLE modelos_sessao_requisitos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT,
        empresa_id INTEGER NOT NULL,
        modelo_sessao_id INTEGER NOT NULL,
        requisito_modelo_sessao_id INTEGER NOT NULL,
        tipo_requisito TEXT NOT NULL,
        obrigatorio INTEGER DEFAULT 1,
        observacao TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      INSERT INTO tipos_sessao (id, codigo, nome, empresa_id) VALUES
        (22, 'INS', 'Instrutor', 6),
        (23, 'INS', 'Instrutor', 8);

      INSERT INTO modelos_sessao (codigo, nome, tipo, ativo, empresa_id, tipo_sessao_id)
      VALUES
        ('TRE-INST', 'TREINAMENTO DE INSTRUTOR DE VOO', 'RECORRENTE', 1, 6, 22),
        ('TRE-INST', 'TREINAMENTO DE INSTRUTOR DE VOO', 'RECORRENTE', 1, 8, 23);
    `,
  );

  return dbPath;
}

describe('0429 instructor event models', () => {
  it('creates INST-E01/INST-E02 only outside tenant 8, with 18 técnicos each, and adds dedicated ficha metadata storage', () => {
    const dbPath = setupDb();
    try {
      runSqlite(dbPath, MIGRATION_429);

      const modelos = runSqlite(
        dbPath,
        `SELECT codigo, empresa_id, duracao_estimada, ativo
           FROM modelos_sessao
          WHERE codigo IN ('TRE-INST','INST-E01','INST-E02')
          ORDER BY empresa_id, codigo;`,
      );

      expect(modelos.split('\n')).toEqual([
        'INST-E01|6|120|1',
        'INST-E02|6|120|1',
        'TRE-INST|6||0',
        'TRE-INST|8||1',
      ]);

      expect(
        Number(
          runSqlite(dbPath, `SELECT COUNT(*) FROM manobras WHERE codigo LIKE 'INST-E01-%' AND empresa_id = 6;`),
        ),
      ).toBe(18);
      expect(
        Number(
          runSqlite(dbPath, `SELECT COUNT(*) FROM manobras WHERE codigo LIKE 'INST-E02-%' AND empresa_id = 6;`),
        ),
      ).toBe(18);
      expect(
        runSqlite(
          dbPath,
          `SELECT m1.codigo || '|' || m2.codigo
             FROM modelos_sessao_requisitos r
             JOIN modelos_sessao m1 ON m1.id = r.modelo_sessao_id
             JOIN modelos_sessao m2 ON m2.id = r.requisito_modelo_sessao_id
            WHERE m1.codigo = 'INST-E02' AND m1.empresa_id = 6;`,
        ),
      ).toBe('INST-E02|INST-E01');

      const columns = runSqlite(
        dbPath,
        `SELECT name
           FROM pragma_table_info('fichas_sessao_instrutor_meta')
          WHERE name IN ('equipamento_utilizado','dispositivo_identificacao','assento_instrucao_utilizado')
          ORDER BY name;`,
      );
      expect(columns.split('\n')).toEqual([
        'assento_instrucao_utilizado',
        'dispositivo_identificacao',
        'equipamento_utilizado',
      ]);
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });

  it('is replay-safe when applied more than once', () => {
    const dbPath = setupDb();
    try {
      runSqlite(dbPath, MIGRATION_429);
      runSqlite(dbPath, MIGRATION_429);

      expect(
        Number(runSqlite(dbPath, `SELECT COUNT(*) FROM modelos_sessao WHERE codigo = 'INST-E01' AND empresa_id = 6;`)),
      ).toBe(1);
      expect(
        Number(runSqlite(dbPath, `SELECT COUNT(*) FROM modelos_sessao WHERE codigo = 'INST-E02' AND empresa_id = 6;`)),
      ).toBe(1);
      expect(
        Number(runSqlite(dbPath, `SELECT COUNT(*) FROM manobras WHERE codigo LIKE 'INST-E01-%' AND empresa_id = 6;`)),
      ).toBe(18);
      expect(
        Number(runSqlite(dbPath, `SELECT COUNT(*) FROM manobras WHERE codigo LIKE 'INST-E02-%' AND empresa_id = 6;`)),
      ).toBe(18);
      expect(
        Number(
          runSqlite(
            dbPath,
            `SELECT COUNT(*)
               FROM modelos_sessao_requisitos r
               JOIN modelos_sessao e2 ON e2.id = r.modelo_sessao_id
               JOIN modelos_sessao e1 ON e1.id = r.requisito_modelo_sessao_id
              WHERE e2.codigo = 'INST-E02'
                AND e2.empresa_id = 6
                AND e1.codigo = 'INST-E01';`,
          ),
        ),
      ).toBe(1);
      expect(
        Number(runSqlite(dbPath, `SELECT COUNT(*) FROM fichas_sessao_instrutor_meta;`)),
      ).toBe(0);
    } finally {
      rmSync(join(dbPath, '..'), { recursive: true, force: true });
    }
  });
});
