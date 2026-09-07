#!/usr/bin/env node

// source_reference: production-release-readonly-preflight (runs 34169522648 /
//   34170340062) reported FRMS_GOVERNANCE_NOT_READY — 1 of 2 active FRMS
//   tenants has ASSIGNMENT_MISSING (no governed frms_profile_assignments row).
//   That preflight's sanitized report omits empresa_id. This inventory
//   identifies, READ-ONLY, exactly which active tenant lacks a governed
//   assignment and enumerates that tenant's own applicable regulatory profiles
//   so a profile decision can be made without inference.
// operational_decision: READ-ONLY production D1 inventory via the Cloudflare
//   D1 REST API (same transport as scripts/production/release-readonly-preflight.mjs
//   — no CLI, no toml config parsing). Only SELECT / PRAGMA table_info,
//   each validated against a mutating-SQL denylist before it is sent. Never a
//   migration, Schema V2 apply, deploy or write. Production D1 id is
//   hard-pinned; the staging and dev D1 ids are hard-blocked. No PII: only
//   empresa_id and technical FRMS governance fields are returned (never names,
//   emails, documents or tokens).
// dry_run_required: not applicable — no side effects.
// rollback_plan_required: not applicable — read-only.

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
  if (text.replace(/;\s*$/, '').includes(';')) fail(`MULTI_STATEMENT_SQL_BLOCKED: ${text}`);
}

function assertProductionTarget(id) {
  const i = String(id || '').trim();
  if (i === BLOCKED_STAGING_DB_ID || i === BLOCKED_DEV_DB_ID) fail(`TARGET_IS_NON_PRODUCTION_BLOCKED: ${i}`);
  if (i !== PRODUCTION_DB_ID) fail(`TARGET_NOT_PRODUCTION: got ${i}, expected ${PRODUCTION_DB_ID}`);
}

async function query(sql) {
  assertReadOnlySql(sql);
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${PRODUCTION_DB_ID}/query`;
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

function scalar(rows) {
  const row = rows[0] || {};
  return Number(row[Object.keys(row)[0]] ?? 0);
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN) fail('PRODUCTION_D1_READ_TOKEN_MISSING');
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) fail('CLOUDFLARE_ACCOUNT_ID_MISSING');

  const dbId = String(process.env.PRODUCTION_D1_ID || PRODUCTION_DB_ID);
  assertProductionTarget(dbId);

  const expectedSha = String(process.env.EXPECTED_SHA || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) fail('EXPECTED_SHA_INVALID');

  const today = new Date().toISOString().slice(0, 10);

  // Active FRMS tenants — same definition the release preflight uses.
  const tenantIds = (
    await query(
      `SELECT DISTINCT f.empresa_id AS empresa_id FROM frms_jornada j ` +
        `JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER) AND f.deleted_at IS NULL ` +
        `WHERE j.deleted_at IS NULL AND f.empresa_id IS NOT NULL ORDER BY f.empresa_id`,
    )
  ).map((r) => Number(r.empresa_id));

  const tenants = [];
  for (const empresaId of tenantIds) {
    const activeAssignments = await query(
      `SELECT regulatory_profile_id, profile_code FROM frms_profile_assignments ` +
        `WHERE empresa_id = ${empresaId} AND status = 'ACTIVE' ` +
        `AND effective_from <= '${today}' AND (effective_to IS NULL OR effective_to >= '${today}') ` +
        `ORDER BY profile_code`,
    );
    const activeRegulatoryProfiles = await query(
      `SELECT id, profile_code, service_category FROM frms_regulatory_profiles ` +
        `WHERE empresa_id = ${empresaId} AND active = 1 AND deleted_at IS NULL ` +
        `AND effective_from <= '${today}' AND (effective_to IS NULL OR effective_to >= '${today}') ` +
        `ORDER BY profile_code, id`,
    );

    let resolvedRevision = null;
    let resolvedParameterCount = null;
    if (activeRegulatoryProfiles.length === 1) {
      const profileCode = activeRegulatoryProfiles[0].profile_code;
      const revisions = await query(
        `SELECT id, revision_number, model_version, policy_version, effective_from, empresa_id FROM frms_config_revisions ` +
          `WHERE profile_code = '${profileCode}' AND status = 'ACTIVE' ` +
          `AND (empresa_id = ${empresaId} OR empresa_id IS NULL) ` +
          `AND effective_from <= '${today}' AND (effective_to IS NULL OR effective_to >= '${today}') ` +
          `ORDER BY CASE WHEN empresa_id = ${empresaId} THEN 0 ELSE 1 END, revision_number DESC, effective_from DESC`,
      );
      if (revisions.length >= 1) {
        const rev = revisions[0];
        resolvedRevision = {
          id: rev.id,
          revisionNumber: rev.revision_number,
          modelVersion: rev.model_version,
          tenantScoped: rev.empresa_id != null && Number(rev.empresa_id) === empresaId,
          ambiguous: revisions.length > 1,
        };
        resolvedParameterCount = scalar(
          await query(`SELECT COUNT(*) AS c FROM frms_config_parameters WHERE revision_id = '${rev.id}'`),
        );
      }
    }

    tenants.push({
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
    });
  }

  const missing = tenants.filter((t) => t.assignmentState === 'ASSIGNMENT_MISSING');

  // Profile decision — proven ONLY from the tenant's own data: exactly one
  // applicable active regulatory profile and an unambiguous active governed
  // revision. Never LEGACY_GENERAL / HELICOPTER_OFFSHORE / another tenant /
  // heuristic as a default.
  let profileDecision;
  if (missing.length !== 1) {
    profileDecision = {
      proven: false,
      reason:
        missing.length === 0
          ? 'NO_TENANT_WITH_MISSING_ASSIGNMENT'
          : `MULTIPLE_TENANTS_WITH_MISSING_ASSIGNMENT:${missing.length}`,
    };
  } else {
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
  }

  const report = {
    generatedAtUtc: new Date().toISOString(),
    expectedSha,
    target: { databaseId: dbId, stagingDatabaseIdBlocked: BLOCKED_STAGING_DB_ID },
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

main().catch((error) => {
  console.error(`[frms-assignment-readonly-inventory][ERROR] ${String(error?.message || error)}`);
  process.exitCode = 1;
});
