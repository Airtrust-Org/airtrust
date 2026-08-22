#!/usr/bin/env node
// Read-only FRMS governance readiness gate.
//
// Mirrors the decision rules in worker-airtrust/src/lib/frms/frms-governance-readiness.ts
// (checkFrmsGovernanceReadiness) using raw SQL against the target D1 database, because
// this script runs outside the Worker's TS build. Keep both in sync if the schema or the
// resolution rules change.
//
// Contract: whether this guard is REQUIRED is derived from the release itself (does this
// SHA's migration set include the FRMS governance migration?), never from an opt-in env
// var — see scripts/lib/frms-governance-preflight-contract.mjs. A governed SHA with an
// unresolvable D1 or a failed query FAILS CLOSED; it is never treated as "skip".
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  releaseContainsFrmsGovernance,
  resolveProductionD1Name,
  evaluateFrmsGovernancePreflight,
} from './lib/frms-governance-preflight-contract.mjs';

const ROOT = new URL('../', import.meta.url);
const WORKER_DIR = new URL('worker-airtrust/', ROOT);
const REMOTE = process.argv.includes('--remote');

const migrationFilenames = readdirSync(fileURLToPath(new URL('migrations/', WORKER_DIR)));
const required = releaseContainsFrmsGovernance(migrationFilenames);

if (!required) {
  console.log('FRMS_GOVERNANCE_PREFLIGHT: SKIPPED — this SHA does not include FRMS parameter governance.');
  process.exit(0);
}

function query(dbName, sql) {
  const args = ['wrangler', 'd1', 'execute', dbName, '--json', '--command', sql];
  if (REMOTE) args.splice(3, 0, '--remote');
  const run = spawnSync('npx', args, { cwd: fileURLToPath(WORKER_DIR), encoding: 'utf8' });
  if (run.status !== 0) {
    throw new Error(`FRMS_GOVERNANCE_PREFLIGHT_NOT_VERIFIABLE: ${run.stderr || run.stdout}`);
  }
  return JSON.parse(run.stdout)[0]?.results ?? [];
}

let tenantResults;
try {
  const wranglerToml = readFileSync(fileURLToPath(new URL('wrangler.toml', WORKER_DIR)), 'utf8');
  const dbName = resolveProductionD1Name(wranglerToml, process.env.FRMS_GOVERNANCE_D1_NAME);
  const today = new Date().toISOString().slice(0, 10);

  const tenants = query(
    dbName,
    `SELECT DISTINCT p.empresa_id AS empresa_id
       FROM frms_jornada j
       JOIN funcionarios p ON p.id = CAST(j.tripulante_id AS INTEGER) AND p.deleted_at IS NULL
      WHERE j.deleted_at IS NULL AND p.empresa_id IS NOT NULL`,
  ).map((row) => row.empresa_id);

  tenantResults = tenants.map((empresaId) => {
    const assignments = query(
      dbName,
      `SELECT profile_code FROM frms_profile_assignments
        WHERE empresa_id = ${empresaId} AND status = 'ACTIVE'
          AND effective_from <= '${today}' AND (effective_to IS NULL OR effective_to >= '${today}')`,
    );
    if (assignments.length !== 1) {
      return { empresaId, ready: false, reason: assignments.length === 0 ? 'ASSIGNMENT_MISSING' : 'ASSIGNMENT_AMBIGUOUS' };
    }
    const profileCode = assignments[0].profile_code;

    const profiles = query(
      dbName,
      `SELECT id FROM frms_regulatory_profiles
        WHERE empresa_id = ${empresaId} AND profile_code = '${profileCode}' AND active = 1 AND deleted_at IS NULL
          AND effective_from <= '${today}' AND (effective_to IS NULL OR effective_to >= '${today}')`,
    );
    if (profiles.length !== 1) {
      return { empresaId, profileCode, ready: false, reason: profiles.length === 0 ? 'PROFILE_MISSING' : 'PROFILE_AMBIGUOUS' };
    }

    const revisions = query(
      dbName,
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
} catch (error) {
  console.error(`FRMS_GOVERNANCE_PREFLIGHT: could not determine readiness — ${error.message}`);
  tenantResults = undefined;
}

const verdict = evaluateFrmsGovernancePreflight({ required, tenantResults });
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), verdict, tenantResults }, null, 2));

if (verdict.status === 'FAIL') {
  console.error(`FRMS_GOVERNANCE_PREFLIGHT: DEPLOY BLOCKED — ${verdict.reason}`);
  process.exit(1);
}

console.log(`FRMS_GOVERNANCE_PREFLIGHT: ${verdict.status} — ${verdict.reason}`);
