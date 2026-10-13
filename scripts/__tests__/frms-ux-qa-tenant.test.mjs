import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertTarget, assertOperation, buildApplySql, buildRollbackSql,
  preflightQueries, DB_NAME, DB_ID, TENANT_ID, TENANT_CODE, CONFIRM,
} from '../staging/frms-ux-qa-tenant.mjs';

test('fail closed on any non-staging target or missing write confirmation',()=>{
  assert.doesNotThrow(()=>assertTarget(DB_NAME,DB_ID,'staging'));
  for(const [name,id,env] of [
    ['airtrust-db','7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae','production'],
    [DB_NAME,'7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae','staging'],
    [DB_NAME,DB_ID,'production']
  ]) assert.throws(()=>assertTarget(name,id,env),/DENIED/);
  assert.throws(()=>assertOperation(['--apply'],''),/CONFIRMATION/);
  assert.throws(()=>assertOperation(['--apply','--rollback'],CONFIRM),/ONE_EXPLICIT/);
  assert.equal(assertOperation(['--apply'],CONFIRM),'--apply');
});
test('fixture: exactly 14 crew, seven received checkins, and standalone tenant',()=>{
  const hash='$2a$12$'+ 'A'.repeat(53);
  const sql=buildApplySql(hash);
  assert.equal((sql.match(/INSERT INTO funcionarios /g)||[]).length,14);
  assert.equal((sql.match(/INSERT INTO frms_fadiga_checkin /g)||[]).length,7);
  assert.match(sql,/INSERT INTO escalas_quinzenas /);
  assert.match(sql,/INSERT INTO frms_profile_assignments /);
  assert.match(sql,/frms-helicopter-offshore/gi);
  assert.match(sql,new RegExp(String(TENANT_ID)));
  assert.match(sql,new RegExp(TENANT_CODE));
  assert.doesNotMatch(sql,/Costa do Sol|@gmail|cpf|telefone|oxandrolona/i);
  assert.doesNotMatch(sql,/\bempresa_id\s*=\s*6\b/);
  assert.throws(()=>buildApplySql('plaintext'),/HASH_REQUIRED/);
});
test('preflight requires exclusive unused tenant and governed baseline',()=>{
  const q=preflightQueries();
  for(const sql of Object.values(q)) assert.match(sql,/^SELECT COUNT\(\*\) AS total FROM /);
  assert.match(q.tenantId,new RegExp(String(TENANT_ID)));
  assert.match(q.governedParameters,/frms-helicopter-offshore-baseline-v1/);
});
test('compensation is limited to one synthetic tenant, and does not drop tables',()=>{
  const sql=buildRollbackSql();
  assert.match(sql,/WHERE id=999016 AND codigo=/);
  assert.match(sql,/qa-frms-ux-checkin-/);
  assert.match(sql,/RETIRED/);
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM /);
});
test('governed workflow requires gated SHA, backup, recovery and staging environment',()=>{
  const wf=readFileSync(new URL('../../.github/workflows/staging-frms-ux-qa-tenant.yml',import.meta.url),'utf8');
  for(const match of ['AIRTRUST_STAGING_FRMS_UX_QA','verify-release-gates.mjs','backup-d1-staging.sh','time-travel info','environment: staging','CLOUDFLARE_D1_MIGRATION_API_TOKEN','STAGING_D1_ID','--preflight','--verify','--rollback']) assert.ok(wf.includes(match),match);
  assert.doesNotMatch(wf,/environment:\s*production|--env production/);
});
