#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const PRODUCTION_DB_NAME = 'airtrust-db';
const PRODUCTION_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const CONFIRMATION = 'AIRTRUST_PRODUCTION_READONLY_PREFLIGHT';
const BASELINE_ID = 'production-d1-baseline-v2-20260714';
const QUAL_RENEWAL_CHANGE_ID = 'qualificacoes-renovacoes-0487';

const MUTATING_SQL = /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|ATTACH|DETACH|REINDEX)\b/i;
const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

const TABLE_COLUMNS = Object.freeze({
  frms_regulatory_profiles: ['id','empresa_id','profile_code','effective_from','effective_to','active','deleted_at'],
  frms_config_revisions: ['id','empresa_id','profile_code','revision_number','status','policy_version','effective_from','effective_to'],
  frms_profile_assignments: ['id','empresa_id','regulatory_profile_id','profile_code','status','effective_from','effective_to'],
  frms_config_parameters: ['id','revision_id','parameter_key','numeric_value','unit','required'],
  frms_recalc_runs: ['id','empresa_id','profile_code','target_revision_id','status','effective_from','effective_to'],
  frms_fatorizacao_jornada: ['config_revision_id','model_version','recalc_state'],
  frms_fadiga_checkin: ['regulatory_profile_id','profile_code','config_revision_id','model_version'],
  usuarios_empresas_perfis: ['id','usuario_id','empresa_id','perfil','ativo','created_at','updated_at'],
});

const REQUIRED_TABLES = [
  'frms_regulatory_profiles',
  'frms_location_catalog',
  'frms_jornada_avaliacoes',
  'frms_config_revisions',
  'frms_profile_assignments',
  'frms_config_parameters',
  'frms_recalc_runs',
  'usuarios_empresas_perfis',
];

const REQUIRED_INDEXES = [
  'idx_frms_reg_profiles_empresa_effective',
  'idx_frms_location_catalog_empresa_code_active',
  'idx_frms_jornada_avaliacoes_empresa_jornada',
  'idx_frms_jornada_avaliacoes_empresa_level',
  'idx_frms_jornada_avaliacoes_input_active',
  'idx_frms_config_revision_resolution',
  'idx_frms_profile_assignment_resolution',
  'idx_frms_config_parameter_revision',
  'idx_frms_recalc_run_scope',
  'idx_frms_fatorizacao_revision_state',
  'idx_frms_checkin_governed_context',
  'idx_usuarios_empresas_perfis_lookup',
];

