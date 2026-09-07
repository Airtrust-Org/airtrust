#!/usr/bin/env node

// source_reference: production-release-readonly-preflight (run 34169522648 / 34170340062)
//   reported FRMS governance not ready — 1 of 2 active FRMS tenants has
//   ASSIGNMENT_MISSING. That preflight's sanitized report intentionally omits
//   empresa_id. This inventory identifies, READ-ONLY, exactly which active
//   tenant lacks a governed frms_profile_assignments row, and enumerates the
//   candidate frms_regulatory_profiles from that tenant's own data so a
//   profile decision can be made without inference.
// operational_decision: READ-ONLY production D1 inventory. Only SELECT / PRAGMA
//   table_info. Every statement is validated against a mutating-SQL denylist
//   before it reaches wrangler. Never --file, never a migration, never a
//   Schema V2 apply, never a write. Production D1 name+id are hard-pinned; the
//   staging D1 id is hard-blocked. No PII: only empresa_id and technical FRMS
//   governance fields are returned (never names, emails, documents, tokens).
// dry_run_required: not applicable — no side effects.
// rollback_plan_required: not applicable — read-only.

import { spawnSync } from 'node:child_process';

const PRODUCTION_DB_NAME = 'airtrust-db';
const PRODUCTION_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const BLOCKED_STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const BLOCKED_DEV_DB_ID = 'a72fb05b-0912-4ad9-9686-e7948c8b09eb';

const MUTATING_SQL =
  /\b(INSERT|UPDATE|DELETE|REPLACE|MERGE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|ATTACH|DETACH|REINDEX)\b|PRAGMA\s+[A-Za-z0-9_]+\s*=/i;
const READ_ONLY_PREFIX = /^\s*(SELECT|PRAGMA\s+table_info)\b/i;

function fail(message) {
  console.error(`[frms-assignment-readonly-inventory][ERROR] ${message}`);
  process.exit(1);
}

function assertReadOnlySql(sql) {
  const text = String(sql || '').trim();
  if (!text) fail('EMPTY_SQL');
  if (!READ_ONLY_PREFIX.test(text)) fail(`NOT_READ_ONLY_SQL: ${text}`);
  if (MUTATING_SQL.test(text)) fail(`MUTATING_SQL_BLOCKED: ${text}`);
  if (text.includes(';') && text.slice(text.indexOf(';') + 1).trim().length > 0) {
    fail(`MULTI_STATEMENT_SQL_BLOCKED: ${text}`);
  }
}

function assertProductionTarget(name, id) {
  const n = String(name || '').trim();
  const i = String(id || '').trim();
  if (i === BLOCKED_STAGING_DB_ID || i === BLOCKED_DEV_DB_ID) fail(`TARGET_IS_NON_PRODUCTION_BLOCKED: ${i}`);
  if (n !== PRODUCTION_DB_NAME || i !== PRODUCTION_DB_ID) {
    fail(`TARGET_NOT_PRODUCTION: got ${n} / ${i}, expected ${PRODUCTION_DB_NAME} / ${PRODUCTION_DB_ID}`);
  }
}

