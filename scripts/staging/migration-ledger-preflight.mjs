#!/usr/bin/env node

// source_reference: staging's D1 was rebuilt from a schema dump, not a full
// `wrangler d1 migrations apply` replay (docs/ops/staging-examiner-training-release-20260710.md,
// docs/D1_STAGING_MIGRATION_AUDIT_REPORT.md) — its d1_migrations ledger can
// diverge from the schema that actually exists. This script is READ-ONLY: it
// never writes to the ledger or applies any migration, and only ever targets
// the staging D1 (production database IDs are hard-blocked below).
// operational_decision: classify each versioned migration into one of five
// states by comparing (a) the d1_migrations ledger, (b) CREATE TABLE object
// names parsed from the migration file, and (c) sqlite_master on staging.
// dry_run_required: this script has no side effects; it is safe to run at any time.
// rollback_plan_required: not applicable — read-only.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function getMigrationsDirs() {
  const dirs = [];
  const custom = process.argv.find((a) => a.startsWith('--migrations-dir='));
  if (custom) {
    dirs.push(path.resolve(custom.slice('--migrations-dir='.length)));
  }
  const releaseMigrations = path.join(ROOT, 'release', 'worker-airtrust', 'migrations');
  if (existsSync(releaseMigrations)) {
    dirs.push(releaseMigrations);
  }
  const rootMigrations = path.join(ROOT, 'worker-airtrust', 'migrations');
  if (existsSync(rootMigrations)) {
    dirs.push(rootMigrations);
  }
  return [...new Set(dirs)];
}

const ALLOWED_STAGING_DB_NAME = 'airtrust-db-staging-baseline-20260701';
const ALLOWED_STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';

const BLOCKED_DB_NAMES = ['airtrust-db', 'airtrust-db-dev', 'airtrust-db-production'];
const BLOCKED_DB_IDS = [
  '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae', // production
  'a72fb05b-0912-4ad9-9686-e7948c8b09eb', // development
];

function getOfficialDispatchScopeTokens() {
  const eventPath = String(process.env.GITHUB_EVENT_PATH || '').trim();
  if (
    process.env.GITHUB_WORKFLOW !== 'Deploy Staging (Official)' ||
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    !eventPath ||
    !existsSync(eventPath)
  ) {
    return null;
  }

  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const approved = String(event?.inputs?.approved_migrations ?? '').trim();
  if (!approved) return null;

  const tokens = approved.split(/\s+/).map((filename) => {
    const match = filename.match(/^(\d{4})_[A-Za-z0-9][A-Za-z0-9._-]*\.sql$/);
    if (!match) {
      throw new Error(`approved_migrations contém nome inválido: ${filename}`);
    }
    return match[1];
  });
  const unique = [...new Set(tokens)];
  console.error(`PREFLIGHT_SCOPE_FROM_APPROVED_MIGRATIONS=${unique.join(',')}`);
  return unique;
}

function parseScopeArg(argv, files) {
  // The official staging workflow historically carried a fixed legacy scope
  // through 0480. For workflow_dispatch releases, the authoritative scope is
  // instead the exact approved_migrations input already validated by the
  // staging release guard. This keeps historical ledger drift outside the
  // current release from blocking a governed migration while still requiring
  // every requested migration to exist in the reviewed release checkout.
  const dispatchRequested = getOfficialDispatchScopeTokens();
  const scopeArg = argv.find((arg) => arg.startsWith('--scope='));
  if (!dispatchRequested && !scopeArg) return null;

  const requested = dispatchRequested ?? scopeArg
    .slice('--scope='.length)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (requested.length === 0) {
    throw new Error('--scope= foi informado sem códigos de migration.');
  }

  const scopedFiles = [];
  for (const token of requested) {
    const match = files.find((file) => file === token || file.startsWith(`${token}_`));
    if (!match) {
      throw new Error(`Migration fora da scope local/versionada: ${token}`);
    }
    scopedFiles.push(match);
  }
  return [...new Set(scopedFiles)];
}

function assertStagingTarget(dbName, dbId) {
  const name = String(dbName || '').trim();
  const id = String(dbId || '').trim();

  if (BLOCKED_DB_NAMES.includes(name.toLowerCase()) || BLOCKED_DB_IDS.includes(id)) {
    throw new Error(`Alvo "${name}" (${id}) é produção/desenvolvimento — preflight bloqueado.`);
  }
  if (name !== ALLOWED_STAGING_DB_NAME || id !== ALLOWED_STAGING_DB_ID) {
    throw new Error(
      `Alvo "${name}" (${id}) não é o D1 de staging esperado ` +
        `(${ALLOWED_STAGING_DB_NAME} / ${ALLOWED_STAGING_DB_ID}). Preflight bloqueado.`,
    );
  }
}

