// Governed Costa do Sol user provisioning/reconciliation from an external plan.
// The plan is intentionally kept outside Git because it contains employee identifiers/email PII.
// Dry-run is read-only. Apply is locked to exact plan SHA, candidate count/hash and exact clean main SHA.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKER_DIR = resolve(REPO_ROOT, 'worker-airtrust');
const requireFromWorker = createRequire(new URL('../../worker-airtrust/package.json', import.meta.url));
const bcrypt = requireFromWorker('bcryptjs');
const DB_NAME = 'airtrust-db';
const EMPRESA_ID = 6;
const CORPORATE_DOMAIN = 'voecostadosol.com.br';
const DRY_CONFIRM = 'AIRTRUST_PRODUCTION_DRYRUN_USER_PROVISIONING_20261003';
const APPLY_CONFIRM = 'AIRTRUST_PRODUCTION_APPLY_USER_PROVISIONING_20261003';
const mode = String(process.argv[2] || 'dry-run').trim();
const planArg = String(process.argv[3] || process.env.USER_PROVISION_PLAN || '').trim();

function fail(code) {
  console.error(`USER_PROVISION_RECONCILIATION_ERROR:${code}`);
  process.exit(1);
}

if (!['dry-run', 'apply'].includes(mode)) fail('INVALID_MODE');
if (!planArg) fail('PLAN_REQUIRED');
if ((process.env.USER_PROVISION_DB_NAME || DB_NAME) !== DB_NAME) fail('PRODUCTION_DB_TARGET_REJECTED');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hashStrings(values) {
  return sha256([...values].sort().join('\n'));
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0];
}

function assertExternalPlan(path) {
  const absolute = realpathSync(resolve(path));
  const rel = relative(REPO_ROOT, absolute);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) fail('PLAN_MUST_BE_OUTSIDE_REPO');
  return absolute;
}

const planPath = assertExternalPlan(planArg);
const planRaw = readFileSync(planPath);
const planSha = sha256(planRaw);
let plan;
try {
  plan = JSON.parse(planRaw.toString('utf8'));
} catch {
  fail('PLAN_JSON_INVALID');
}
if (!Array.isArray(plan) || plan.length === 0) fail('PLAN_EMPTY');

const seenEmployees = new Set();
const seenEmails = new Set();
for (const item of plan) {
  const employeeId = Number(item?.funcionario_id);
  const email = normalizeEmail(item?.email);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) fail('PLAN_EMPLOYEE_ID_INVALID');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`PLAN_EMAIL_INVALID_${employeeId}`);
  if (!email.endsWith(`@${CORPORATE_DOMAIN}`)) fail(`PLAN_EMAIL_DOMAIN_INVALID_${employeeId}`);
  if (seenEmployees.has(employeeId)) fail(`PLAN_EMPLOYEE_DUPLICATE_${employeeId}`);
  if (seenEmails.has(email)) fail('PLAN_EMAIL_DUPLICATE');
  seenEmployees.add(employeeId);
  seenEmails.add(email);

  const relinkUserId = item?.relink_user_id == null ? null : Number(item.relink_user_id);
  const relinkFromEmployeeId =
    item?.relink_from_funcionario_id == null ? null : Number(item.relink_from_funcionario_id);
  if ((relinkUserId == null) !== (relinkFromEmployeeId == null)) fail(`PLAN_RELINK_PAIR_REQUIRED_${employeeId}`);
  if (relinkUserId != null) {
    if (!Number.isSafeInteger(relinkUserId) || relinkUserId <= 0) fail(`PLAN_RELINK_USER_INVALID_${employeeId}`);
    if (!Number.isSafeInteger(relinkFromEmployeeId) || relinkFromEmployeeId <= 0) {
      fail(`PLAN_RELINK_EMPLOYEE_INVALID_${employeeId}`);
    }
    if (relinkFromEmployeeId === employeeId) fail(`PLAN_RELINK_SAME_EMPLOYEE_${employeeId}`);
  }
}

const confirmation = String(process.env.USER_PROVISION_CONFIRMATION || '');
if (mode === 'dry-run' && confirmation !== DRY_CONFIRM) fail('DRYRUN_CONFIRMATION_REQUIRED');
if (mode === 'apply' && confirmation !== APPLY_CONFIRM) fail('APPLY_CONFIRMATION_REQUIRED');

function run(command, args, { cwd = REPO_ROOT, label = command } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error(`COMMAND_FAILED:${label}:exit=${result.status ?? 'null'}`);
    if (result.stderr) process.stderr.write(result.stderr);
    fail('COMMAND_FAILED');
  }
  return result.stdout || '';
}

