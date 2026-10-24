// source_reference: PR #1154 and scripts/production/reconcile-user-provisioning-from-plan-20261003.mjs.
// operational_decision: test the governed provisioning contract without embedding the external identity plan or production PII.
// dry_run_required: true; tests enforce that inspectPlan() remains structurally read-only.
// rollback_plan_required: production writes are permitted only after the executor captures the governed D1 Time Travel recovery point.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PATH = 'scripts/production/reconcile-user-provisioning-from-plan-20261003.mjs';
const body = readFileSync(PATH, 'utf8');

test('user provisioning reconciler keeps PII in an external plan and emits no concrete corporate address', () => {
  assert.match(body, /PLAN_MUST_BE_OUTSIDE_REPO/);
  assert.match(body, /CORPORATE_DOMAIN = 'voecostadosol\.com\.br'/);
  assert.doesNotMatch(body, /[A-Za-z0-9._%+-]+@voecostadosol\.com\.br/i);
});

test('dry-run is structurally read-only and apply is exact-plan/exact-candidate/exact-main guarded', () => {
  const inspectStart = body.indexOf('function inspectPlan()');
  const applyGuardStart = body.indexOf('function assertApplyGitState()');
  assert.ok(inspectStart >= 0 && applyGuardStart > inspectStart);
  const inspectBody = body.slice(inspectStart, applyGuardStart);
  assert.doesNotMatch(inspectBody, /runWrangler\s*\(/);
  assert.doesNotMatch(inspectBody, /auditSql\s*\(/);
  assert.doesNotMatch(inspectBody, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM|[A-Za-z_])/i);
  assert.match(body, /AIRTRUST_PRODUCTION_DRYRUN_USER_PROVISIONING_20261003/);
  assert.match(body, /AIRTRUST_PRODUCTION_APPLY_USER_PROVISIONING_20261003/);
  assert.match(body, /EXPECTED_SHA_REQUIRED/);
  assert.match(body, /PLAN_SHA_MISMATCH/);
  assert.match(body, /CANDIDATE_COUNT_MISMATCH/);
  assert.match(body, /CANDIDATE_HASH_MISMATCH/);
  assert.match(body, /APPLY_REQUIRES_MAIN_/);
  assert.match(body, /APPLY_REQUIRES_CLEAN_WORKTREE/);
  assert.match(body, /APPLY_SHA_MISMATCH/);
  assert.match(body, /MUTATING_PREFLIGHT_/);
  assert.match(body, /D1.*time-travel[\s\S]*info/i);
});

test('reconciliation preserves existing authority and creates missing users from reviewed profile intent', () => {
  assert.match(body, /EXISTING_USER_EMAIL_CONFLICT_/);
  assert.match(body, /EXISTING_USER_MEMBERSHIP_MISSING_/);
  assert.match(body, /RELINK_NOT_EXPLICIT_/);
  assert.match(body, /RELINK_OLD_EMPLOYEE_ACTIVE_/);
  assert.match(body, /SET funcionario_id=\$\{action\.employeeId\}/);
  assert.match(body, /AND funcionario_id=\$\{action\.fromEmployeeId\}/);
  assert.match(body, /normalizeCreateProfile/);
  assert.match(body, /\['ALUNO', 'GESTOR'\]/);
  assert.match(body, /profile === 'GESTOR' \? 'manager' : 'student'/);
  assert.match(body, /INSERT INTO usuarios \(email,password_hash,nome,perfil,funcionario_id,active,created_at,updated_at\)/);
  assert.match(body, /sqlText\(action\.profile\)/);
  assert.match(body, /sqlText\(action\.role\)/);
  assert.match(body, /INSERT INTO usuarios_empresas/);
  assert.match(body, /INSERT OR IGNORE INTO usuarios_empresas_perfis/);
  assert.match(body, /NOT EXISTS \(SELECT 1 FROM usuarios u WHERE u\.funcionario_id=f\.id OR LOWER\(TRIM\(u\.email\)\)=/);
});

test('GESTOR provisioning requires and reconciles all active operational sectors only in applyAction', () => {
  const applyStart = body.indexOf('function applyAction(action, state)');
  const executionStart = body.indexOf('const before = inspectPlan();');
  assert.ok(applyStart >= 0 && executionStart > applyStart);
  const applyBody = body.slice(applyStart, executionStart);
  assert.match(applyBody, /if \(action\.type === 'manager-sector'\)/);
  assert.match(applyBody, /INSERT INTO setores_gestores/);
  assert.match(body, /PLAN_GESTOR_ALL_SECTORS_REQUIRED_/);
  assert.match(body, /PLAN_ALL_SECTORS_REQUIRES_GESTOR_/);
  assert.match(body, /GESTOR_MEMBERSHIP_ROLE_MISMATCH_/);
  assert.match(body, /SELECT id FROM setores WHERE empresa_id=\$\{EMPRESA_ID\} AND ativo=1 AND deleted_at IS NULL/);
  assert.match(body, /manager-sector:/);
  assert.match(body, /INSERT INTO setores_gestores/);
  assert.match(body, /JOIN usuarios_empresas ue[\s\S]*LOWER\(TRIM\(ue\.role\)\)='manager'/);
  assert.match(body, /USER_PROVISION_MANAGER_SECTOR_20261003/);
});

test('explicit relink can govern transfer of a conflicting inactive source employee email', () => {
  assert.match(body, /employee-email-transfer:/);
  assert.match(body, /EMPLOYEE_EMAIL_OCCUPIED_/);
  assert.match(body, /employee_email_conflicts_/);
  assert.match(body, /type: 'employee-email-transfer'/);
  assert.match(body, /AND ativo<>1/);
  assert.match(body, /AND u\.funcionario_id=\$\{action\.fromEmployeeId\}/);
  assert.match(body, /USER_PROVISION_EMPLOYEE_EMAIL_RELEASE_20261003/);
  assert.match(body, /apply_email_transfer_relink_/);
});

test('employee email write is additive-only and administrative writes are audited', () => {
  assert.match(body, /UPDATE funcionarios[\s\S]*AND \(email IS NULL OR TRIM\(email\)=''\)/);
  assert.match(body, /USER_PROVISION_EMPLOYEE_EMAIL_20261003/);
  assert.match(body, /USER_PROVISION_RELINK_20261003/);
  assert.match(body, /USER_PROVISION_CREATE_\$\{action\.profile\}_20261003/);
  assert.match(body, /INSERT INTO audit_logs/);
});

test('initial password convention is applied in memory and never emitted in summary', () => {
  assert.match(body, /const initialPassword = `\$\{firstName\(item\.name\)\}123`/);
  assert.match(body, /PASSWORD_HASHER_UNAVAILABLE/);
  assert.match(body, /PASSWORD_HASHER_NOT_PREFLIGHTED/);
  assert.match(body, /bcryptForApply\.hashSync\(initialPassword, 10\)/);
  assert.match(body, /pii_emitted: false/);
  assert.doesNotMatch(body, /initialPassword[\s\S]{0,100}process\.stdout/);
});