function runWranglerJson(dbName, sql) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--remote', '--json', '--command', sql],
    { cwd: path.join(ROOT, 'worker-airtrust'), encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`wrangler d1 execute falhou (${dbName}): ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout);
  return parsed[0]?.results ?? [];
}

function listVersionedMigrations(dirs = getMigrationsDirs()) {
  const fileMap = new Map();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (/^\d+.*\.sql$/.test(f) && !fileMap.has(f)) {
        fileMap.set(f, path.join(dir, f));
      }
    }
  }
  return fileMap;
}

function extractCreatedTables(sql) {
  const names = new Set();
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/gi;
  let m;
  while ((m = re.exec(sql))) {
    names.add(m[1]);
  }
  return [...names];
}

function classify({ registered, expectedTables, existingTables }) {
  if (expectedTables.length === 0) {
    // Migration doesn't create tables (data-only / ALTER / index-only) —
    // ledger registration is the only signal available.
    return registered ? 'aplicada_e_registrada' : 'pendente_ou_nao_verificavel';
  }

  const presentCount = expectedTables.filter((t) => existingTables.has(t)).length;

  if (presentCount === expectedTables.length) {
    return registered ? 'aplicada_e_registrada' : 'aplicada_mas_nao_registrada';
  }
  if (presentCount === 0) {
    return registered ? 'registrada_mas_nao_aplicada' : 'pendente';
  }
  return 'ambigua';
}

async function main() {
  const migrationMap = listVersionedMigrations();
  const files = [...migrationMap.keys()].sort();
  const scopeFiles = parseScopeArg(process.argv.slice(2), files);
  const dbName = process.env.STAGING_D1_NAME || ALLOWED_STAGING_DB_NAME;
  const dbId = process.env.STAGING_D1_ID || ALLOWED_STAGING_DB_ID;
  assertStagingTarget(dbName, dbId);

  const ledgerRows = runWranglerJson(dbName, 'SELECT name FROM d1_migrations ORDER BY id;');
  const ledgerNames = new Set(ledgerRows.map((r) => r.name));

  const tableRows = runWranglerJson(
    dbName,
    "SELECT name FROM sqlite_master WHERE type='table';",
  );
  const existingTables = new Set(tableRows.map((r) => r.name));

  const report = [];

  for (const file of files) {
    const fullPath = migrationMap.get(file);
    const sql = readFileSync(fullPath, 'utf8');
    const expectedTables = extractCreatedTables(sql);
    const registered = ledgerNames.has(file);
    const state = classify({ registered, expectedTables, existingTables });
    report.push({ file, registered, expectedTables, state });
  }

  const summary = report.reduce((acc, r) => {
    acc[r.state] = (acc[r.state] || 0) + 1;
    return acc;
  }, {});
  const scopeDetails = scopeFiles ? report.filter((item) => scopeFiles.includes(item.file)) : report;
  const scopeSummary = scopeDetails.reduce((acc, r) => {
    acc[r.state] = (acc[r.state] || 0) + 1;
    return acc;
  }, {});

  const output = {
    target: { dbName, dbId },
    generatedAtUtc: new Date().toISOString(),
    totalVersionedMigrations: files.length,
    ledgerEntryCount: ledgerNames.size,
    summary,
    scope: scopeFiles,
    scopeSummary,
    ambiguousOrUnregisteredApplied: report.filter((r) =>
      ['ambigua', 'aplicada_mas_nao_registrada', 'registrada_mas_nao_aplicada'].includes(r.state),
    ),
    details: report,
  };

  console.log(JSON.stringify(output, null, 2));

  const scopeHasAmbiguous = scopeDetails.some((item) => item.state === 'ambigua');
  const scopeHasRegisteredButMissing = scopeDetails.some((item) => item.state === 'registrada_mas_nao_aplicada');
  if (scopeHasAmbiguous || scopeHasRegisteredButMissing) {
    console.error(
      'PREFLIGHT_RED: estado ambíguo ou "registrada mas não aplicada" encontrado na scope avaliada. ' +
        'Não aplicar migrations em cadeia — revisão humana obrigatória antes de qualquer escrita no ledger.',
    );
    process.exitCode = 1;
    return;
  }

  console.log('PREFLIGHT_OK: nenhum estado ambíguo encontrado na scope avaliada (read-only, nada foi alterado).');
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exitCode = 1;
});