function runWrangler(sql, label) {
  const stdout = run(
    'npx',
    ['--no-install', 'wrangler', 'd1', 'execute', DB_NAME, '--env', 'production', '--remote', '--json', '--command', sql],
    { cwd: WORKER_DIR, label },
  );
  let payload;
  try {
    payload = JSON.parse(stdout || '[]');
  } catch {
    fail(`D1_JSON_INVALID_${label}`);
  }
  const envelopes = Array.isArray(payload) ? payload : [payload];
  if (!envelopes.length || envelopes.some((entry) => !entry || !Array.isArray(entry.results))) {
    fail(`D1_RESULTS_MISSING_${label}`);
  }
  return envelopes;
}

function select(sql, label) {
  const normalized = String(sql).trim().replace(/;+\s*$/, '');
  if (!/^(SELECT|WITH)\b/i.test(normalized)) fail(`NON_SELECT_${label}`);
  if (/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|VACUUM|ATTACH|DETACH|REINDEX)\b/i.test(normalized)) {
    fail(`MUTATING_PREFLIGHT_${label}`);
  }
  return runWrangler(normalized, label)[0].results;
}

function one(rows, code) {
  if (rows.length !== 1) fail(`${code}_COUNT_${rows.length}`);
  return rows[0];
}

function activeMembership(userId) {
  const rows = select(
    `SELECT id, role, is_primary
       FROM usuarios_empresas
      WHERE usuario_id=${userId}
        AND empresa_id=${EMPRESA_ID}`,
    `membership_${userId}`,
  );
  if (rows.length > 1) fail(`MEMBERSHIP_DUPLICATE_${userId}`);
  return rows[0] || null;
}

function inspectPlan() {
  const actions = [];
  const resolved = [];

  for (const item of plan) {
    const employeeId = Number(item.funcionario_id);
    const email = normalizeEmail(item.email);
    const employee = one(
      select(
        `SELECT id, nome, email, ativo, deleted_at
           FROM funcionarios
          WHERE id=${employeeId}
            AND empresa_id=${EMPRESA_ID}`,
        `employee_${employeeId}`,
      ),
      `EMPLOYEE_${employeeId}`,
    );
    if (Number(employee.ativo) !== 1 || employee.deleted_at != null) fail(`EMPLOYEE_NOT_ACTIVE_${employeeId}`);

    const currentEmployeeEmail = normalizeEmail(employee.email);
    if (!currentEmployeeEmail) {
      actions.push({ type: 'employee-email', employeeId, email });
    } else if (currentEmployeeEmail !== email) {
      fail(`EMPLOYEE_EMAIL_CONFLICT_${employeeId}`);
    }

    const employeeUsers = select(
      `SELECT id, email, perfil, active, deleted_at
         FROM usuarios
        WHERE funcionario_id=${employeeId}
        ORDER BY id`,
      `employee_users_${employeeId}`,
    );
    const activeEmployeeUsers = employeeUsers.filter((row) => row.deleted_at == null);
    if (activeEmployeeUsers.length > 1) fail(`EMPLOYEE_USER_DUPLICATE_${employeeId}`);

    let user = activeEmployeeUsers[0] || null;
    let relink = null;
    if (user) {
      if (normalizeEmail(user.email) !== email) fail(`EXISTING_USER_EMAIL_CONFLICT_${employeeId}`);
    } else {
      const emailUsers = select(
        `SELECT id, funcionario_id, email, perfil, active, deleted_at
           FROM usuarios
          WHERE LOWER(TRIM(email))=${sqlText(email)}
          ORDER BY id`,
        `email_users_${employeeId}`,
      );
      const activeEmailUsers = emailUsers.filter((row) => row.deleted_at == null);
      if (activeEmailUsers.length > 1) fail(`EMAIL_USER_DUPLICATE_${employeeId}`);
      if (activeEmailUsers.length === 1) {
        user = activeEmailUsers[0];
        const expectedUserId = item.relink_user_id == null ? null : Number(item.relink_user_id);
        const expectedOldEmployeeId =
          item.relink_from_funcionario_id == null ? null : Number(item.relink_from_funcionario_id);
        if (Number(user.funcionario_id) !== employeeId) {
          if (expectedUserId !== Number(user.id) || expectedOldEmployeeId !== Number(user.funcionario_id)) {
            fail(`RELINK_NOT_EXPLICIT_${employeeId}`);
          }
          const oldEmployee = one(
            select(
              `SELECT id, empresa_id, ativo, deleted_at
                 FROM funcionarios
                WHERE id=${expectedOldEmployeeId}`,
              `relink_old_employee_${employeeId}`,
            ),
            `RELINK_OLD_EMPLOYEE_${employeeId}`,
          );
          if (Number(oldEmployee.empresa_id) !== EMPRESA_ID) fail(`RELINK_CROSS_TENANT_${employeeId}`);
          if (Number(oldEmployee.ativo) === 1 && oldEmployee.deleted_at == null) fail(`RELINK_OLD_EMPLOYEE_ACTIVE_${employeeId}`);
          relink = { userId: Number(user.id), fromEmployeeId: expectedOldEmployeeId };
          actions.push({ type: 'relink-user', employeeId, userId: relink.userId, fromEmployeeId: relink.fromEmployeeId });
        }
      } else {
        const deletedEmailUsers = emailUsers.filter((row) => row.deleted_at != null);
        if (deletedEmailUsers.length) fail(`DELETED_USER_EMAIL_CONFLICT_${employeeId}`);
        actions.push({ type: 'create-user', employeeId, email });
      }
    }

    if (user && !relink) {
      const membership = activeMembership(Number(user.id));
      if (!membership) fail(`EXISTING_USER_MEMBERSHIP_MISSING_${employeeId}`);
    } else if (relink) {
      const membership = activeMembership(relink.userId);
      if (!membership) fail(`RELINK_USER_MEMBERSHIP_MISSING_${employeeId}`);
    }

    resolved.push({
      employeeId,
      email,
      name: String(employee.nome || ''),
      existingUserId: user ? Number(user.id) : null,
      relink,
    });
  }

  const signatures = actions.map((action) => {
    if (action.type === 'employee-email') return `employee-email:${action.employeeId}:${action.email}`;
    if (action.type === 'create-user') return `create-user:${action.employeeId}:${action.email}`;
    return `relink-user:${action.userId}:${action.fromEmployeeId}->${action.employeeId}`;
  });

  return {
    actions,
    resolved,
    candidateCount: signatures.length,
    candidateHash: hashStrings(signatures),
  };
}

