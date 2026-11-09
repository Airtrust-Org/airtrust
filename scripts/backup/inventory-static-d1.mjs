import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Static metadata only. No database, R2, or network access. */
export function extractCreatedTables(sql) {
  const clean = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
  // SQLite permits both CREATE TABLE name (...) and CREATE TABLE name AS SELECT ...
  // (also AS WITH ... SELECT). Both materialize tables and must be inventoried.
  return [...clean.matchAll(/\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`\[]?[A-Za-z_][\w]*["`\]]?\.)?["`\[]?([A-Za-z_][\w]*)["`\]]?\s*(?=\(|AS\s+(?:SELECT|WITH)\b)/gi)].map(m => m[1]);
}

export function extractConfiguredTables(source) {
  const names = new Set();
  for (const match of source.matchAll(/tabelas_(?:principais|relacionadas)\s*:\s*\[([\s\S]*?)\]/g)) {
    for (const item of match[1].matchAll(/['"]([A-Za-z_][\w]*)['"]/g)) names.add(item[1]);
  }
  return [...names].sort();
}

export function buildInventory({ migrationFiles, backupSource }) {
  const seen = new Map();
  for (const [filename, sql] of migrationFiles) {
    for (const table of extractCreatedTables(sql)) {
      if (!seen.has(table)) seen.set(table, filename);
    }
  }
  const configured = new Set(extractConfiguredTables(backupSource));
  const tables = [...seen].sort(([a], [b]) => a.localeCompare(b)).map(([table, firstSeen]) => ({
    table, first_seen_in: firstSeen, in_worker_backup: configured.has(table),
  }));
  return {
    source: 'static_migration_metadata_only',
    migration_files_scanned: migrationFiles.length,
    schema_tables_detected: tables.length,
    worker_backup_tables_configured: configured.size,
    schema_tables_not_in_worker_backup: tables.filter(t => !t.in_worker_backup).length,
    configured_tables_not_found_in_migrations: [...configured].filter(t => !seen.has(t)),
    tables,
    limitations: [
      'Static CREATE TABLE parser; migrations can rename/drop tables. Not an authoritative live D1 schema.',
      'No production D1/R2 access, personal records or secrets read.',
      'In-Worker JSON coverage is not production D1 export/Time Travel coverage.',
    ],
  };
}

export function run({ rootDir = REPO_ROOT } = {}) {
  const dir = resolve(rootDir, 'worker-airtrust/migrations');
  const files = readdirSync(dir).filter(name => name.endsWith('.sql')).sort()
    .map(name => [name, readFileSync(join(dir, name), 'utf8')]);
  const backupSource = readFileSync(resolve(rootDir, 'worker-airtrust/src/config/backup-modules.ts'), 'utf8');
  return buildInventory({ migrationFiles: files, backupSource });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(run(), null, 2) + '\n');
}