function fail(message) {
  throw new Error(message);
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assertRuntimeInputs() {
  if (process.env.CONFIRMATION !== CONFIRMATION) fail('READONLY_CONFIRMATION_REJECTED');
  const expectedSha = String(process.env.EXPECTED_SHA || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) fail('EXPECTED_SHA_INVALID');
  if (!process.env.CLOUDFLARE_API_TOKEN) fail('PRODUCTION_D1_TOKEN_MISSING');
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) fail('CLOUDFLARE_ACCOUNT_ID_MISSING');

  const dbName = String(process.env.PRODUCTION_D1_NAME || PRODUCTION_DB_NAME);
  const dbId = String(process.env.PRODUCTION_D1_ID || PRODUCTION_DB_ID);
  if (dbName !== PRODUCTION_DB_NAME || dbId !== PRODUCTION_DB_ID) fail('PRODUCTION_TARGET_MISMATCH');
  if (dbId === STAGING_DB_ID) fail('STAGING_TARGET_REJECTED');

  const wrangler = readFileSync(path.join(ROOT, 'worker-airtrust', 'wrangler.toml'), 'utf8');
  const section = wrangler.match(/\[\[env\.production\.d1_databases\]\][\s\S]*?(?=\n\[|$)/)?.[0] || '';
  if (!section.includes(`database_name = "${PRODUCTION_DB_NAME}"`)) fail('WRANGLER_PRODUCTION_DB_NAME_MISMATCH');
  if (!section.includes(`database_id = "${PRODUCTION_DB_ID}"`)) fail('WRANGLER_PRODUCTION_DB_ID_MISMATCH');

  return expectedSha;
}

function assertReadOnlySql(sql) {
  const normalized = String(sql).trim();
  if (!(normalized.startsWith('SELECT ') || /^PRAGMA\s+table_info\s*\(/i.test(normalized))) {
    fail('NON_READONLY_SQL_REJECTED');
  }
  if (MUTATING_SQL.test(normalized)) fail('MUTATING_SQL_REJECTED');
  const body = normalized.replace(/;\s*$/, '');
  if (body.includes(';')) fail('MULTI_STATEMENT_SQL_REJECTED');
}

async function query(sql) {
  assertReadOnlySql(sql);
  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}/d1/database/${PRODUCTION_DB_ID}/query`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ sql }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true) {
    const codes = Array.isArray(payload?.errors)
      ? payload.errors.map((x) => x?.code).filter(Boolean).join(',')
      : '';
    fail(`D1_READ_FAILED:http=${response.status}:codes=${codes || 'unknown'}`);
  }
  const first = Array.isArray(payload.result) ? payload.result[0] : payload.result;
  if (first?.success === false) fail('D1_STATEMENT_FAILED');
  return Array.isArray(first?.results) ? first.results : [];
}

async function tableColumns(table) {
  if (!SAFE_IDENT.test(table)) fail('UNSAFE_TABLE_IDENTIFIER');
  const rows = await query(`PRAGMA table_info(${table})`);
  return new Set(rows.map((row) => String(row.name)));
}

function parseGovernedParameterKeys() {
  const sql = readFileSync(
    path.join(ROOT, 'scripts', 'frms-seeds', 'frms_helicopter_offshore_baseline_v1.sql'),
    'utf8',
  );
  const revision = 'frms-helicopter-offshore-baseline-v1';
  const pattern = new RegExp(
    "\\('" + revision + "-([A-Z][A-Z0-9_]*)',\\s*'" + revision + "',\\s*'([A-Z][A-Z0-9_]*)',",
    'g',
  );
  const keys = [];
  for (const match of sql.matchAll(pattern)) {
    if (match[1] !== match[2]) fail('GOVERNED_PARAMETER_SEED_KEY_MISMATCH');
    keys.push(match[1]);
  }
  const unique = [...new Set(keys)].sort();
  if (unique.length !== 128 || unique.length !== keys.length) {
    fail(`GOVERNED_PARAMETER_CATALOG_COUNT:${unique.length}/${keys.length}`);
  }
  return unique;
}

async function inspectStaticSchema() {
  const names = await query(
    `SELECT type, name FROM sqlite_master WHERE name IN (${[...REQUIRED_TABLES, ...REQUIRED_INDEXES].map(quote).join(', ')}) ORDER BY type, name`,
  );
  const presentTables = new Set(names.filter((r) => r.type === 'table').map((r) => String(r.name)));
  const presentIndexes = new Set(names.filter((r) => r.type === 'index').map((r) => String(r.name)));
  const missingTables = REQUIRED_TABLES.filter((name) => !presentTables.has(name));
  const missingIndexes = REQUIRED_INDEXES.filter((name) => !presentIndexes.has(name));

  const missingColumns = [];
  for (const [table, expected] of Object.entries(TABLE_COLUMNS)) {
    const columns = await tableColumns(table);
    for (const column of expected) {
      if (!columns.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }

  const ledgerRows = await query(
    `SELECT name FROM d1_migrations WHERE name IN ('0463_frms_iogp_schema_v2.sql','0464_frms_parameter_governance_recalc.sql') ORDER BY name`,
  ).catch(() => []);
  const ledgerNames = new Set(ledgerRows.map((r) => String(r.name)));

  return {
    missingTables,
    missingIndexes,
    missingColumns,
    ledger0463: ledgerNames.has('0463_frms_iogp_schema_v2.sql') ? 'PRESENT' : 'ABSENT',
    ledger0464: ledgerNames.has('0464_frms_parameter_governance_recalc.sql') ? 'PRESENT' : 'ABSENT',
    ready: missingTables.length === 0 && missingIndexes.length === 0 && missingColumns.length === 0,
  };
}

async function inspectAuthAuthority() {
  const [tableSqlRows, backfillRows, orphanRows, totalRows] = await Promise.all([
    query(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='usuarios_empresas_perfis' LIMIT 1`,
    ),
    query(
      `SELECT COUNT(*) AS c FROM usuarios_empresas ue WHERE ue.role IS NOT NULL AND ue.role <> '' AND NOT EXISTS (SELECT 1 FROM usuarios_empresas_perfis p WHERE p.usuario_id = ue.usuario_id AND p.empresa_id = ue.empresa_id AND p.perfil = ue.role)`,
    ),
    query(
      `SELECT COUNT(*) AS c FROM usuarios_empresas_perfis p WHERE p.perfil IN (SELECT role FROM usuarios_empresas WHERE role IS NOT NULL AND role <> '') AND NOT EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = p.usuario_id AND ue.empresa_id = p.empresa_id)`,
    ),
    query(`SELECT COUNT(*) AS c FROM usuarios_empresas_perfis`),
  ]);
  const tableSql = String(tableSqlRows[0]?.sql || '').replace(/\s+/g, ' ');
  const uniqueConstraint = /UNIQUE\s*\(\s*usuario_id\s*,\s*empresa_id\s*,\s*perfil\s*\)/i.test(tableSql);
  const backfillGaps = Number(backfillRows[0]?.c || 0);
  const orphanRowsCount = Number(orphanRows[0]?.c || 0);
  const rowCount = Number(totalRows[0]?.c || 0);
  return {
    uniqueConstraint,
    backfillGaps,
    orphanRows: orphanRowsCount,
    rowCount,
    ready: uniqueConstraint && backfillGaps === 0 && orphanRowsCount === 0 && rowCount > 0,
  };
}

