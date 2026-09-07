#!/usr/bin/env node

// source_reference: HEALTH FRMS staging schema parity — prove that migrations
//   0463 (FRMS IOGP) and 0464 (FRMS parameter governance) are structurally
//   present in the staging D1 so that `resolveFrmsOperationalContext` can run.
//   Staging's D1 was rebuilt from a 2026-07-01 schema-only dump, so its
//   d1_migrations ledger can diverge from the real schema — the real schema is
//   the authority, the ledger is complementary evidence only.
// operational_decision: READ-ONLY. This script only issues SELECT / PRAGMA
//   table_info / sqlite_master / d1_migrations / airtrust_schema_changes_v2
//   statements. Every statement is validated against a mutating-SQL denylist
//   before it is sent to wrangler. It never uses `--file`, never applies a
//   migration, never seeds, never cleans up. The production/development D1 IDs
//   are hard-blocked; the staging D1 name+id are hard-pinned.
// dry_run_required: not applicable — the script has no side effects.
// rollback_plan_required: not applicable — read-only.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------
// Fixed target — no free input.
// ---------------------------------------------------------------------------
const ALLOWED_STAGING_DB_NAME = 'airtrust-db-staging-baseline-20260701';
const ALLOWED_STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const BLOCKED_DB_IDS = new Set([
  '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae', // production
  'a72fb05b-0912-4ad9-9686-e7948c8b09eb', // development
]);
const BLOCKED_DB_NAMES = new Set(['airtrust-db', 'airtrust-db-dev', 'airtrust-db-production']);
const STAGING_VERSION_ENDPOINT = 'https://airtrust-api-staging.airtrust.workers.dev/api/version';

