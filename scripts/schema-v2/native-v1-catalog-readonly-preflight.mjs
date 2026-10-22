#!/usr/bin/env node
/**
 * AirTrust Native V1: READ-ONLY snapshot gate for a future catalog CHECK change.
 *
 * Consumes a previously captured, local JSON result from:
 * SELECT type,name,sql FROM sqlite_master
 * WHERE name='lms_cursos' OR tbl_name='lms_cursos' ORDER BY type,name
 *
 * NEVER connects to D1, generates executable SQL, or modifies schema/data.
 * Rebuilding a referenced SQLite table requires separate governed review.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export class NativeCatalogPreflightError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NativeCatalogPreflightError';
    this.code = code;
  }
}

const digest = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const fail = (code) => { throw new NativeCatalogPreflightError(code); };
const CHECK = /CHECK\s*\(\s*tipo_conteudo\s+IN\s*\(\s*'scorm'\s*,\s*'h5p'\s*,\s*'video'\s*,\s*'pdf'\s*,\s*'pptx'\s*\)\s*\)/i;

export function inspectNativeCatalogSchemaSnapshot(snapshot, expectedHash) {
  if (!/^[a-f0-9]{64}$/.test(String(expectedHash ?? ''))) fail('CATALOG_EXPECTED_SHA_REQUIRED');
  if (!Array.isArray(snapshot) || snapshot.length < 1 || snapshot.length > 10) {
    fail('CATALOG_INVALID_WRANGLER_RESULT');
  }
  if (!snapshot.every((part) => part && Array.isArray(part.results))) {
    fail('CATALOG_INVALID_RESULT_ROWS');
  }
  const rows = snapshot.flatMap((part) => part.results).map((row) => {
    if (!row || typeof row !== 'object' || !['table','index','trigger'].includes(row.type) ||
        typeof row.name !== 'string' || !/^[a-z][a-z0-9_]{0,127}$/i.test(row.name) ||
        typeof row.sql !== 'string' || !row.sql.trim() ||
        !/^(?:CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|TRIGGER))\b/i.test(row.sql.trim())) {
      fail('CATALOG_INVALID_SCHEMA_OBJECT');
    }
    return { type: row.type, name: row.name, sql: row.sql };
  }).sort((a,b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  if (new Set(rows.map((r) => r.name)).size !== rows.length) fail('CATALOG_DUPLICATE_SCHEMA_OBJECT');

  const table = rows.filter((r) => r.type === 'table' && r.name === 'lms_cursos');
  if (table.length !== 1 || rows.some((r) => r.type === 'table' && r.name !== 'lms_cursos')) {
    fail('CATALOG_TABLE_SCOPE_INVALID');
  }
  if (!rows.some((r) => r.type === 'index') ||
      !rows.some((r) => r.type === 'trigger')) {
    fail('CATALOG_DEPENDENCY_INVENTORY_INCOMPLETE');
  }
  const definition = table[0].sql;
  if (!CHECK.test(definition) || /'native'/i.test(definition)) {
    fail('CATALOG_CONTENT_TYPE_DRIFT_OR_ALREADY_NATIVE');
  }
  for (const column of ['id','empresa_id','titulo','tipo_conteudo',
                        'scorm_assessment_policy','qualificacao_tipo_id']) {
    if (!new RegExp('\\b' + column + '\\b','i').test(definition)) {
      fail('CATALOG_REQUIRED_COLUMN_MISSING');
    }
  }
  const allObjectsHash = digest(JSON.stringify(rows.map((r) => [r.type,r.name,r.sql])));
  if (allObjectsHash !== expectedHash) fail('CATALOG_SNAPSHOT_HASH_MISMATCH');
  return {
    schema: 'AIRTRUST_NATIVE_CATALOG_READONLY_PREFLIGHT_V1',
    status: 'REVIEW_ONLY_REBUILD_REQUIRED',
    migrationPrepared: false,
    remoteMutationPerformed: false,
    snapshotHash: allObjectsHash,
    catalogDdlHash: digest(definition),
    objectCount: rows.length,
    dependentObjectNames: rows.filter((r) => r.name !== 'lms_cursos').map((r) => r.name),
    warnings: [
      'Schema snapshot is environment-specific and time-bound',
      'No SQL rebuild or D1/R2 apply is authorized by this report',
      'Preserve all referencing foreign keys, indexes and triggers in a separate governed migration',
    ],
  };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  try {
    const [file, hash] = process.argv.slice(2);
    if (!file) fail('CATALOG_INPUT_FILE_REQUIRED');
    const snapshot = JSON.parse(readFileSync(file, 'utf8'));
    const report = inspectNativeCatalogSchemaSnapshot(snapshot, hash);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch (error) {
    process.stderr.write('NATIVE_CATALOG_PREFLIGHT_REJECTED: ' +
      (error?.code ?? 'INVALID_INPUT_OR_SNAPSHOT') + '\n');
    process.exitCode = 2;
  }
}
