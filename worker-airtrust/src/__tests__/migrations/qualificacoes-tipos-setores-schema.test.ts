import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type TableColumn = {
  name: string;
  dflt_value: string | null;
};

type IndexRow = {
  name: string;
};

describe('migration 0407 qualificacoes_tipos_setores schema', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-qts-'));
  const databasePath = join(tempDir, 'schema.sqlite');
  const migrationSql = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../migrations/0407_qualificacoes_tipos_setores.sql',
    ),
    'utf8',
  );

  function sqlite(sql: string): string {
    const result = spawnSync('sqlite3', [databasePath], {
      input: sql,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }

  function queryJson<T>(sql: string): T[] {
    const result = spawnSync('sqlite3', ['-json', databasePath, sql], {
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
  }

  beforeAll(() => {
    sqlite(`
      CREATE TABLE empresas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT);
      CREATE TABLE setores (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER, nome TEXT, deleted_at TEXT);
      CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER, nome TEXT, codigo TEXT, deleted_at TEXT);
      ${migrationSql}
      ${migrationSql}
    `);
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates qualificacoes_tipos_setores with expected columns', () => {
    const columns = queryJson<TableColumn>('PRAGMA table_info(qualificacoes_tipos_setores);');
    expect(columns.map((column) => column.name)).toEqual([
      'id',
      'tipo_id',
      'setor_id',
      'empresa_id',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
  });

  it('creates the active lookup indexes', () => {
    const indexes = queryJson<IndexRow>('PRAGMA index_list(qualificacoes_tipos_setores);');
    expect(indexes.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'idx_qts_unique_active',
        'idx_qts_tipo_empresa',
        'idx_qts_setor_empresa',
        'idx_qts_empresa_setor_tipo',
      ]),
    );
  });

  it('does not pin empresa_id to a default tenant', () => {
    const [empresaIdColumn] = queryJson<TableColumn>(
      `SELECT name, dflt_value FROM pragma_table_info('qualificacoes_tipos_setores') WHERE name = 'empresa_id';`,
    );
    expect(empresaIdColumn?.dflt_value).not.toBe('1');
    expect(empresaIdColumn?.dflt_value).toBeNull();
  });
});
