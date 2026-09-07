#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const STAGING_DB_NAME = 'airtrust-db-staging-baseline-20260701';
const STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const PRODUCTION_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const DEVELOPMENT_DB_ID = 'a72fb05b-0912-4ad9-9686-e7948c8b09eb';

const PREFLIGHT_CONFIRMATION = 'AIRTRUST_STAGING_FRMS_0464_BOOTSTRAP_PREFLIGHT';
const APPLY_CONFIRMATION = 'AIRTRUST_STAGING_FRMS_0464_BOOTSTRAP_APPLY';

const TARGET_REVISION_ID = 'frms-legacy-global-v2';
const TARGET_PROFILE_CODE = 'LEGACY_GENERAL';

const OPERATIONAL_SQL_GOVERNANCE = Object.freeze({
  source_reference: '0464_frms_parameter_governance_recalc.sql legacy bootstrap',
  operational_decision: 'staging-only repair of missing LEGACY_GENERAL operational limit parameters',
  dry_run_required: true,
  rollback_plan_required: true,
});

const MUTATING_SQL = /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|ATTACH|DETACH|REINDEX)\b/i;
const APPLY_FORBIDDEN_SQL = /\b(UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|ATTACH|DETACH|REINDEX)\b/i;
const SAFE_KEY = /^[A-Z][A-Z0-9_]*$/;

function fail(message) {
  throw new Error(message);
}

function parseMode() {
  const arg = process.argv.find((value) => value.startsWith('--mode='));
  const mode = String(arg?.slice('--mode='.length) || 'preflight').trim().toLowerCase();
  if (!['preflight', 'apply'].includes(mode)) fail(`INVALID_MODE:${mode}`);
  return mode;
}