function assertApplyGitState() {
  const branch = run('git', ['branch', '--show-current'], { label: 'git_branch' }).trim();
  if (branch !== 'main') fail(`APPLY_REQUIRES_MAIN_${branch || 'detached'}`);
  const porcelain = run('git', ['status', '--porcelain'], { label: 'git_status' }).trim();
  if (porcelain) fail('APPLY_REQUIRES_CLEAN_WORKTREE');
  run('git', ['fetch', '--prune', 'origin', 'main'], { label: 'git_fetch_main' });
  const head = run('git', ['rev-parse', 'HEAD'], { label: 'git_head' }).trim();
  const originMain = run('git', ['rev-parse', 'origin/main'], { label: 'git_origin_main' }).trim();
  const expected = String(process.env.USER_PROVISION_EXPECTED_SHA || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expected)) fail('EXPECTED_SHA_REQUIRED');
  if (head !== originMain || head !== expected) fail('APPLY_SHA_MISMATCH');
  return head;
}

function captureRecoveryPoint() {
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  run(
    'npx',
    ['--no-install', 'wrangler', 'd1', 'time-travel', 'info', DB_NAME, '--env', 'production', `--timestamp=${stamp}`, '--json'],
    { cwd: WORKER_DIR, label: 'd1_time_travel_recovery_point' },
  );
  return stamp;
}

function auditSql(employeeId, action) {
  return `INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
          VALUES (NULL,${sqlText(action)},'funcionarios',${employeeId},NULL,'{"governed":true}',${EMPRESA_ID},datetime('now'));`;
}