// ---------------------------------------------------------------------------
// Read-only SQL contract — defence in depth on top of the fixed query builders.
// ---------------------------------------------------------------------------
const MUTATING_SQL =
  /\b(INSERT|UPDATE|DELETE|REPLACE|MERGE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|ATTACH|DETACH|PRAGMA\s+\w+\s*=|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;
const READ_ONLY_PREFIX = /^\s*(SELECT|PRAGMA)\b/i;
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertReadOnlySql(sql) {
  const text = String(sql || '').trim();
  if (!text) throw new Error('EMPTY_SQL');
  if (!READ_ONLY_PREFIX.test(text)) throw new Error(`NOT_READ_ONLY_SQL: ${text}`);
  if (MUTATING_SQL.test(text)) throw new Error(`MUTATING_SQL_BLOCKED: ${text}`);
  if (text.includes(';')) {
    const head = text.slice(0, text.indexOf(';'));
    const tail = text.slice(text.indexOf(';') + 1).trim();
    if (tail.length > 0) throw new Error(`MULTI_STATEMENT_SQL_BLOCKED: ${text}`);
    return head;
  }
  return text;
}

function assertStagingTarget(name, id) {
  const n = String(name || '').trim();
  const i = String(id || '').trim();
  if (BLOCKED_DB_NAMES.has(n.toLowerCase()) || BLOCKED_DB_IDS.has(i)) {
    throw new Error(`TARGET_IS_PRODUCTION_OR_DEV_BLOCKED: ${n} / ${i}`);
  }
  if (n !== ALLOWED_STAGING_DB_NAME || i !== ALLOWED_STAGING_DB_ID) {
    throw new Error(
      `TARGET_NOT_STAGING: got ${n} / ${i}, expected ${ALLOWED_STAGING_DB_NAME} / ${ALLOWED_STAGING_DB_ID}`,
    );
  }
}

function runWranglerReadOnly(dbName, sql) {
  const command = assertReadOnlySql(sql);
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--remote', '--json', '--command', command],
    { cwd: path.join(ROOT, 'worker-airtrust'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(
      `WRANGLER_EXECUTE_FAILED (${dbName}): ${(result.stderr || result.stdout || '').slice(0, 4000)}`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    // wrangler can print a banner before the JSON payload.
    const start = result.stdout.search(/[[{]/);
    parsed = JSON.parse(result.stdout.slice(start));
  }
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return first?.results ?? [];
}

// ---------------------------------------------------------------------------
// Derive required objects/columns from the real migration + runtime source.
// ---------------------------------------------------------------------------
function readMigration(nameFragment) {
  const dir = path.join(ROOT, 'worker-airtrust', 'migrations');
  const file = readdirSync(dir).find((f) => f.includes(nameFragment) && f.endsWith('.sql'));
  if (!file) throw new Error(`MIGRATION_NOT_FOUND: ${nameFragment}`);
  return { file, sql: readFileSync(path.join(dir, file), 'utf8') };
}

function parseCreateTables(sql) {
  const tables = {};
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\n\s*\)\s*;/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1];
    const body = m[2];
    const columns = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim().replace(/,$/, '');
      if (!line) continue;
      if (/^(FOREIGN\s+KEY|PRIMARY\s+KEY|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line)) continue;
      const col = line.match(/^["`]?(\w+)["`]?\s+/);
      if (col) columns.push(col[1]);
    }
    tables[name] = columns;
  }
  return tables;
}

function parseCreateIndexes(sql) {
  const names = [];
  const re = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s+ON\s+["`]?(\w+)["`]?/gi;
  let m;
  while ((m = re.exec(sql)) !== null) names.push({ index: m[1], table: m[2] });
  return names;
}

function parseAddedColumns(sql) {
  const added = {};
  const re = /ALTER\s+TABLE\s+["`]?(\w+)["`]?\s+ADD\s+(?:COLUMN\s+)?["`]?(\w+)["`]?/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    added[m[1]] = added[m[1]] || [];
    added[m[1]].push(m[2]);
  }
  return added;
}

function parseLimitesDefaultKeys() {
  const file = path.join(ROOT, 'worker-airtrust', 'src', 'lib', 'frms', 'types.ts');
  const src = readFileSync(file, 'utf8');
  const block = src.match(/LIMITES_DEFAULT[^{]*\{([\s\S]*?)\n\};/);
  if (!block) throw new Error('LIMITES_DEFAULT_NOT_FOUND');
  return [...block[1].matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((x) => x[1]);
}

// ---------------------------------------------------------------------------
// Read-only probes.
// ---------------------------------------------------------------------------
function tableExists(dbName, tableName) {
  if (!SAFE_IDENTIFIER.test(tableName)) throw new Error(`UNSAFE_TABLE_NAME: ${tableName}`);
  const rows = runWranglerReadOnly(
    dbName,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
  );
  return rows.length === 1;
}

function indexExists(dbName, indexName) {
  if (!SAFE_IDENTIFIER.test(indexName)) throw new Error(`UNSAFE_INDEX_NAME: ${indexName}`);
  const rows = runWranglerReadOnly(
    dbName,
    `SELECT name FROM sqlite_master WHERE type='index' AND name='${indexName}'`,
  );
  return rows.length === 1;
}

function tableColumns(dbName, tableName) {
  if (!SAFE_IDENTIFIER.test(tableName)) throw new Error(`UNSAFE_TABLE_NAME: ${tableName}`);
  const rows = runWranglerReadOnly(dbName, `PRAGMA table_info(${tableName})`);
  return new Set(rows.map((r) => String(r.name)));
}

function countScalar(dbName, sql) {
  const rows = runWranglerReadOnly(dbName, sql);
  const row = rows[0] || {};
  const key = Object.keys(row)[0];
  return Number(row[key] ?? 0);
}

function probeRuntimeQuery(dbName, sql) {
  try {
    runWranglerReadOnly(dbName, sql);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 600) };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const dbName = process.env.STAGING_D1_NAME || ALLOWED_STAGING_DB_NAME;
  const dbId = process.env.STAGING_D1_ID || ALLOWED_STAGING_DB_ID;
  assertStagingTarget(dbName, dbId);

  const expectedSha = String(process.env.EXPECTED_DEPLOYED_SHA || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error('EXPECTED_DEPLOYED_SHA_INVALID');
  }

  const report = {
    generatedAtUtc: new Date().toISOString(),
    target: { dbName, dbId },
    deployedStagingSha: expectedSha,
    provenance: null,
    migrations: {},
    schema: { m0463: {}, m0464: {} },
    runtimeQueries: {},
    bootstrap: {},
    ledger: {},
    verdict: {},
  };

  // 0. Re-confirm staging provenance from the doctor itself (belt + suspenders
  //    on top of the workflow guard).
  {
    const child = spawnSync(
      'node',
      ['--input-type=module', '-e', `const r = await fetch(${JSON.stringify(STAGING_VERSION_ENDPOINT)}, { headers: { Accept: 'application/json' } });\nif (!r.ok) { console.log(JSON.stringify({ httpError: r.status })); process.exit(0); }\nconst v = await r.json();\nconsole.log(JSON.stringify(v));`],
      { encoding: 'utf8' },
    );
    let sourceSha = '';
    let environment = '';
    try {
      const v = JSON.parse((child.stdout || '').trim());
      sourceSha = String(v?.sourceSha ?? v?.data?.sourceSha ?? '').toLowerCase();
      environment = String(v?.environment ?? v?.data?.environment ?? '');
    } catch {
      // fall through — provenance stays unverified and the verdict fails closed
    }
    report.provenance = { sourceSha, environment, expected: expectedSha };
    if (sourceSha !== expectedSha) {
      throw new Error(`STAGING_WORKER_SHA_MISMATCH: live=${sourceSha || 'missing'} expected=${expectedSha}`);
    }
    if (environment !== 'staging') {
      throw new Error(`STAGING_ENV_MISMATCH: ${environment || 'missing'}`);
    }
  }

  const m0463 = readMigration('0463_frms_iogp_schema_v2');
  const m0464 = readMigration('0464_frms_parameter_governance_recalc');
  report.migrations = { m0463: m0463.file, m0464: m0464.file };

  const t0463 = parseCreateTables(m0463.sql);
  const i0463 = parseCreateIndexes(m0463.sql);
  const t0464 = parseCreateTables(m0464.sql);
  const i0464 = parseCreateIndexes(m0464.sql);
  const added0464 = parseAddedColumns(m0464.sql);

  const missingObjects = [];
  const missingColumns = [];
  const missingIndexes = [];

  const checkTableSet = (bucket, tables) => {
    for (const [name, cols] of Object.entries(tables)) {
      const exists = tableExists(dbName, name);
      const entry = { exists, missingColumns: [] };
      if (!exists) {
        missingObjects.push(name);
      } else {
        const actual = tableColumns(dbName, name);
        entry.missingColumns = cols.filter((c) => !actual.has(c));
        for (const c of entry.missingColumns) missingColumns.push(`${name}.${c}`);
      }
      bucket[name] = entry;
    }
  };

  checkTableSet(report.schema.m0463, t0463);
  checkTableSet(report.schema.m0464, t0464);

  report.schema.m0463Indexes = {};
  for (const { index } of i0463) {
    const ok = indexExists(dbName, index);
    report.schema.m0463Indexes[index] = ok;
    if (!ok) missingIndexes.push(index);
  }
  report.schema.m0464Indexes = {};
  for (const { index } of i0464) {
    const ok = indexExists(dbName, index);
    report.schema.m0464Indexes[index] = ok;
    if (!ok) missingIndexes.push(index);
  }

  // 0464 ALTER-added columns on pre-existing tables.
  report.schema.addedColumns = {};
  for (const [table, cols] of Object.entries(added0464)) {
    const exists = tableExists(dbName, table);
    const actual = exists ? tableColumns(dbName, table) : new Set();
    const entry = { tableExists: exists, missing: [] };
    for (const c of cols) {
      if (!actual.has(c)) {
        entry.missing.push(c);
        missingColumns.push(`${table}.${c}`);
      }
    }
    report.schema.addedColumns[table] = entry;
  }

  const schema0463Ok =
    Object.values(report.schema.m0463).every((e) => e.exists && e.missingColumns.length === 0) &&
    Object.values(report.schema.m0463Indexes).every(Boolean);
  const schema0464Ok =
    Object.values(report.schema.m0464).every((e) => e.exists && e.missingColumns.length === 0) &&
    Object.values(report.schema.m0464Indexes).every(Boolean) &&
    Object.values(report.schema.addedColumns).every((e) => e.tableExists && e.missing.length === 0);

  // Runtime-equivalent read-only probes (LIMIT 0 / non-existent keys => no rows,
  // no PII). Mirrors worker-airtrust/src/lib/frms/parameter-governance.ts.
  const D = "'1970-01-01'";
  const qAssignment =
    `SELECT a.regulatory_profile_id, a.profile_code ` +
    `FROM frms_profile_assignments a ` +
    `JOIN frms_regulatory_profiles p ON p.id = a.regulatory_profile_id ` +
    `WHERE a.empresa_id = 0 AND a.status = 'ACTIVE' ` +
    `AND a.effective_from <= ${D} AND (a.effective_to IS NULL OR a.effective_to >= ${D}) ` +
    `AND p.empresa_id = 0 AND p.active = 1 AND p.deleted_at IS NULL ` +
    `AND p.profile_code = a.profile_code ` +
    `AND p.effective_from <= ${D} AND (p.effective_to IS NULL OR p.effective_to >= ${D}) ` +
    `LIMIT 0`;
  const qRevision =
    `SELECT id, empresa_id, profile_code, revision_number, status, source_type, ` +
    `regulatory_profile_id, policy_version, effective_from, effective_to, created_at ` +
    `FROM frms_config_revisions ` +
    `WHERE profile_code = 'LEGACY_GENERAL' AND status = 'ACTIVE' ` +
    `AND (empresa_id = 0 OR empresa_id IS NULL) ` +
    `AND effective_from <= ${D} AND (effective_to IS NULL OR effective_to >= ${D}) ` +
    `LIMIT 0`;
  const qParameters =
    `SELECT id, revision_id, parameter_key, numeric_value, json_value, unit, metric, required ` +
    `FROM frms_config_parameters WHERE revision_id = '__frms_schema_doctor_none__' LIMIT 0`;

  report.runtimeQueries = {
    assignment: probeRuntimeQuery(dbName, qAssignment),
    revision: probeRuntimeQuery(dbName, qRevision),
    parameters: probeRuntimeQuery(dbName, qParameters),
  };

  // 0464 bootstrap — the legacy governed revision + its parameter coverage.
  const requiredKeys = parseLimitesDefaultKeys();
  report.bootstrap.requiredParameterKeyCount = requiredKeys.length;

  let legacyActiveRevisionCount = null;
  let legacyParameterCount = null;
  let requiredKeysPresent = null;
  if (report.schema.m0464['frms_config_revisions']?.exists) {
    legacyActiveRevisionCount = countScalar(
      dbName,
      `SELECT COUNT(*) AS c FROM frms_config_revisions WHERE profile_code = 'LEGACY_GENERAL' AND status = 'ACTIVE'`,
    );
  }
  if (
    report.schema.m0464['frms_config_parameters']?.exists &&
    report.schema.m0464['frms_config_revisions']?.exists
  ) {
    legacyParameterCount = countScalar(
      dbName,
      `SELECT COUNT(*) AS c FROM frms_config_parameters ` +
        `WHERE revision_id IN (SELECT id FROM frms_config_revisions WHERE profile_code = 'LEGACY_GENERAL' AND status = 'ACTIVE')`,
    );
    const keyList = requiredKeys.map((k) => `'${k}'`).join(', ');
    requiredKeysPresent = countScalar(
      dbName,
      `SELECT COUNT(DISTINCT parameter_key) AS c FROM frms_config_parameters ` +
        `WHERE parameter_key IN (${keyList}) ` +
        `AND revision_id IN (SELECT id FROM frms_config_revisions WHERE profile_code = 'LEGACY_GENERAL' AND status = 'ACTIVE')`,
    );
  }
  report.bootstrap.legacyActiveRevisionCount = legacyActiveRevisionCount;
  report.bootstrap.legacyParameterCount = legacyParameterCount;
  report.bootstrap.requiredKeysPresent = requiredKeysPresent;

  const bootstrapReady =
    legacyActiveRevisionCount === 1 &&
    typeof requiredKeysPresent === 'number' &&
    requiredKeysPresent === requiredKeys.length;

  // Ledger — complementary evidence only.
  const d1MigrationsExists = tableExists(dbName, 'd1_migrations');
  const changesV2Exists = tableExists(dbName, 'airtrust_schema_changes_v2');
  let ledger0463 = 'UNKNOWN';
  let ledger0464 = 'UNKNOWN';
  const ledgerRows = [];
  if (d1MigrationsExists) {
    const rows = runWranglerReadOnly(
      dbName,
      `SELECT name FROM d1_migrations WHERE name LIKE '0463%' OR name LIKE '0464%' ORDER BY name`,
    );
    for (const r of rows) ledgerRows.push(String(r.name));
    ledger0463 = ledgerRows.some((n) => n.startsWith('0463')) ? 'PRESENT' : 'ABSENT';
    ledger0464 = ledgerRows.some((n) => n.startsWith('0464')) ? 'PRESENT' : 'ABSENT';
  }
  let changesV2Rows = [];
  if (changesV2Exists) {
    const rows = runWranglerReadOnly(
      dbName,
      `SELECT change_id FROM airtrust_schema_changes_v2 WHERE change_id LIKE '%0463%' OR change_id LIKE '%0464%' OR change_id LIKE '%frms%parameter%' OR change_id LIKE '%iogp%' ORDER BY change_id`,
    );
    changesV2Rows = rows.map((r) => String(r.change_id));
  }
  report.ledger = {
    d1MigrationsExists,
    changesV2Exists,
    d1MigrationsRows: ledgerRows,
    changesV2Rows,
    m0463: ledger0463,
    m0464: ledger0464,
  };

  // Verdict — SCHEMA REAL > LEDGER. Ledger absence is not a failure when the
  // structure + runtime queries + bootstrap are proven.
  const runtimeOk =
    report.runtimeQueries.assignment.ok &&
    report.runtimeQueries.revision.ok &&
    report.runtimeQueries.parameters.ok;

  const parity = schema0463Ok && schema0464Ok && runtimeOk && bootstrapReady;

  report.verdict = {
    schema0463: schema0463Ok ? 'PASS' : 'FAIL',
    schema0464: schema0464Ok ? 'PASS' : 'FAIL',
    runtimeQueryAssignment: report.runtimeQueries.assignment.ok ? 'PASS' : 'FAIL',
    runtimeQueryRevision: report.runtimeQueries.revision.ok ? 'PASS' : 'FAIL',
    runtimeQueryParameters: report.runtimeQueries.parameters.ok ? 'PASS' : 'FAIL',
    bootstrapReady: bootstrapReady ? 'PASS' : 'FAIL',
    stagingSchemaParity: parity ? 'PASS' : 'FAIL',
    missingObjects: [...new Set(missingObjects)],
    missingColumns: [...new Set(missingColumns)],
    missingIndexes: [...new Set(missingIndexes)],
    bootstrapMissing: bootstrapReady
      ? []
      : [
          legacyActiveRevisionCount !== 1
            ? `frms_config_revisions ACTIVE LEGACY_GENERAL count=${legacyActiveRevisionCount}`
            : null,
          typeof requiredKeysPresent === 'number' && requiredKeysPresent !== requiredKeys.length
            ? `frms_config_parameters LEGACY_GENERAL required keys ${requiredKeysPresent}/${requiredKeys.length}`
            : null,
        ].filter(Boolean),
    missingMigrationsCandidates: parity
      ? []
      : [
          !schema0463Ok || ledger0463 === 'ABSENT' ? m0463.file : null,
          !schema0464Ok || !bootstrapReady || ledger0464 === 'ABSENT' ? m0464.file : null,
        ].filter(Boolean),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (parity) {
    console.log('FRMS_SCHEMA_DOCTOR_PASS: 0463/0464 structure + runtime queries + bootstrap present on staging (read-only, nothing changed).');
    process.exitCode = 0;
  } else {
    console.error('FRMS_SCHEMA_DOCTOR_FAIL: staging FRMS parameter-governance schema is incomplete. No migration applied.');
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`[frms-schema-doctor][ERROR] ${String(error?.message || error)}`);
  process.exitCode = 1;
}
