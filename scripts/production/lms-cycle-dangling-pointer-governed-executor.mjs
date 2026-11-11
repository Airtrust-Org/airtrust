#!/usr/bin/env node
// source_reference: finding F1 (tracking issue #776); planner lms-cycle-dangling-pointer-readonly-plan.mjs and lib/lms-cycle-dangling-pointer-batch.mjs
//   (pattern of qualification-cma-age-governed-executor.mjs, PR #2141/#2153/#2158).
// operational_decision: governed executor for the tenant-6 batch that sets lms_matricula_ciclos.qualificacao_historico_id to NULL when it points to a
//   soft-deleted qualificacoes_historico row (histories are never restored); DEFAULT IS DRY-RUN (reads only, writes blocked by the executor port).
// dry_run_required: --apply needs the exact plan hash, exact row count, SHA-pinned clean checkout, recovery-point attestation, actor and the apply confirmation env.
// rollback_plan_required: --emit-rollback writes the inverse-CAS manifest; run it with --direction=rollback (same gates, own hash).
//
// Usage (dry-run, no writes):
//   AIRTRUST_LMS_CYCLE_DANGLING_POINTER_EXECUTOR_CONFIRMATION=AIRTRUST_PRODUCTION_LMS_CYCLE_DANGLING_POINTER_EXECUTOR_DRY_RUN \
//   node scripts/production/lms-cycle-dangling-pointer-governed-executor.mjs \
//     --manifest=/abs/outside/repo/plan.json --expected-plan-hash=<sha256> --expected-count=<n>
// A production run additionally needs an owner authorization for the exact SHA/hash/count; this script alone never authorizes anything.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { wranglerExecutor } from './lib/executors.mjs';
import { buildRollbackManifest, executeManifest } from './lib/lms-cycle-dangling-pointer-batch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DRY_RUN_CONFIRMATION = 'AIRTRUST_PRODUCTION_LMS_CYCLE_DANGLING_POINTER_EXECUTOR_DRY_RUN';
export const APPLY_CONFIRMATION = 'AIRTRUST_PRODUCTION_LMS_CYCLE_DANGLING_POINTER_EXECUTOR_APPLY';
const fail = (code) => { throw new Error(code); };

export function parseArgs(argv) {
  const out = { apply: false, direction: 'forward' };
  const seen = new Set();
  for (const arg of argv) {
    if (arg === '--apply') { if (out.apply) fail('UNRECOGNIZED_OR_DUPLICATE_ARGUMENT'); out.apply = true; continue; }
    const m = /^--(manifest|expected-plan-hash|expected-count|direction|emit-rollback)=(.+)$/.exec(arg);
    if (!m || seen.has(m[1])) fail('UNRECOGNIZED_OR_DUPLICATE_ARGUMENT');
    seen.add(m[1]);
    out[m[1]] = m[2];
  }
  if (!out.manifest) fail('MANIFEST_REQUIRED');
  if (!['forward', 'rollback'].includes(out.direction)) fail('DIRECTION_INVALID');
  if (!/^[0-9a-f]{64}$/.test(out['expected-plan-hash'] ?? '')) fail('EXPECTED_PLAN_HASH_REQUIRED');
  if (!/^[1-9]\d{0,2}$/.test(out['expected-count'] ?? '')) fail('EXPECTED_COUNT_REQUIRED');
  if (out['emit-rollback'] && out.direction !== 'forward') fail('EMIT_ROLLBACK_ONLY_FORWARD');
  for (const key of ['manifest', 'emit-rollback']) {
    const value = out[key];
    if (value && (!path.isAbsolute(value) || value.startsWith(ROOT + path.sep))) fail('PATH_MUST_BE_ABSOLUTE_OUTSIDE_REPO');
  }
  return out;
}

function gitOutput(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

export function assertGates(args, env) {
  const expected = args.apply ? APPLY_CONFIRMATION : DRY_RUN_CONFIRMATION;
  if (env.AIRTRUST_LMS_CYCLE_DANGLING_POINTER_EXECUTOR_CONFIRMATION !== expected) fail('EXPLICIT_CONFIRMATION_REQUIRED');
  if (!args.apply) return {};
  if (env.AIRTRUST_LMS_CYCLE_DANGLING_POINTER_RECOVERY_READY !== 'yes') fail('RECOVERY_POINT_ATTESTATION_REQUIRED');
  if (!/^[A-Za-z0-9_.@-]{1,64}$/.test(env.AIRTRUST_LMS_CYCLE_DANGLING_POINTER_ACTOR ?? '')) fail('ACTOR_REQUIRED');
  const head = gitOutput(['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40}$/.test(env.EXPECTED_SOURCE_SHA ?? '') || env.EXPECTED_SOURCE_SHA !== head) fail('SOURCE_SHA_MISMATCH');
  if (gitOutput(['status', '--porcelain']) !== '') fail('DIRTY_WORKTREE');
  return { actor: env.AIRTRUST_LMS_CYCLE_DANGLING_POINTER_ACTOR, sourceSha: head };
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const gate = assertGates(args, process.env);
  const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'));
  const expectedPlanHash = args['expected-plan-hash'];
  const expectedCount = Number(args['expected-count']);
  const port = wranglerExecutor({
    database: 'airtrust-db', env: 'production', remote: true,
    allowWrites: args.apply, cwd: path.join(ROOT, 'worker-airtrust'),
  });
  if (args['emit-rollback']) {
    const rollback = buildRollbackManifest(manifest, { expectedPlanHash, expectedCount });
    writeFileSync(args['emit-rollback'], JSON.stringify(rollback, null, 2) + '\n',
      { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  }
  let report;
  try {
    report = executeManifest({
      port, manifest, direction: args.direction, apply: args.apply,
      expectedPlanHash, expectedCount, actor: gate.actor, sourceSha: gate.sourceSha,
    });
  } catch (error) {
    if (error?.report) report = { ...error.report, aborted: true };
    else throw error;
  }
  const reasons = {};
  for (const c of report.conflicts) reasons[c.reason] = (reasons[c.reason] || 0) + 1;
  const { conflicts, cas_conflicts: casConflicts, ...rest } = report;
  process.stdout.write(JSON.stringify({
    ...rest, conflict_count: conflicts.length, conflict_reasons: reasons,
    cas_conflict_count: casConflicts.length, pii_emitted: false,
  }, null, 2) + '\n');
  if (report.aborted || (args.apply && !report.postconditions_verified)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(); } catch (error) {
    console.error('LMS_CYCLE_DANGLING_POINTER_EXECUTOR_ERROR:' + (error instanceof Error ? error.message : 'UNKNOWN'));
    process.exitCode = 1;
  }
}
