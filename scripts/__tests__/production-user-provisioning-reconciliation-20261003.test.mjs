import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PATH = 'scripts/production/reconcile-user-provisioning-from-plan-20261003.mjs';
const body = readFileSync(PATH, 'utf8');

test('user provisioning reconciler keeps PII in an external plan and emits no concrete corporate address', () => {
  assert.match(body, /PLAN_MUST_BE_OUTSIDE_REPO/);
  assert.match(body, /CORPORATE_DOMAIN = 'voecostadosol\.com\.br'/);
  assert.doesNotMatch(body, /[A-Za-z0-9._%+-]+@voecostadosol\.com\.br/i);
  assert.doesNotMatch(body, /Alessandro|Daniel Alonso|Elzo|João Marcelo|Jorge Abadia|Mauricio Castelo|Mikhail|Renata Miguez|Ricardo Fontes|Rodrigo Vieiralves|Rogerio Affonso|Yuri Azevedo/i);
});

test('dry-run is read-only and apply is exact-plan/exact-candidate/exact-main guarded', () => {
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

test('reconciliation preserves existing authority and only creates missing ALUNO users', () => {
  assert.match(body, /EXISTING_USER_EMAIL_CONFLICT_/);
  assert.match(body, /EXISTING_USER_MEMBERSHIP_MISSING_/);
  assert.match(body, /RELINK_NOT_EXPLICIT_/);
  assert.match(body, /RELINK_OLD_EMPLOYEE_ACTIVE_/);
  assert.match(body, /SET funcionario_id=\$\{action\.employeeId\}/);
  assert.match(body, /AND funcionario_id=\$\{action\.fromEmployeeId\}/);
  assert.match(body, /INSERT INTO usuarios \(email,password_hash,nome,perfil,funcionario_id,active,created_at,updated_at\)/);
  assert.match(body, /'ALUNO'/);
  assert.match(body, /INSERT INTO usuarios_empresas/);
  assert.match(body, /INSERT OR IGNORE INTO usuarios_empresas_perfis/);
  assert.match(body, /NOT EXISTS \(SELECT 1 FROM usuarios u WHERE u\.funcionario_id=f\.id OR LOWER\(TRIM\(u\.email\)\)=/);
  assert.doesNotMatch(body, /\bDELETE\b/i);
});

test('employee email write is additive-only and administrative writes are audited', () => {
  assert.match(body, /UPDATE funcionarios[\s\S]*AND \(email IS NULL OR TRIM\(email\)=''\)/);
  assert.match(body, /USER_PROVISION_EMPLOYEE_EMAIL_20261003/);
  assert.match(body, /USER_PROVISION_RELINK_20261003/);
  assert.match(body, /USER_PROVISION_CREATE_ALUNO_20261003/);
  assert.match(body, /INSERT INTO audit_logs/);
});

test('initial password convention is applied in memory and never emitted in summary', () => {
  assert.match(body, /const initialPassword = `\$\{firstName\(item\.name\)\}123`/);
  assert.match(body, /bcrypt\.hashSync\(initialPassword, 10\)/);
  assert.match(body, /pii_emitted: false/);
  assert.doesNotMatch(body, /initialPassword[\s\S]{0,100}process\.stdout/);
});
