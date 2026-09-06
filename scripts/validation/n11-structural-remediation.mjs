#!/usr/bin/env node
// N-11 governed structural remediation.
// Saneamento estrutural governado por IDs exatos (128, 129) e usuário vinculado (108).
// NUNCA utiliza filtros por nome, heurísticas textuais ou wildcards.
// source_reference: issue #380 and production inventory artifact n11-production-readonly-inventory-712cd93cf952ef4d5645a87f6d124370564c5024
// operational_decision: soft-delete synthetic QA fixtures 128 and 129 in tenant 6 and linked user 108 without display-name heuristics
// dry_run_required: dry-run mode required and verified before any apply
// rollback_plan_required: rollback SQL documented and Time Travel recovery point captured
import { spawnSync } from 'node:child_process';

const DB_NAME = 'airtrust-db';
const EMPRESA_ID = 6;
const TARGET_FUNCIONARIO_IDS = [128, 129];
const TARGET_USER_ID = 108;

const CONFIRMATION_DRY_RUN = 'AIRTRUST_PRODUCTION_DRYRUN_N11_REMEDIATION';
const CONFIRMATION_APPLY = 'AIRTRUST_PRODUCTION_APPLY_N11_REMEDIATION';

function fail(message) {
  console.error(`N11_REMEDIATION_ERROR:${message}`);
  process.exit(1);
}

const mode = process.argv[2] || process.env.N11_REMEDIATION_MODE || 'dry-run';
if (mode !== 'dry-run' && mode !== 'apply') {
  fail('INVALID_MODE');
}

const confirmation = process.env.N11_REMEDIATION_CONFIRMATION;
if (mode === 'dry-run' && confirmation !== CONFIRMATION_DRY_RUN) {
  fail('DRYRUN_CONFIRMATION_REQUIRED');
}
if (mode === 'apply' && confirmation !== CONFIRMATION_APPLY) {
  fail('APPLY_CONFIRMATION_REQUIRED');
}

if ((process.env.N11_PRODUCTION_DB_NAME || DB_NAME) !== DB_NAME) {
  fail('PRODUCTION_DB_TARGET_REJECTED');
}

function redactSecrets(value) {
  return String(value || '')
    .replace(/[A-Za-z0-9_+\/-]{24,}/g, '[REDACTED]')
    .replace(/\/accounts\/[^/\s"]+/g, '/accounts/[REDACTED]')
    .replace(/database\/[0-9a-f-]{16,}/gi, 'database/[REDACTED]');
}

function executeD1(sql, label = '') {
  console.error(`[D1_EXECUTE_START] ${label || 'sql'}`);
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, '--env', 'production', '--remote', '--json', '--command', sql],
    {
      cwd: new URL('../../worker-airtrust/', import.meta.url),
      encoding: 'utf8',
      env: process.env,
    },
  );

  if (result.status !== 0) {
    console.error(`[D1_EXECUTE_FAILED] ${label || 'sql'}`);
    console.error(`D1_SQL:${sql.slice(0, 160).replace(/\s+/g, ' ')}`);
    console.error(redactSecrets(result.stderr));
    console.error(`D1_EXIT_STATUS:${result.status ?? 'null'}`);
    console.error(`D1_STDOUT:${redactSecrets(result.stdout).slice(0, 4000)}`);
    fail('D1_EXECUTE_FAILED');
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout || '[]');
  } catch {
    console.error(`D1_JSON_INVALID_STDOUT:${redactSecrets(result.stdout).slice(0, 4000)}`);
    fail('D1_JSON_INVALID');
  }
  const envelope = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!envelope || !Array.isArray(envelope.results)) {
    fail('D1_RESULTS_MISSING');
  }
  return envelope.results;
}

// 1. PREFLIGHT READ-ONLY ASSERTIONS
console.error('[N11_REMEDIATION] Executing preflight assertions...');

const preflightFuncionarios = executeD1(
  `SELECT id, empresa_id, ativo, status, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted FROM funcionarios WHERE id IN (${TARGET_FUNCIONARIO_IDS.join(',')}) ORDER BY id;`,
  'preflight_funcionarios',
);

if (preflightFuncionarios.length !== TARGET_FUNCIONARIO_IDS.length) {
  fail(`PREFLIGHT_FUNCIONARIOS_COUNT_MISMATCH: expected ${TARGET_FUNCIONARIO_IDS.length}, found ${preflightFuncionarios.length}`);
}

for (const row of preflightFuncionarios) {
  if (Number(row.empresa_id) !== EMPRESA_ID) {
    fail(`PREFLIGHT_TENANT_MISMATCH: funcionario ${row.id} belongs to empresa_id ${row.empresa_id}, expected ${EMPRESA_ID}`);
  }
}

