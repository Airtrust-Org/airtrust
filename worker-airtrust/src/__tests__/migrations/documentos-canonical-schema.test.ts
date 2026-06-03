import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

type TableColumn = {
  name: string;
};

type IndexRow = {
  name: string;
  partial?: number;
};

const prohibitedPatterns = [
  /\bDROP\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bINSERT\b/i,
  /\bREPLACE\b/i,
  /\bUPSERT\b/i,
  /\bALTER\s+TABLE\b/i,
  /\bBACKFILL\b/i,
];

describe('migration 0388 documentos canonical schema', () => {
  const tempDirs: string[] = [];
  const migrationSql = readFileSync(
    new URL('../../../migrations/0388_documentos_canonical_schema.sql', import.meta.url),
    'utf8',
  );

  function createDb() {
    const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-documentos-0388-'));
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

    return { sqlite, sqliteResult, queryJson };
  }

  afterAll(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates the documentos table with the approved canonical columns in a clean schema', () => {
    const { sqlite, queryJson } = createDb();
    sqlite(migrationSql);

    const columns = queryJson<TableColumn>('PRAGMA table_info(documentos);').map(({ name }) => name);

    expect(columns).toEqual([
      'id',
      'uuid',
      'funcionario_id',
      'nome_arquivo',
      'tipo',
      'tamanho',
      'r2_key',
      'descricao',
      'created_at',
      'updated_at',
      'deleted_at',
      'empresa_id',
    ]);
  });

  it('keeps the expected schema anchors present', () => {
    const { sqlite, queryJson } = createDb();
    sqlite(migrationSql);

    const columns = queryJson<TableColumn>('PRAGMA table_info(documentos);').map(({ name }) => name);

    expect(columns).toEqual(
      expect.arrayContaining(['uuid', 'r2_key', 'funcionario_id', 'empresa_id', 'deleted_at']),
    );
  });

  it('creates the expected documentos indexes', () => {
    const { sqlite, queryJson } = createDb();
    sqlite(migrationSql);

    const indexes = queryJson<IndexRow>('PRAGMA index_list(documentos);');
    const names = indexes.map(({ name }) => name);

    expect(names).toEqual(
      expect.arrayContaining([
        'idx_documentos_empresa',
        'idx_documentos_funcionario',
        'idx_documentos_deleted',
        'idx_documentos_tipo',
        'idx_documentos_funcionario_tipo',
      ]),
    );

    const partialByName = new Map(indexes.map(({ name, partial }) => [name, partial ?? 0]));
    expect(partialByName.get('idx_documentos_tipo')).toBe(1);
    expect(partialByName.get('idx_documentos_funcionario_tipo')).toBe(1);
  });

  it('is idempotent when executed twice on a clean schema', () => {
    const { sqlite, queryJson } = createDb();
    sqlite(migrationSql);
    sqlite(migrationSql);

    const names = queryJson<IndexRow>('PRAGMA index_list(documentos);').map(({ name }) => name);
    expect(names).toEqual(
      expect.arrayContaining([
        'idx_documentos_empresa',
        'idx_documentos_funcionario',
        'idx_documentos_deleted',
        'idx_documentos_tipo',
        'idx_documentos_funcionario_tipo',
      ]),
    );
  });

  it('can run when an equivalent documentos table already exists', () => {
    const { sqlite, sqliteResult, queryJson } = createDb();

    sqlite(`
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
        empresa_id INTEGER DEFAULT 1
      );
    `);

    const result = sqliteResult(migrationSql);
    expect(result.status, result.stderr).toBe(0);

    const names = queryJson<IndexRow>('PRAGMA index_list(documentos);').map(({ name }) => name);
    expect(names).toEqual(
      expect.arrayContaining([
        'idx_documentos_empresa',
        'idx_documentos_funcionario',
        'idx_documentos_deleted',
        'idx_documentos_tipo',
        'idx_documentos_funcionario_tipo',
      ]),
    );
  });

  it('does not contain destructive, data-changing, ALTER TABLE or backfill statements', () => {
    for (const pattern of prohibitedPatterns) {
      expect(migrationSql).not.toMatch(pattern);
    }
  });

  it('does not touch pasta_virtual or certificados_templates', () => {
    expect(migrationSql).not.toMatch(/\bpasta_virtual\b/i);
    expect(migrationSql).not.toMatch(/\bcertificados_templates\b/i);
  });

  it('stays local-only and does not require real data', () => {
    expect(migrationSql).not.toMatch(/--remote/i);
    expect(migrationSql).not.toMatch(/\bSELECT\b/i);
  });
});
