#!/usr/bin/env node
// Safe, idempotent-aware provisioning runner for FRMS_HELICOPTER_OFFSHORE_BASELINE_V1.
//
// Reads first, decides via planFrmsHelicopterOffshoreProvisioning (see
// lib/frms-helicopter-offshore-provisioning.mjs), and only then writes —
// never blindly reapplies the raw seed SQL file (which is intentionally NOT
// idempotent: rerunning it fails on a UNIQUE constraint rather than silently
// duplicating).
//
// Usage (tsx, not plain node — this imports the .ts generator module):
//   npx tsx scripts/frms-seeds/apply-frms-helicopter-offshore-baseline-v1.mjs --db=<D1_NAME> [--remote] [--apply]
//
// Without --apply, this only reports the plan (dry run) — no write happens.
// This script alone does not constitute authorization to run it against any
// real environment; that authorization is a separate, explicit decision.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildGovernedParameterMap } from './generate-frms-helicopter-offshore-baseline-v1.ts';
import { planFrmsHelicopterOffshoreProvisioning, REVISION_ID } from './lib/frms-helicopter-offshore-provisioning.mjs';

const args = process.argv.slice(2);
const dbArg = args.find((a) => a.startsWith('--db='));
const remote = args.includes('--remote');
const apply = args.includes('--apply');

if (!dbArg) {
  console.error('Usage: --db=<D1_NAME> is required. No default — never guess a target database.');
  process.exit(1);
}
const dbName = dbArg.slice('--db='.length);
const workerDir = fileURLToPath(new URL('../../worker-airtrust/', import.meta.url));

function query(sql) {
  const cliArgs = ['wrangler', 'd1', 'execute', dbName, '--json', '--command', sql];
  if (remote) cliArgs.splice(3, 0, '--remote');
  const run = spawnSync('npx', cliArgs, { cwd: workerDir, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`Query failed: ${run.stderr || run.stdout}`);
  return JSON.parse(run.stdout)[0]?.results ?? [];
}

const existingRevisionRows = query(
  `SELECT id, status FROM frms_config_revisions WHERE id = '${REVISION_ID}';`,
);
const existingRevision = existingRevisionRows[0] ?? null;
const existingParameters = existingRevision
  ? query(`SELECT parameter_key, numeric_value, json_value FROM frms_config_parameters WHERE revision_id = '${REVISION_ID}';`)
  : [];

const desiredParameters = buildGovernedParameterMap();
const plan = planFrmsHelicopterOffshoreProvisioning(existingRevision, existingParameters, desiredParameters);

console.log(JSON.stringify({ dbName, remote, plan }, null, 2));

if (plan.decision === 'DIVERGENT') {
  console.error('FRMS_HELICOPTER_OFFSHORE_PROVISIONING: DIVERGENT — refusing to write. Resolve manually.');
  process.exit(1);
}
if (plan.decision === 'ALREADY_PROVISIONED_IDENTICAL') {
  console.log('FRMS_HELICOPTER_OFFSHORE_PROVISIONING: already provisioned identically — nothing to do.');
  process.exit(0);
}

console.log('FRMS_HELICOPTER_OFFSHORE_PROVISIONING: NOT_PROVISIONED — ready to apply.');
if (!apply) {
  console.log('Dry run only (pass --apply to actually write). No write performed.');
  process.exit(0);
}

const seedSql = readFileSync(fileURLToPath(new URL('frms_helicopter_offshore_baseline_v1.sql', import.meta.url)), 'utf8');
const applyArgs = ['wrangler', 'd1', 'execute', dbName, '--command', seedSql];
if (remote) applyArgs.splice(3, 0, '--remote');
const result = spawnSync('npx', applyArgs, { cwd: workerDir, encoding: 'utf8', stdio: 'inherit' });
process.exit(result.status ?? 1);