async function inspectFrmsGovernance(requiredKeys) {
  const today = new Date().toISOString().slice(0, 10);
  const tenantRows = await query(
    `SELECT DISTINCT f.empresa_id AS empresa_id FROM frms_jornada j JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER) AND f.deleted_at IS NULL WHERE j.deleted_at IS NULL AND f.empresa_id IS NOT NULL ORDER BY f.empresa_id`,
  );
  const reasons = {};
  const missingAssignmentTenantIds = [];
  const missingAssignmentDetails = [];
  let readyTenants = 0;

  const bump = (reason) => {
    reasons[reason] = (reasons[reason] || 0) + 1;
  };

  for (const row of tenantRows) {
    const empresaId = Number(row.empresa_id);
    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      bump('INVALID_TENANT_ID');
      continue;
    }
    const assignments = await query(
      `SELECT regulatory_profile_id, profile_code FROM frms_profile_assignments WHERE empresa_id = ${empresaId} AND status = 'ACTIVE' AND effective_from <= ${quote(today)} AND (effective_to IS NULL OR effective_to >= ${quote(today)})`,
    );
    if (assignments.length !== 1) {
      if (assignments.length === 0) {
        missingAssignmentTenantIds.push(empresaId);
        const candidateProfiles = await query(
          `SELECT id, profile_code, service_category FROM frms_regulatory_profiles WHERE empresa_id = ${empresaId} AND active = 1 AND deleted_at IS NULL AND effective_from <= ${quote(today)} AND (effective_to IS NULL OR effective_to >= ${quote(today)}) ORDER BY profile_code, id`,
        );
        const profileCandidates = [];
        for (const candidate of candidateProfiles) {
          const candidateCode = String(candidate.profile_code);
          const revisions = await query(
            `SELECT id, empresa_id, revision_number, policy_version, effective_from FROM frms_config_revisions WHERE profile_code = ${quote(candidateCode)} AND status = 'ACTIVE' AND (empresa_id = ${empresaId} OR empresa_id IS NULL) AND effective_from <= ${quote(today)} AND (effective_to IS NULL OR effective_to >= ${quote(today)}) ORDER BY CASE WHEN empresa_id = ${empresaId} THEN 0 ELSE 1 END, revision_number DESC, effective_from DESC`,
          );
          let resolvedRevisionId = null;
          let governedParameterCount = null;
          let revisionDecisionReady = false;
          if (revisions.length > 0) {
            const preferredScope = revisions[0].empresa_id == null ? null : Number(revisions[0].empresa_id);
            const scoped = revisions.filter((rev) =>
              (preferredScope == null ? rev.empresa_id == null : Number(rev.empresa_id) === empresaId),
            );
            const top = scoped[0];
            const equallyPreferred = scoped.filter(
              (rev) => Number(rev.revision_number) === Number(top.revision_number) && String(rev.effective_from) === String(top.effective_from),
            );
            if (equallyPreferred.length === 1 && String(top.policy_version || '')) {
              resolvedRevisionId = String(top.id);
              const keyList = requiredKeys.map(quote).join(', ');
              const parameterRows = await query(
                `SELECT COUNT(DISTINCT parameter_key) AS c FROM frms_config_parameters WHERE revision_id = ${quote(resolvedRevisionId)} AND parameter_key IN (${keyList}) AND numeric_value IS NOT NULL`,
              );
              governedParameterCount = Number(parameterRows[0]?.c || 0);
              revisionDecisionReady = governedParameterCount === requiredKeys.length;
            }
          }
          profileCandidates.push({
            regulatoryProfileId: String(candidate.id),
            profileCode: candidateCode,
            serviceCategory: candidate.service_category == null ? null : String(candidate.service_category),
            resolvedRevisionId,
            governedParameterCount,
            revisionDecisionReady,
          });
        }
        missingAssignmentDetails.push({
          empresaId,
          activeRegulatoryProfileCount: profileCandidates.length,
          profileCandidates,
          profileDecisionProven:
            profileCandidates.length === 1 && profileCandidates[0].revisionDecisionReady === true,
        });
      }
      bump(assignments.length === 0 ? 'ASSIGNMENT_MISSING' : 'ASSIGNMENT_AMBIGUOUS');
      continue;
    }
    const profileCode = String(assignments[0].profile_code);
    const profileId = String(assignments[0].regulatory_profile_id);
    const profiles = await query(
      `SELECT id FROM frms_regulatory_profiles WHERE id = ${quote(profileId)} AND empresa_id = ${empresaId} AND profile_code = ${quote(profileCode)} AND active = 1 AND deleted_at IS NULL AND effective_from <= ${quote(today)} AND (effective_to IS NULL OR effective_to >= ${quote(today)})`,
    );
    if (profiles.length !== 1) {
      bump(profiles.length === 0 ? 'PROFILE_MISSING' : 'PROFILE_AMBIGUOUS');
      continue;
    }
    const revisions = await query(
      `SELECT id, empresa_id, revision_number, policy_version, effective_from FROM frms_config_revisions WHERE profile_code = ${quote(profileCode)} AND status = 'ACTIVE' AND (empresa_id = ${empresaId} OR empresa_id IS NULL) AND effective_from <= ${quote(today)} AND (effective_to IS NULL OR effective_to >= ${quote(today)}) ORDER BY CASE WHEN empresa_id = ${empresaId} THEN 0 ELSE 1 END, revision_number DESC, effective_from DESC`,
    );
    if (revisions.length === 0) {
      bump('REVISION_MISSING');
      continue;
    }
    const preferredScope = revisions[0].empresa_id == null ? null : Number(revisions[0].empresa_id);
    const scoped = revisions.filter((rev) =>
      (preferredScope == null ? rev.empresa_id == null : Number(rev.empresa_id) === empresaId),
    );
    const top = scoped[0];
    const equallyPreferred = scoped.filter(
      (rev) => Number(rev.revision_number) === Number(top.revision_number) && String(rev.effective_from) === String(top.effective_from),
    );
    if (equallyPreferred.length !== 1) {
      bump('REVISION_AMBIGUOUS');
      continue;
    }
    if (!String(top.policy_version || '')) {
      bump('REVISION_MODEL_VERSION_MISSING');
      continue;
    }
    const revisionId = String(top.id);
    const keyList = requiredKeys.map(quote).join(', ');
    const parameterRows = await query(
      `SELECT COUNT(DISTINCT parameter_key) AS c FROM frms_config_parameters WHERE revision_id = ${quote(revisionId)} AND parameter_key IN (${keyList}) AND numeric_value IS NOT NULL`,
    );
    const parameterCount = Number(parameterRows[0]?.c || 0);
    if (parameterCount !== requiredKeys.length) {
      bump('REQUIRED_PARAMETERS_INCOMPLETE');
      continue;
    }
    readyTenants += 1;
  }

  const legacyRows = await query(
    `SELECT id FROM frms_config_revisions WHERE profile_code='LEGACY_GENERAL' AND status='ACTIVE' AND empresa_id IS NULL AND effective_from <= ${quote(today)} AND (effective_to IS NULL OR effective_to >= ${quote(today)})`,
  );
  let legacyParameterCount = 0;
  let legacyRequiredCount = 0;
  if (legacyRows.length === 1) {
    const id = String(legacyRows[0].id);
    const [total, required] = await Promise.all([
      query(`SELECT COUNT(*) AS c FROM frms_config_parameters WHERE revision_id=${quote(id)}`),
      query(
        `SELECT COUNT(DISTINCT parameter_key) AS c FROM frms_config_parameters WHERE revision_id=${quote(id)} AND parameter_key IN (${requiredKeys.map(quote).join(', ')}) AND numeric_value IS NOT NULL`,
      ),
    ]);
    legacyParameterCount = Number(total[0]?.c || 0);
    legacyRequiredCount = Number(required[0]?.c || 0);
  }

  return {
    activeTenantCount: tenantRows.length,
    readyTenantCount: readyTenants,
    notReadyTenantCount: tenantRows.length - readyTenants,
    failureReasons: reasons,
    missingAssignmentTenantIds,
    missingAssignmentDetails,
    legacyActiveRevisionCount: legacyRows.length,
    legacyParameterCount,
    legacyGovernedRequiredPresent: legacyRequiredCount,
    requiredGovernedParameterCount: requiredKeys.length,
    ready:
      tenantRows.length === readyTenants &&
      legacyRows.length === 1 &&
      legacyRequiredCount === requiredKeys.length,
  };
}

