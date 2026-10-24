// source_reference: scripts/staging/provision-frms-ux-identity.mjs and the
//   staging synthetic tenant 999013 reviewed fixture contract.
// operational_decision: test only the fixed-scope generated DML and guards;
//   these tests never run SQL or access remote staging/production databases.
// dry_run_required: this is a pure offline node:test suite without DB writes.
// rollback_plan_required: asserts the provisioner's scoped disabling SQL; no
//   live rollback or other mutation is executed by these unit tests.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  DB_NAME, DB_ID, TENANT_ID, QA_EMAIL, QA_EMPLOYEE_CODE,
  CONFIRM, buildProvisionSql, buildRollbackSql,
} from '../staging/provision-frms-ux-identity.mjs';

test('identity is pinned to isolated staging D1, tenant and synthetic crew', () => {
  assert.equal(DB_NAME, 'airtrust-db-staging-baseline-20260701');
  assert.equal(DB_ID, 'bf9963f4-eb12-439b-a830-20bbf577ac22');
  assert.equal(TENANT_ID, 999013);
  assert.equal(QA_EMPLOYEE_CODE, 'QA-FRMS-UX-01');
  assert.equal(QA_EMAIL, 'qa-frms-ux@staging.airtrust.invalid');
  assert.equal(CONFIRM, 'AIRTRUST_STAGING_FRMS_UX_IDENTITY');
});

test('provision is fixed-scope additive and permits no arbitrary tenant', () => {
  const sql=buildProvisionSql('$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZA');
  assert.match(sql,/INSERT INTO usuarios \(/);
  assert.match(sql,/INSERT INTO usuarios_empresas \(/);
  assert.match(sql,/emp\.id=999013/);
  assert.match(sql,/f\.matricula='QA-FRMS-UX-01'/);
  assert.match(sql,/WHERE lower\(trim\(u\.email\)\)='qa-frms-ux@staging\.airtrust\.invalid'/);
  assert.match(sql,/'admin',1,datetime\('now'\)/);
  assert.doesNotMatch(sql,/DELETE FROM|DROP TABLE|ALTER TABLE|CREATE TABLE|\bUPDATE\s+usuarios\b/i);
  assert.doesNotMatch(sql,/SELECT\s+\*\s+FROM\s+usuarios/i);
});

test('invalid hash is rejected before any SQL can be generated', () => {
  assert.throws(() => buildProvisionSql('not a bcrypt hash'),/QA_PASSWORD_HASH_INVALID/);
});

test('rollback only disables account tied to fixed synthetic crew and tenant', () => {
  const sql=buildRollbackSql();
  assert.match(sql,/UPDATE usuarios SET active=0/);
  assert.match(sql,/empresa_id=999013/);
  assert.match(sql,/matricula='QA-FRMS-UX-01'/);
  assert.match(sql,/ue\.empresa_id!=999013/);
  assert.doesNotMatch(sql,/DELETE FROM|UPDATE funcionarios|UPDATE empresas|UPDATE usuarios_empresas/);
});
