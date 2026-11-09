import { readFileSync, readdirSync, statSync } from 'node:fs';
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
      if (!seen.has(table.toLowerCase())) seen.set(table.toLowerCase(), { table, filename });
    }
  }
  const configuredNames = extractConfiguredTables(backupSource);
  const configured = new Set(configuredNames.map(name => name.toLowerCase()));
  const tables = [...seen].sort(([a], [b]) => a.localeCompare(b)).map(([key, { table, filename }]) => ({
    table, first_seen_in: filename, in_worker_backup: configured.has(key),
  }));
  return {
    source: 'static_migration_metadata_only',
    migration_files_scanned: migrationFiles.length,
    schema_tables_detected: tables.length,
    worker_backup_tables_configured: configured.size,
    schema_tables_not_in_worker_backup: tables.filter(t => !t.in_worker_backup).length,
    configured_tables_not_found_in_migrations: configuredNames.filter(name => !seen.has(name.toLowerCase())),
    tables,
    limitations: [
      'Static CREATE TABLE parser; migrations can rename/drop tables. Not an authoritative live D1 schema.',
      'No production D1/R2 access, personal records or secrets read.',
      'In-Worker JSON coverage is not production D1 export/Time Travel coverage.',
    ],
  };
}


/**
 * Compare backup configuration against a LOCAL schema-only inventory supplied by
 * an operator. This function has no production D1 credentials or network path.
 * Input is deliberately limited to table names: no exported database rows.
 */
export function buildInventoryFromSchemaMetadata({ metadata, backupSource }) {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object' ||
      Object.keys(metadata).length !== 1 || !Array.isArray(metadata.tables) ||
      metadata.tables.length > 10000) {
    throw new Error('SCHEMA_TABLE_NAMES_ONLY_REQUIRED');
  }
  const normalized = new Map();
  for (const table of metadata.tables) {
    if (typeof table !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
      throw new Error('SCHEMA_INVALID_TABLE_NAME');
    }
    if (table.toLowerCase().startsWith('sqlite_')) continue;
    const key = table.toLowerCase();
    if (normalized.has(key)) throw new Error('SCHEMA_DUPLICATE_TABLE_NAME');
    normalized.set(key, table);
  }
  const configuredNames = extractConfiguredTables(backupSource);
  const configured = new Set(configuredNames.map(name => name.toLowerCase()));
  const tables = [...normalized].sort(([a], [b]) => a.localeCompare(b)).map(([key, table]) => ({
    table, in_worker_backup: configured.has(key),
  }));
  return {
    source: 'operator_supplied_schema_table_names_only',
    schema_tables_detected: tables.length,
    worker_backup_tables_configured: configuredNames.length,
    schema_tables_not_in_worker_backup: tables.filter(row => !row.in_worker_backup).length,
    configured_tables_not_found_in_schema_metadata: configuredNames.filter(name => !normalized.has(name.toLowerCase())),
    tables,
    limitations: [
      'Operator-supplied, local table names; this tool does not authenticate their provenance or freshness.',
      'No production D1/R2 access, personal records, credentials, object content or application data read.',
      'Worker JSON/module coverage differs from D1 export/Time Travel coverage and R2 object backups.',
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
  const options = process.argv.slice(2);
  if (options.length === 0) {
    process.stdout.write(JSON.stringify(run(), null, 2) + '\n');
  } else if (options.length === 1 && options[0].startsWith('--schema-metadata-file=')) {
    const file = options[0].slice('--schema-metadata-file='.length);
    if (!file.startsWith('/') || statSync(file).size > 2_000_000) {
      throw new Error('SCHEMA_METADATA_ABSOLUTE_FILE_MAX_2MB_REQUIRED');
    }
    const metadata = JSON.parse(readFileSync(file, 'utf8'));
    const backupSource = readFileSync(resolve(REPO_ROOT, 'worker-airtrust/src/config/backup-modules.ts'), 'utf8');
    process.stdout.write(JSON.stringify(buildInventoryFromSchemaMetadata({ metadata, backupSource }), null, 2) + '\n');
  } else {
    throw new Error('Usage: node scripts/backup/inventory-static-d1.mjs [--schema-metadata-file=/absolute/schema-only.json]');
  }
}