async function inspectQualificationRenewals() {
  const [
    baselineRows,
    ledgerRows,
    historyRows,
    tableRows,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*) AS c FROM airtrust_schema_baselines_v2 WHERE baseline_id=${quote(BASELINE_ID)} AND status='ACTIVE'`,
    ),
    query(
      `SELECT COUNT(*) AS c FROM airtrust_schema_changes_v2 WHERE change_id=${quote(QUAL_RENEWAL_CHANGE_ID)}`,
    ),
    query(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='qualificacoes_historico'`),
    query(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='qualificacoes_renovacoes'`),
  ]);

  const baselineCount = Number(baselineRows[0]?.c || 0);
  const ledgerCount = Number(ledgerRows[0]?.c || 0);
  const historyCount = Number(historyRows[0]?.c || 0);
  const tableCount = Number(tableRows[0]?.c || 0);

  let state = 'DRIFT';
  let readyForRelease = false;
  let applyReady = false;
  let missingColumns = [];
  let missingIndexes = [];

  if (baselineCount === 1 && historyCount === 1 && ledgerCount === 0 && tableCount === 0) {
    state = 'APPLY_READY_PENDING';
    applyReady = true;
  } else if (baselineCount === 1 && ledgerCount === 1 && tableCount === 1) {
    const columns = await tableColumns('qualificacoes_renovacoes');
    const expectedColumns = [
      'id','qualificacao_historico_id','data_renovacao_solicitada','status','observacoes','created_at','updated_at','deleted_at',
    ];
    missingColumns = expectedColumns.filter((column) => !columns.has(column));
    const indexRows = await query(
      `SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_qualificacoes_renovacoes_historico','idx_qualificacoes_renovacoes_status_data')`,
    );
    const indexNames = new Set(indexRows.map((r) => String(r.name)));
    missingIndexes = [
      'idx_qualificacoes_renovacoes_historico',
      'idx_qualificacoes_renovacoes_status_data',
    ].filter((name) => !indexNames.has(name));
    if (missingColumns.length === 0 && missingIndexes.length === 0) {
      state = 'APPLIED_VERIFIED';
      readyForRelease = true;
    }
  }

  return {
    baselineCount,
    ledgerCount,
    prerequisiteHistoryTableCount: historyCount,
    tableCount,
    missingColumns,
    missingIndexes,
    state,
    applyReady,
    readyForRelease,
  };
}