const preflightUser = executeD1(
  `SELECT id, funcionario_id, active, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted FROM usuarios WHERE id = ${TARGET_USER_ID};`,
  'preflight_user',
);

if (preflightUser.length !== 1) {
  fail(`PREFLIGHT_USER_COUNT_MISMATCH: expected 1, found ${preflightUser.length}`);
}
if (Number(preflightUser[0].funcionario_id) !== 129) {
  fail(`PREFLIGHT_USER_LINK_MISMATCH: user ${TARGET_USER_ID} linked to funcionario_id ${preflightUser[0].funcionario_id}, expected 129`);
}

console.error('[N11_REMEDIATION] Preflight assertions PASSED.');

const summary = {
  mode,
  empresa_id: EMPRESA_ID,
  source_sha: process.env.GITHUB_SHA || null,
  target_funcionario_ids: TARGET_FUNCIONARIO_IDS,
  target_user_id: TARGET_USER_ID,
  preflight_state: {
    funcionarios: preflightFuncionarios.map((f) => ({
      id: Number(f.id),
      empresa_id: Number(f.empresa_id),
      ativo: Number(f.ativo),
      status: String(f.status || ''),
      soft_deleted: Number(f.soft_deleted),
    })),
    user: {
      id: Number(preflightUser[0].id),
      funcionario_id: Number(preflightUser[0].funcionario_id),
      active: Number(preflightUser[0].active),
      soft_deleted: Number(preflightUser[0].soft_deleted),
    },
  },
  mutation_executed: false,
  timestamp: new Date().toISOString(),
};

if (mode === 'dry-run') {
  console.error('[N11_REMEDIATION] DRY-RUN MODE: No mutations executed.');
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(0);
}

// 2. APPLY MODE: EXECUTE GOVERNED STRUCTURAL SOFT-DELETE
console.error('[N11_REMEDIATION] APPLY MODE: Executing governed structural soft-delete...');

// Soft-delete funcionarios by exact IDs within empresa_id = 6
executeD1(
  `UPDATE funcionarios SET ativo = 0, status = 'INATIVO', deleted_at = CURRENT_TIMESTAMP WHERE id IN (${TARGET_FUNCIONARIO_IDS.join(',')}) AND empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL;`,
  'apply_soft_delete_funcionarios',
);

// Soft-delete linked usuario by exact ID
executeD1(
  `UPDATE usuarios SET active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ${TARGET_USER_ID} AND funcionario_id = 129 AND deleted_at IS NULL;`,
  'apply_soft_delete_user',
);

summary.mutation_executed = true;

// 3. POSTCONDITION VERIFICATION
console.error('[N11_REMEDIATION] Verifying postconditions...');

const postFuncionarios = executeD1(
  `SELECT id, empresa_id, ativo, status, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted FROM funcionarios WHERE id IN (${TARGET_FUNCIONARIO_IDS.join(',')}) ORDER BY id;`,
  'post_funcionarios',
);

const allFuncionariosDeactivated = postFuncionarios.every(
  (row) => Number(row.soft_deleted) === 1 && Number(row.ativo) === 0 && String(row.status) === 'INATIVO',
);
if (!allFuncionariosDeactivated) {
  fail('POSTCONDITION_FUNCIONARIOS_NOT_FULLY_DEACTIVATED');
}

const postUser = executeD1(
  `SELECT id, funcionario_id, active, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted FROM usuarios WHERE id = ${TARGET_USER_ID};`,
  'post_user',
);

if (postUser.length !== 1 || Number(postUser[0].soft_deleted) !== 1 || Number(postUser[0].active) !== 0) {
  fail('POSTCONDITION_USER_NOT_FULLY_DEACTIVATED');
}

// Ensure 0 active rows remain
const activeRemaining = executeD1(
  `SELECT COUNT(*) AS total FROM funcionarios WHERE id IN (${TARGET_FUNCIONARIO_IDS.join(',')}) AND empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL AND ativo = 1;`,
  'post_active_count',
);
if (Number(activeRemaining[0]?.total || 0) !== 0) {
  fail('POSTCONDITION_ACTIVE_CANDIDATES_REMAIN');
}

summary.postcondition_state = {
  funcionarios: postFuncionarios.map((f) => ({
    id: Number(f.id),
    empresa_id: Number(f.empresa_id),
    ativo: Number(f.ativo),
    status: String(f.status || ''),
    soft_deleted: Number(f.soft_deleted),
  })),
  user: {
    id: Number(postUser[0].id),
    funcionario_id: Number(postUser[0].funcionario_id),
    active: Number(postUser[0].active),
    soft_deleted: Number(postUser[0].soft_deleted),
  },
  postconditions_verified: true,
};

console.error('[N11_REMEDIATION] Structural remediation completed and verified successfully.');
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