function applyAction(action, state) {
  const item = state.resolved.find((row) => row.employeeId === action.employeeId);
  if (!item) fail(`RESOLVED_ITEM_MISSING_${action.employeeId}`);

  if (action.type === 'employee-email') {
    runWrangler(
      `UPDATE funcionarios
          SET email=${sqlText(action.email)}, updated_at=datetime('now')
        WHERE id=${action.employeeId}
          AND empresa_id=${EMPRESA_ID}
          AND deleted_at IS NULL
          AND ativo=1
          AND (email IS NULL OR TRIM(email)='');
       ${auditSql(action.employeeId, 'USER_PROVISION_EMPLOYEE_EMAIL_20261003')}`,
      `apply_employee_email_${action.employeeId}`,
    );
    return;
  }

  if (action.type === 'relink-user') {
    runWrangler(
      `UPDATE usuarios
          SET funcionario_id=${action.employeeId}, updated_at=datetime('now')
        WHERE id=${action.userId}
          AND funcionario_id=${action.fromEmployeeId}
          AND deleted_at IS NULL;
       ${auditSql(action.employeeId, 'USER_PROVISION_RELINK_20261003')}`,
      `apply_relink_${action.employeeId}`,
    );
    return;
  }

  if (action.type === 'create-user') {
    const initialPassword = `${firstName(item.name)}123`;
    if (!firstName(item.name)) fail(`EMPLOYEE_NAME_INVALID_${action.employeeId}`);
    const passwordHash = bcrypt.hashSync(initialPassword, 10);
    runWrangler(
      `INSERT INTO usuarios (email,password_hash,nome,perfil,funcionario_id,active,created_at,updated_at)
       SELECT ${sqlText(action.email)},${sqlText(passwordHash)},f.nome,'ALUNO',f.id,1,datetime('now'),datetime('now')
         FROM funcionarios f
        WHERE f.id=${action.employeeId}
          AND f.empresa_id=${EMPRESA_ID}
          AND f.ativo=1
          AND f.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.funcionario_id=f.id OR LOWER(TRIM(u.email))=${sqlText(action.email)});
       INSERT INTO usuarios_empresas (usuario_id,empresa_id,is_primary,role,created_at)
       SELECT u.id,${EMPRESA_ID},1,'ALUNO',datetime('now')
         FROM usuarios u
        WHERE u.funcionario_id=${action.employeeId}
          AND LOWER(TRIM(u.email))=${sqlText(action.email)}
          AND u.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id=u.id AND ue.empresa_id=${EMPRESA_ID});
       INSERT OR IGNORE INTO usuarios_empresas_perfis (usuario_id,empresa_id,perfil,ativo,created_at,updated_at)
       SELECT u.id,${EMPRESA_ID},'ALUNO',1,datetime('now'),datetime('now')
         FROM usuarios u
        WHERE u.funcionario_id=${action.employeeId}
          AND LOWER(TRIM(u.email))=${sqlText(action.email)}
          AND u.deleted_at IS NULL;
       ${auditSql(action.employeeId, 'USER_PROVISION_CREATE_ALUNO_20261003')}`,
      `apply_create_user_${action.employeeId}`,
    );
  }
}

const before = inspectPlan();
const actionCounts = Object.fromEntries(
  ['employee-email', 'create-user', 'relink-user'].map((type) => [
    type,
    before.actions.filter((action) => action.type === type).length,
  ]),
);
const sourceSha = run('git', ['rev-parse', 'HEAD'], { label: 'git_head_readonly' }).trim();
const summary = {
  mode,
  source_sha: sourceSha,
  empresa_id: EMPRESA_ID,
  plan_rows: plan.length,
  plan_sha256: planSha,
  candidate_count: before.candidateCount,
  candidate_hash: before.candidateHash,
  action_counts: actionCounts,
  mutation_executed: false,
  postconditions_verified: false,
  pii_emitted: false,
};

if (mode === 'dry-run') {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(0);
}

const expectedPlanSha = String(process.env.USER_PROVISION_EXPECTED_PLAN_SHA || '').trim().toLowerCase();
const expectedCount = Number(process.env.USER_PROVISION_EXPECTED_COUNT || -1);
const expectedHash = String(process.env.USER_PROVISION_EXPECTED_HASH || '').trim().toLowerCase();
if (!/^[0-9a-f]{64}$/.test(expectedPlanSha) || expectedPlanSha !== planSha) fail('PLAN_SHA_MISMATCH');
if (!Number.isInteger(expectedCount) || expectedCount < 0 || expectedCount !== before.candidateCount) fail('CANDIDATE_COUNT_MISMATCH');
if (!/^[0-9a-f]{64}$/.test(expectedHash) || expectedHash !== before.candidateHash) fail('CANDIDATE_HASH_MISMATCH');
const applySha = assertApplyGitState();
const recoveryPoint = captureRecoveryPoint();

for (const action of before.actions.filter((entry) => entry.type === 'employee-email')) applyAction(action, before);
for (const action of before.actions.filter((entry) => entry.type === 'relink-user')) applyAction(action, before);
for (const action of before.actions.filter((entry) => entry.type === 'create-user')) applyAction(action, before);

const after = inspectPlan();
if (after.candidateCount !== 0) fail(`POSTCONDITIONS_PENDING_${after.candidateCount}`);

Object.assign(summary, {
  source_sha: applySha,
  recovery_point_utc: recoveryPoint,
  mutation_executed: before.candidateCount > 0,
  postconditions_verified: true,
  post_candidate_count: after.candidateCount,
  post_candidate_hash: after.candidateHash,
});
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
