#!/usr/bin/env node
// Read-only FRMS governance readiness gate.
//
// Mirrors the decision rules in worker-airtrust/src/lib/frms/frms-governance-readiness.ts
// (checkFrmsGovernanceReadiness) using raw SQL against the target D1 database, because
// this script runs outside the Worker's TS build. Keep both in sync if the schema or the
// resolution rules change.
//
// Contract: exits non-zero (blocks the caller) unless every tenant with FRMS activity has
// an ACTIVE assignment -> active regulatory profile -> ACTIVE revision, with a
// non-null model_version. This does NOT invent, seed, or modify any row — read-only.
import { spawnSync } from 'node:child_process';

const DB_NAME = process.env.FRMS_GOVERNANCE_D1_NAME;
const REMOTE = process.argv.includes('--remote');

if (!DB_NAME) {
  console.error('FRMS_GOVERNANCE_PREFLIGHT: FRMS_GOVERNANCE_D1_NAME env var is required (no default — never guess a target database).');
  process.exit(1);
}

function query(sql) {
  const args = ['wrangler', 'd1', 'execute', DB_NAME, '--json', '--command', sql];
  if (REMOTE) args.splice(3, 0, '--remote');
  const run = spawnSync('npx', args, {
    cwd: new URL('../worker-airtrust/', import.meta.url),
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    throw new Error(`FRMS_GOVERNANCE_PREFLIGHT_NOT_VERIFIABLE: ${run.stderr || run.stdout}`);
  }
  return JSON.parse(run.stdout)[0]?.results ?? [];
}

const today = new Date().toISOString().slice(0, 10);

// Tenants with any FRMS activity (jornadas) — no other tenant needs an FRMS profile yet.
const tenants = query(
  `SELECT DISTINCT p.empresa_id AS empresa_id
     FROM frms_jornada j
     JOIN funcionarios p ON p.id = CAST(j.tripulante_id AS INTEGER) AND p.deleted_at IS NULL
    WHERE j.deleted_at IS NULL AND p.empresa_id IS NOT NULL`,
).map((row) => row.empresa_id);

if (tenants.length === 0) {
  console.log('FRMS_GOVERNANCE_PREFLIGHT: no tenant has FRMS activity yet — nothing to gate. READY.');
  process.exit(0);
}

const results = tenants.map((empresaId) => {
  const assignments = query(
    `SELECT profile_code FROM frms_profile_assignments
      WHERE empresa_id = ${empresaId} AND status = 'ACTIVE'
        AND effective_from <= '${today}' AND (effective_to IS NULL OR effective_to >= '${today}')`,
  );
  if (assignments.length !== 1) {
    return { empresaId, ready: false, reason: assignments.length === 0 ? 'ASSIGNMENT_MISSING' : 'ASSIGNMENT_AMBIGUOUS' };
  }
  const profileCode = assignments[0].profile_code;

  const profiles = query(
    `SELECT id FROM frms_regulatory_profiles
      WHERE empresa_id = ${empresaId} AND profile_code = '${profileCode}' AND active = 1 AND deleted_at IS NULL
        AND effective_from <= '${today}' AND (effective_to IS NULL OR effective_to >= '${today}')`,
  );
  if (profiles.length !== 1) {
    return { empresaId, profileCode, ready: false, reason: profiles.length === 0 ? 'PROFILE_MISSING' : 'PROFILE_AMBIGUOUS' };
  }

  const revisions = query(
    `SELECT id, model_version FROM frms_config_revisions
      WHERE profile_code = '${profileCode}' AND status = 'ACTIVE'
        AND (empresa_id = ${empresaId} OR empresa_id IS NULL)
        AND effective_from <= '${today}' AND (effective_to IS NULL OR effective_to >= '${today}')`,
  );
  if (revisions.length !== 1) {
    return { empresaId, profileCode, ready: false, reason: revisions.length === 0 ? 'REVISION_MISSING' : 'REVISION_AMBIGUOUS' };
  }
  if (!revisions[0].model_version) {
    return { empresaId, profileCode, ready: false, reason: 'REVISION_MODEL_VERSION_MISSING' };
  }

  return { empresaId, profileCode, ready: true };
});

const notReady = results.filter((r) => !r.ready);
console.log(JSON.stringify({ checkedAt: today, tenants: results }, null, 2));

if (notReady.length > 0) {
  console.error(`FRMS_GOVERNANCE_PREFLIGHT: DEPLOY BLOCKED — ${notReady.length} tenant(s) not ready: ${notReady.map((r) => `empresa=${r.empresaId}:${r.reason}`).join(', ')}`);
  process.exit(1);
}

console.log('FRMS_GOVERNANCE_PREFLIGHT: all tenants with FRMS activity are READY.');