async function getVersion(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) return { ok: false, http: response.status };
  const payload = await response.json().catch(() => ({}));
  const data = payload?.data ?? payload;
  return {
    ok: true,
    environment: String(data?.environment || ''),
    sourceSha: String(data?.sourceSha || ''),
    version: String(data?.version || ''),
    workerVersionId: String(data?.workerVersionId || ''),
    deploymentId: String(data?.deploymentId || ''),
  };
}

async function run() {
  const expectedSha = assertRuntimeInputs();
  const requiredKeys = parseGovernedParameterKeys();

  const [
    productionVersion,
    stagingVersion,
    schema,
    authAuthority,
    frms,
    qualificationRenewals,
  ] = await Promise.all([
    getVersion('https://api.airtrust.online/api/version'),
    getVersion('https://airtrust-api-staging.airtrust.workers.dev/api/version'),
    inspectStaticSchema(),
    inspectAuthAuthority(),
    inspectFrmsGovernance(requiredKeys),
    inspectQualificationRenewals(),
  ]);

  const productionVersionReady =
    productionVersion.ok && productionVersion.environment === 'production';
  const stagingMatchesRelease =
    stagingVersion.ok &&
    stagingVersion.environment === 'staging' &&
    stagingVersion.sourceSha === expectedSha;
  const releaseReady =
    productionVersionReady &&
    stagingMatchesRelease &&
    schema.ready &&
    authAuthority.ready &&
    frms.ready &&
    qualificationRenewals.readyForRelease;

  const report = {
    generatedAtUtc: new Date().toISOString(),
    expectedSha,
    target: {
      databaseName: PRODUCTION_DB_NAME,
      databaseId: PRODUCTION_DB_ID,
      stagingDatabaseIdBlocked: STAGING_DB_ID,
    },
    productionVersion,
    stagingVersion,
    productionVersionReady,
    stagingMatchesRelease,
    schema,
    authAuthority,
    frms,
    qualificationRenewals,
    verdict: {
      readOnly: true,
      productionReleaseReady: releaseReady,
      blockers: [
        ...(productionVersionReady ? [] : ['PRODUCTION_VERSION_UNREADABLE_OR_WRONG_ENV']),
        ...(schema.ready ? [] : ['PRODUCTION_SCHEMA_STRUCTURAL_GAP']),
        ...(authAuthority.ready ? [] : ['AUTH_MULTI_PROFILE_AUTHORITY_NOT_READY']),
        ...(frms.ready ? [] : ['FRMS_GOVERNANCE_NOT_READY']),
        ...(qualificationRenewals.readyForRelease ? [] : [
          qualificationRenewals.state === 'APPLY_READY_PENDING'
            ? 'QUALIFICACOES_RENOVACOES_0487_APPLY_REQUIRED'
            : 'QUALIFICACOES_RENOVACOES_0487_DRIFT',
        ]),
        ...(stagingMatchesRelease ? [] : ['STAGING_RELEASE_SHA_MISMATCH']),
      ],
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!releaseReady) {
    console.error('PRODUCTION_RELEASE_READONLY_PREFLIGHT=BLOCKED');
    process.exitCode = 2;
  } else {
    console.log('PRODUCTION_RELEASE_READONLY_PREFLIGHT=PASS');
  }
}

run().catch((error) => {
  console.error(`[production-release-readonly-preflight][ERROR] ${String(error?.message || error)}`);
  process.exitCode = 1;
});
