import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const setupScriptPath = join(repositoryRoot, 'scripts', 'setup-local-db.sh');
const schemaFilePath = join(repositoryRoot, 'scripts', 'schema-local.sql');
const migrationsDir = join(repositoryRoot, 'worker-airtrust', 'migrations');
const targetMigration = '0340_lms_cursos_ead_metadata.sql';

const requiredCompatColumns = [
  ['conteudo_programatico', "TEXT DEFAULT NULL"],
  [
    'carga_horaria_inicial',
    'REAL CHECK(carga_horaria_inicial IS NULL OR carga_horaria_inicial > 0)',
  ],
  [
    'carga_horaria_recorrente',
    'REAL CHECK(carga_horaria_recorrente IS NULL OR carga_horaria_recorrente > 0)',
  ],
] as const;

function runSqlite(dbPath: string, sql: string): string {
  const result = spawnSync('sqlite3', [dbPath], {
    input: sql,
    encoding: 'utf-8',
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sqlite3 exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
}

function parseAppMigrationsFromSetup(): string[] {
  const setupScript = readFileSync(setupScriptPath, 'utf8');
  const appSectionMatch = setupScript.match(/APP_MIGRATIONS=\(\n([\s\S]*?)\n\)/m);
  if (!appSectionMatch) {
    throw new Error('APP_MIGRATIONS section was not found in setup-local-db.sh');
  }

  const migrationFilePattern = /\$WORKER_DIR\/migrations\/([0-9]{4}_[^"]+\.sql)/g;
  const files = [...appSectionMatch[1].matchAll(migrationFilePattern)].map((match) => match[1]);
  if (files.length === 0) {
    throw new Error('APP_MIGRATIONS did not contain any migration filenames');
  }
  return files;
}

function hasColumn(dbPath: string, table: string, column: string): boolean {
  const out = runSqlite(
    dbPath,
    `SELECT COUNT(*) FROM pragma_table_info('${table}') WHERE name='${column}';`,
  ).trim();
  return out === '1';
}

function ensureColumn(dbPath: string, table: string, column: string, definition: string) {
  if (!hasColumn(dbPath, table, column)) {
    runSqlite(dbPath, `ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

function buildDbBefore0340(tempDirs: string[]): string {
  const appMigrations = parseAppMigrationsFromSetup();
  const targetIndex = appMigrations.indexOf(targetMigration);
  if (targetIndex < 0) {
    throw new Error(`${targetMigration} not found in APP_MIGRATIONS`);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'airtrust-local-0340-'));
  tempDirs.push(tmpDir);
  const dbPath = join(tmpDir, 'local-reset-0340.db');

  runSqlite(dbPath, readFileSync(schemaFilePath, 'utf8'));

  for (const migrationName of appMigrations.slice(0, targetIndex)) {
    const migrationPath = join(migrationsDir, migrationName);
    runSqlite(dbPath, readFileSync(migrationPath, 'utf8'));
  }

  return dbPath;
}

describe('local reset 0340 regression', () => {
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

  it('keeps local reset migration ordering explicit around 0340', () => {
    const appMigrations = parseAppMigrationsFromSetup();
    expect(appMigrations).toContain(targetMigration);
    expect(appMigrations).not.toContain('0340_perfis_permissoes.sql');
  });

  it('reproduces the historical 0340 failure on fresh DB when compat columns are absent', () => {
    const dbPath = buildDbBefore0340(tempDirs);
    const targetSql = readFileSync(join(migrationsDir, targetMigration), 'utf8');

    expect(hasColumn(dbPath, 'qualificacoes_tipos', 'conteudo_programatico')).toBe(false);
    expect(hasColumn(dbPath, 'qualificacoes_tipos', 'carga_horaria_inicial')).toBe(false);
    expect(hasColumn(dbPath, 'qualificacoes_tipos', 'carga_horaria_recorrente')).toBe(false);

    expect(() => runSqlite(dbPath, targetSql)).toThrow(/no such column: qt\.carga_horaria_recorrente/i);
  });

  it('applies 0340 successfully after local bootstrap compatibility guard', () => {
    const dbPath = buildDbBefore0340(tempDirs);
    const targetSql = readFileSync(join(migrationsDir, targetMigration), 'utf8');

    for (const [column, definition] of requiredCompatColumns) {
      ensureColumn(dbPath, 'qualificacoes_tipos', column, definition);
    }
    // idempotency: running the same guard twice must be a no-op.
    for (const [column, definition] of requiredCompatColumns) {
      ensureColumn(dbPath, 'qualificacoes_tipos', column, definition);
    }

    expect(hasColumn(dbPath, 'qualificacoes_tipos', 'conteudo_programatico')).toBe(true);
    expect(hasColumn(dbPath, 'qualificacoes_tipos', 'carga_horaria_inicial')).toBe(true);
    expect(hasColumn(dbPath, 'qualificacoes_tipos', 'carga_horaria_recorrente')).toBe(true);

    expect(() => runSqlite(dbPath, targetSql)).not.toThrow();
    expect(hasColumn(dbPath, 'lms_cursos', 'carga_horaria_inicial_horas')).toBe(true);
    expect(hasColumn(dbPath, 'lms_cursos', 'carga_horaria_recorrente_horas')).toBe(true);
  });
});