function query(dbName, sql) {
  assertReadOnlySql(sql);
  const run = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--env', 'production', '--remote', '--json', '--command', sql],
    { cwd: 'worker-airtrust', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.status !== 0) fail(`WRANGLER_EXECUTE_FAILED: ${(run.stderr || run.stdout || '').slice(0, 4000)}`);
  let parsed;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    parsed = JSON.parse(run.stdout.slice(run.stdout.search(/[[{]/)));
  }
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return first?.results ?? [];
}

function scalar(rows) {
  const row = rows[0] || {};
  return Number(row[Object.keys(row)[0]] ?? 0);
}

function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) fail('PRODUCTION_D1_READ_TOKEN_MISSING');
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) fail('CLOUDFLARE_ACCOUNT_ID_MISSING');

  const dbName = String(process.env.PRODUCTION_D1_NAME || PRODUCTION_DB_NAME);
  const dbId = String(process.env.PRODUCTION_D1_ID || PRODUCTION_DB_ID);
  assertProductionTarget(dbName, dbId);

  const expectedSha = String(process.env.EXPECTED_SHA || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) fail('EXPECTED_SHA_INVALID');

  const today = new Date().toISOString().slice(0, 10);

  // Active FRMS tenants = same definition the release preflight uses.
  const tenantIds = query(
    dbName,
    `SELECT DISTINCT f.empresa_id AS empresa_id FROM frms_jornada j ` +
      `JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER) AND f.deleted_at IS NULL ` +
      `WHERE j.deleted_at IS NULL AND f.empresa_id IS NOT NULL ORDER BY f.empresa_id`,
  ).map((r) => Number(r.empresa_id));

  const tenants = tenantIds.map((empresaId) => {
    const activeAssignments = query(
      dbName,
      `SELECT regulatory_profile_id, profile_code FROM frms_profile_assignments ` +
        `WHERE empresa_id = ${empresaId} AND status = 'ACTIVE' ` +
        `AND effective_from <= '${today}' AND (effective_to IS NULL OR effective_to >= '${today}') ` +
        `ORDER BY profile_code`,
    );
    const activeRegulatoryProfiles = query(
      dbName,
      `SELECT id, profile_code, service_category FROM frms_regulatory_profiles ` +
        `WHERE empresa_id = ${empresaId} AND active = 1 AND deleted_at IS NULL ` +
        `AND effective_from <= '${today}' AND (effective_to IS NULL OR effective_to >= '${today}') ` +
        `ORDER BY profile_code, id`,
    );

    let resolvedRevision = null;
    let resolvedParameterCount = null;
    if (activeRegulatoryProfiles.length === 1) {
      const profileCode = activeRegulatoryProfiles[0].profile_code;
      const revisions = query(
        dbName,
        `SELECT id, revision_number, model_version, policy_version, effective_from FROM frms_config_revisions ` +
          `WHERE profile_code = '${profileCode}' AND status = 'ACTIVE' ` +
          `AND (empresa_id = ${empresaId} OR empresa_id IS NULL) ` +
          `AND effective_from <= '${today}' AND (effective_to IS NULL OR effective_to >= '${today}') ` +
          `ORDER BY CASE WHEN empresa_id = ${empresaId} THEN 0 ELSE 1 END, revision_number DESC, effective_from DESC`,
      );
      if (revisions.length >= 1) {
        resolvedRevision = {
          id: revisions[0].id,
          revisionNumber: revisions[0].revision_number,
          modelVersion: revisions[0].model_version,
          tenantScoped: query(
            dbName,
            `SELECT COUNT(*) AS c FROM frms_config_revisions WHERE id = '${revisions[0].id}' AND empresa_id = ${empresaId}`,
          )[0]
            ? scalar(
                query(
                  dbName,
                  `SELECT COUNT(*) AS c FROM frms_config_revisions WHERE id = '${revisions[0].id}' AND empresa_id = ${empresaId}`,
                ),
              ) === 1
            : false,
          ambiguous: revisions.length > 1,
        };
        resolvedParameterCount = scalar(
          query(dbName, `SELECT COUNT(*) AS c FROM frms_config_parameters WHERE revision_id = '${revisions[0].id}'`),
        );
      }
    }

    return {
      empresaId,
      activeRegulatoryProfileCount: activeRegulatoryProfiles.length,
      activeRegulatoryProfiles: activeRegulatoryProfiles.map((p) => ({
        id: p.id,
        profileCode: p.profile_code,
        serviceCategory: p.service_category ?? null,
      })),
      activeAssignmentCount: activeAssignments.length,
      activeAssignments: activeAssignments.map((a) => ({
        regulatoryProfileId: a.regulatory_profile_id,
        profileCode: a.profile_code,
      })),
      resolvedRevision,
      resolvedParameterCount,
      assignmentState:
        activeAssignments.length === 0
          ? 'ASSIGNMENT_MISSING'
          : activeAssignments.length === 1
            ? 'ASSIGNMENT_PRESENT'
            : 'ASSIGNMENT_AMBIGUOUS',
    };
  });

  const missing = tenants.filter((t) => t.assignmentState === 'ASSIGNMENT_MISSING');

  // Profile decision — only proven from the tenant's OWN data, exactly one
  // applicable active regulatory profile, and an unambiguous governed revision.
  let profileDecision = { proven: false, reason: null };
  if (missing.length === 1) {
    const t = missing[0];
    if (t.activeRegulatoryProfileCount === 0) {
      profileDecision = { proven: false, reason: 'NO_APPLICABLE_REGULATORY_PROFILE_FOR_TENANT' };
    } else if (t.activeRegulatoryProfileCount > 1) {
      profileDecision = { proven: false, reason: 'MULTIPLE_APPLICABLE_REGULATORY_PROFILES_FOR_TENANT' };
    } else if (!t.resolvedRevision) {
      profileDecision = { proven: false, reason: 'NO_ACTIVE_GOVERNED_REVISION_FOR_PROFILE' };
    } else if (t.resolvedRevision.ambiguous) {
      profileDecision = { proven: false, reason: 'AMBIGUOUS_ACTIVE_GOVERNED_REVISION' };
    } else if (!t.resolvedRevision.modelVersion) {
      profileDecision = { proven: false, reason: 'REVISION_MODEL_VERSION_MISSING' };
    } else {
      profileDecision = {
        proven: true,
        reason: 'SINGLE_TENANT_SCOPED_ACTIVE_REGULATORY_PROFILE_WITH_UNAMBIGUOUS_GOVERNED_REVISION',
        empresaId: t.empresaId,
        profileCode: t.activeRegulatoryProfiles[0].profileCode,
        regulatoryProfileId: t.activeRegulatoryProfiles[0].id,
        revisionId: t.resolvedRevision.id,
        parameterCount: t.resolvedParameterCount,
      };
    }
  } else if (missing.length === 0) {
    profileDecision = { proven: false, reason: 'NO_TENANT_WITH_MISSING_ASSIGNMENT' };
  } else {
    profileDecision = { proven: false, reason: `MULTIPLE_TENANTS_WITH_MISSING_ASSIGNMENT:${missing.length}` };
  }

  const report = {
    generatedAtUtc: new Date().toISOString(),
    expectedSha,
    target: { databaseName: dbName, databaseId: dbId, stagingDatabaseIdBlocked: BLOCKED_STAGING_DB_ID },
    readOnly: true,
    writes: 0,
    activeTenantCount: tenants.length,
    tenants,
    missingAssignmentTenantId: missing.length === 1 ? missing[0].empresaId : null,
    profileDecision,
    verdict: {
      profileDecisionProven: profileDecision.proven,
      blocker: profileDecision.proven ? null : 'FRMS_PROFILE_DECISION_REQUIRES_EXPLICIT_BUSINESS_AUTHORIZATION',
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (profileDecision.proven) {
    console.log('FRMS_ASSIGNMENT_INVENTORY_PASS: single missing-assignment tenant with an unambiguous, tenant-scoped profile decision (read-only; no write performed).');
    process.exitCode = 0;
  } else {
    console.error(`FRMS_ASSIGNMENT_INVENTORY_INCONCLUSIVE: ${profileDecision.reason}. No assignment performed. No write performed.`);
    process.exitCode = 1;
  }
}

main();