function parseLimitesDefaultKeys() {
  const file = path.join(ROOT, 'worker-airtrust', 'src', 'lib', 'frms', 'types.ts');
  const source = readFileSync(file, 'utf8');
  const block = source.match(/LIMITES_DEFAULT[^{]*\{([\s\S]*?)\n\};/);
  if (!block) fail('LIMITES_DEFAULT_NOT_FOUND');
  const keys = [...block[1].matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((match) => match[1]);
  if (keys.length === 0) fail('LIMITES_DEFAULT_EMPTY');
  if (new Set(keys).size !== keys.length) fail('LIMITES_DEFAULT_DUPLICATE_KEYS');
  for (const key of keys) {
    if (!SAFE_KEY.test(key)) fail(`LIMITES_DEFAULT_UNSAFE_KEY:${key}`);
  }
  return keys;
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assertStagingConfig() {
  const file = path.join(ROOT, 'worker-airtrust', 'wrangler.toml');
  const source = readFileSync(file, 'utf8');
  const stagingStart = source.indexOf('[[env.staging.d1_databases]]');
  const productionStart = source.indexOf('[[env.production.d1_databases]]');
  if (stagingStart < 0 || productionStart < 0 || productionStart <= stagingStart) {
    fail('WRANGLER_STAGING_OR_PRODUCTION_D1_BLOCK_NOT_FOUND');
  }
  const stagingBlock = source.slice(stagingStart, productionStart);
  if (!stagingBlock.includes(`database_name = "${STAGING_DB_NAME}"`)) {
    fail('STAGING_DB_NAME_CONFIG_MISMATCH');
  }
  if (!stagingBlock.includes(`database_id = "${STAGING_DB_ID}"`)) {
    fail('STAGING_DB_ID_CONFIG_MISMATCH');
  }
  if (stagingBlock.includes(PRODUCTION_DB_ID) || stagingBlock.includes(DEVELOPMENT_DB_ID)) {
    fail('STAGING_CONFIG_CONTAINS_BLOCKED_DB_ID');
  }
}

function assertCloudflareCredentialContext() {
  if (!process.env.CLOUDFLARE_API_TOKEN) fail('STAGING_D1_TOKEN_MISSING');
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) fail('CLOUDFLARE_ACCOUNT_ID_MISSING');

  const requestedName = String(process.env.STAGING_D1_NAME || STAGING_DB_NAME);
  const requestedId = String(process.env.STAGING_D1_ID || STAGING_DB_ID);
  if (requestedName !== STAGING_DB_NAME || requestedId !== STAGING_DB_ID) {
    fail('TARGET_NOT_CANONICAL_STAGING');
  }
  if ([PRODUCTION_DB_ID, DEVELOPMENT_DB_ID].includes(requestedId)) {
    fail('TARGET_IS_PRODUCTION_OR_DEVELOPMENT_BLOCKED');
  }
}

function assertExpectedDeployedSha() {
  const expected = String(process.env.EXPECTED_DEPLOYED_SHA || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expected)) fail('EXPECTED_DEPLOYED_SHA_INVALID');
  return expected;
}

function assertConfirmation(mode) {
  const confirmation = String(process.env.CONFIRMATION || '');
  if (mode === 'preflight' && confirmation !== PREFLIGHT_CONFIRMATION) {
    fail('PREFLIGHT_CONFIRMATION_REJECTED');
  }
  if (mode === 'apply' && confirmation !== APPLY_CONFIRMATION) {
    fail('APPLY_CONFIRMATION_REJECTED');
  }
}

function assertReadOnlySql(sql) {
  const normalized = String(sql).trim();
  if (!(normalized.startsWith('SELECT ') || /^PRAGMA\s+table_info\s*\(/i.test(normalized))) {
    fail('NOT_READ_ONLY_SQL');
  }
  if (MUTATING_SQL.test(normalized)) fail('MUTATING_SQL_BLOCKED');
  const body = normalized.replace(/;\s*$/, '');
  if (body.includes(';')) fail('MULTI_STATEMENT_SQL_BLOCKED');
}

function assertApplySql(sql) {
  const normalized = String(sql).trim();
  if (!/^INSERT\s+INTO\s+frms_config_parameters\b/i.test(normalized)) {
    fail('APPLY_SQL_TARGET_REJECTED');
  }
  if (APPLY_FORBIDDEN_SQL.test(normalized)) fail('APPLY_SQL_FORBIDDEN_VERB');
  if ((normalized.match(/\bINSERT\s+INTO\b/gi) || []).length !== 1) {
    fail('APPLY_SQL_INSERT_COUNT_REJECTED');
  }
  if (!/FROM\s+frms_configuracao_limites\s+s\b/i.test(normalized)) {
    fail('APPLY_SQL_SOURCE_REJECTED');
  }
  if (!normalized.includes(quote(TARGET_REVISION_ID))) fail('APPLY_SQL_REVISION_REJECTED');
  if (!/NOT\s+EXISTS\s*\(/i.test(normalized)) fail('APPLY_SQL_NOT_IDEMPOTENT');
  const body = normalized.replace(/;\s*$/, '');
  if (body.includes(';')) fail('APPLY_SQL_MULTI_STATEMENT_BLOCKED');
}

async function cloudflareD1Query(sql, { write = false } = {}) {
  if (write) assertApplySql(sql);
  else assertReadOnlySql(sql);

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${STAGING_DB_ID}/query`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ sql }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true) {
    const errorCodes = Array.isArray(payload?.errors)
      ? payload.errors.map((item) => item?.code).filter(Boolean).join(',')
      : '';
    fail(`D1_QUERY_FAILED:http=${response.status}:codes=${errorCodes || 'unknown'}`);
  }

  const first = Array.isArray(payload.result) ? payload.result[0] : payload.result;
  if (first?.success === false) fail('D1_STATEMENT_FAILED');
  return {
    rows: Array.isArray(first?.results) ? first.results : [],
    meta: first?.meta || {},
  };
}

function rowsToNameMap(rows) {
  return new Map(rows.map((row) => [String(row.nome), row]));
}

async function tableColumns(table) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) fail(`UNSAFE_TABLE_NAME:${table}`);
  const { rows } = await cloudflareD1Query(`PRAGMA table_info(${table})`);
  return new Set(rows.map((row) => String(row.name)));
}

async function preflightSource(requiredKeys) {
  const requiredColumns = ['nome', 'valor_numerico', 'unidade', 'ativo', 'deleted_at'];
  const columns = await tableColumns('frms_configuracao_limites');
  const missingColumns = requiredColumns.filter((column) => !columns.has(column));
  if (missingColumns.length > 0) {
    return {
      tableExists: columns.size > 0,
      missingColumns,
      requiredCount: requiredKeys.length,
      presentCount: 0,
      missingKeys: [...requiredKeys],
      duplicateKeys: [],
      invalidValueKeys: [],
      invalidUnitKeys: [],
      ready: false,
    };
  }

  const keyList = requiredKeys.map(quote).join(', ');
  const { rows } = await cloudflareD1Query(
    `SELECT nome, COUNT(*) AS row_count, ` +
      `SUM(CASE WHEN valor_numerico IS NULL THEN 1 ELSE 0 END) AS invalid_value_count, ` +
      `SUM(CASE WHEN unidade IS NULL OR TRIM(unidade) = '' THEN 1 ELSE 0 END) AS invalid_unit_count ` +
      `FROM frms_configuracao_limites ` +
      `WHERE ativo = 1 AND deleted_at IS NULL AND nome IN (${keyList}) ` +
      `GROUP BY nome ORDER BY nome`,
  );

  const byName = rowsToNameMap(rows);
  const present = requiredKeys.filter((key) => byName.has(key));
  const missing = requiredKeys.filter((key) => !byName.has(key));
  const duplicates = requiredKeys.filter((key) => Number(byName.get(key)?.row_count || 0) !== 1 && byName.has(key));
  const invalidValues = requiredKeys.filter((key) => Number(byName.get(key)?.invalid_value_count || 0) > 0);
  const invalidUnits = requiredKeys.filter((key) => Number(byName.get(key)?.invalid_unit_count || 0) > 0);

  return {
    tableExists: true,
    missingColumns: [],
    requiredCount: requiredKeys.length,
    presentCount: present.length,
    missingKeys: missing,
    duplicateKeys: duplicates,
    invalidValueKeys: invalidValues,
    invalidUnitKeys: invalidUnits,
    ready:
      present.length === requiredKeys.length &&
      missing.length === 0 &&
      duplicates.length === 0 &&
      invalidValues.length === 0 &&
      invalidUnits.length === 0,
  };
}

async function preflightTarget(requiredKeys) {
  const keyList = requiredKeys.map(quote).join(', ');
  const expectedIds = requiredKeys.map((key) => quote(`frms-legacy-limit-${key}`)).join(', ');

  const [{ rows: revisions }, { rows: totalRows }, { rows: requiredRows }, { rows: collisionRows }] =
    await Promise.all([
      cloudflareD1Query(
        `SELECT id FROM frms_config_revisions ` +
          `WHERE profile_code = ${quote(TARGET_PROFILE_CODE)} AND status = 'ACTIVE' ORDER BY id`,
      ),
      cloudflareD1Query(
        `SELECT COUNT(*) AS c FROM frms_config_parameters WHERE revision_id = ${quote(TARGET_REVISION_ID)}`,
      ),
      cloudflareD1Query(
        `SELECT parameter_key, COUNT(*) AS row_count FROM frms_config_parameters ` +
          `WHERE revision_id = ${quote(TARGET_REVISION_ID)} AND parameter_key IN (${keyList}) ` +
          `GROUP BY parameter_key ORDER BY parameter_key`,
      ),
      cloudflareD1Query(
        `SELECT id, revision_id, parameter_key FROM frms_config_parameters ` +
          `WHERE id IN (${expectedIds}) AND NOT (revision_id = ${quote(TARGET_REVISION_ID)} AND parameter_key IN (${keyList})) ` +
          `ORDER BY id`,
      ),
    ]);

  const activeRevisionIds = revisions.map((row) => String(row.id));
  const requiredMap = new Map(requiredRows.map((row) => [String(row.parameter_key), Number(row.row_count || 0)]));
  const presentKeys = requiredKeys.filter((key) => requiredMap.has(key));
  const missingKeys = requiredKeys.filter((key) => !requiredMap.has(key));
  const duplicateKeys = requiredKeys.filter((key) => Number(requiredMap.get(key) || 0) > 1);

  return {
    revisionCount: activeRevisionIds.length,
    activeRevisionIds,
    fixedRevisionIsOnlyActive:
      activeRevisionIds.length === 1 && activeRevisionIds[0] === TARGET_REVISION_ID,
    totalParameterCount: Number(totalRows[0]?.c || 0),
    requiredPresentCount: presentKeys.length,
    requiredMissingCount: missingKeys.length,
    requiredMissingKeys: missingKeys,
    requiredDuplicateKeys: duplicateKeys,
    idCollisions: collisionRows.map((row) => ({
      id: String(row.id),
      revisionId: String(row.revision_id),
      parameterKey: String(row.parameter_key),
    })),
  };
}

function buildApplySql(requiredKeys) {
  const keyList = requiredKeys.map(quote).join(', ');
  return (
    `INSERT INTO frms_config_parameters ` +
    `(id, revision_id, parameter_key, numeric_value, unit, metric, required, created_at) ` +
    `SELECT 'frms-legacy-limit-' || s.nome, ${quote(TARGET_REVISION_ID)}, s.nome, ` +
    `s.valor_numerico, s.unidade, 'LEGACY_LIMIT', 1, datetime('now') ` +
    `FROM frms_configuracao_limites s ` +
    `WHERE s.ativo = 1 AND s.deleted_at IS NULL AND s.nome IN (${keyList}) ` +
    `AND NOT EXISTS (SELECT 1 FROM frms_config_parameters t ` +
    `WHERE t.revision_id = ${quote(TARGET_REVISION_ID)} AND t.parameter_key = s.nome)`
  );
}

function assessApplyReady(source, target) {
  return Boolean(
    source.ready &&
      target.revisionCount === 1 &&
      target.fixedRevisionIsOnlyActive &&
      target.requiredDuplicateKeys.length === 0 &&
      target.idCollisions.length === 0,
  );
}

async function run() {
  const mode = parseMode();
  assertStagingConfig();
  assertCloudflareCredentialContext();
  assertConfirmation(mode);
  const expectedDeployedSha = assertExpectedDeployedSha();
  const requiredKeys = parseLimitesDefaultKeys();

  const source = await preflightSource(requiredKeys);
  const targetBefore = await preflightTarget(requiredKeys);
  const applyReady = assessApplyReady(source, targetBefore);
  const applySql = buildApplySql(requiredKeys);
  assertApplySql(applySql);

  const report = {
    generatedAtUtc: new Date().toISOString(),
    mode,
    deployedStagingSha: expectedDeployedSha,
    target: {
      databaseName: STAGING_DB_NAME,
      databaseId: STAGING_DB_ID,
      productionDatabaseIdBlocked: PRODUCTION_DB_ID,
    },
    governance: OPERATIONAL_SQL_GOVERNANCE,
    source,
    targetBefore,
    preparedApply: {
      scope: 'frms_config_parameters only',
      revisionId: TARGET_REVISION_ID,
      idempotent: true,
      replays0464: false,
      touchesLedger: false,
      applyReady,
    },
    applyExecuted: false,
    insertedChanges: null,
    targetAfter: null,
    verdict: {
      preflightReadOnly: mode === 'preflight',
      applyReady,
      postconditionReady: null,
    },
  };

  if (mode === 'apply') {
    if (!applyReady) fail('APPLY_NOT_READY_PREFLIGHT_FAILED');
    const result = await cloudflareD1Query(applySql, { write: true });
    report.applyExecuted = true;
    report.insertedChanges = Number(result.meta?.changes ?? 0);
    report.targetAfter = await preflightTarget(requiredKeys);
    report.verdict.postconditionReady =
      report.targetAfter.revisionCount === 1 &&
      report.targetAfter.fixedRevisionIsOnlyActive &&
      report.targetAfter.requiredPresentCount === requiredKeys.length &&
      report.targetAfter.requiredMissingCount === 0 &&
      report.targetAfter.requiredDuplicateKeys.length === 0 &&
      report.targetAfter.idCollisions.length === 0;
    if (!report.verdict.postconditionReady) fail('APPLY_POSTCONDITION_FAILED');
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (mode === 'preflight') {
    if (applyReady) {
      console.log('FRMS_0464_BOOTSTRAP_PREFLIGHT_PASS: source and target are safe for the dedicated idempotent repair. No write executed.');
      return;
    }
    console.error('FRMS_0464_BOOTSTRAP_PREFLIGHT_FAIL: repair is not safe to authorize yet. No write executed.');
    process.exitCode = 1;
    return;
  }

  console.log('FRMS_0464_BOOTSTRAP_APPLY_PASS: dedicated bootstrap repair completed and postconditions passed.');
}

run().catch((error) => {
  console.error(`[frms-0464-bootstrap-repair][ERROR] ${String(error?.message || error)}`);
  process.exitCode = 1;
});
