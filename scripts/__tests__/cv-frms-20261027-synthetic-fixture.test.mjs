import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixtureSql, DB, DB_ID, TENANT, DAY, MARKER, PIC, SIC} from '../staging/seed-cv-frms-coordination-20261027.mjs';

const workflow=readFileSync(new URL('../../.github/workflows/staging-cv-frms-20261027-synthetic-fixture.yml',import.meta.url),'utf8');
const script=readFileSync(new URL('../staging/seed-cv-frms-coordination-20261027.mjs',import.meta.url),'utf8');

test('fixture pinned exclusively to fictional tenant, date and staging D1',()=>{
  assert.equal(DB,'airtrust-db-staging-baseline-20260701');
  assert.equal(DB_ID,'bf9963f4-eb12-439b-a830-20bbf577ac22');
  assert.equal(TENANT,999006);
  assert.equal(DAY,'2026-10-27');
  assert.match(MARKER,/^QA_FRMS_CV_/);
  assert.equal(PIC,'QA-PARTICIPANTE-ALFA');
  assert.equal(SIC,'QA-PARTICIPANTE-BRAVO');
  assert.ok(!script.includes('airtrust-db-production'));
});
test('fixture inserts only flight, dedicated PIC/SIC, synthetic journey/check-in',()=>{
  const sql=fixtureSql();
  const statements=sql.split(';').map(s=>s.trim()).filter(Boolean);
  assert.equal(statements.length,5);
  assert.equal((sql.match(/\bINSERT INTO\b/g)||[]).length,5);
  assert.deepEqual([...sql.matchAll(/\bINSERT INTO\s+([a-z_]+)/g)].map(m=>m[1]),[
    'cv_voos','cv_voo_tripulantes','cv_voo_tripulantes','frms_jornada','frms_fadiga_checkin'
  ]);
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|DROP|ALTER|REPLACE|ATTACH|DETACH)\b/i);
  assert.match(sql,/QA SINTETICO/);
  assert.match(sql,/NOT EXISTS/);
  assert.match(sql,/empresa_id=999006/g);
  assert.doesNotMatch(sql,/empresa_id\s*=\s*6(?:\D|$)/);
});
test('synthetic check-in is explicitly marked and SIC remains pending',()=>{
  const sql=fixtureSql();
  assert.match(sql,/'QA_SYNTHETIC'/);
  assert.match(sql,/'QA-PARTICIPANTE-ALFA'/);
  assert.match(sql,/'QA-PARTICIPANTE-BRAVO'/);
  assert.equal((sql.match(/INSERT INTO frms_fadiga_checkin/g)||[]).length,1);
  assert.match(sql,/checkin-20261027-v1/);
});
test('governed workflow gates SHA, staging environment and Time Travel before writing',()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/environment: staging/);
  assert.match(workflow,/group: airtrust-staging-mutations-and-scorm-qa/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/node scripts\/ci\/verify-release-gates\.mjs/);
  assert.match(workflow,/STAGING_WORKER_SHA_MISMATCH/);
  assert.match(workflow,/STAGING_PAGES_SHA_MISMATCH/);
  assert.match(workflow,/d1 time-travel info/);
  assert.match(workflow,/STAGING_D1_UUID_MISMATCH/);
  assert.match(workflow,/steps\.recovery\.outputs\.bookmark/);
  assert.match(workflow,/--inspect/);
  assert.match(workflow,/--apply/);
  assert.doesNotMatch(workflow,/secrets\.CLOUDFLARE_PRODUCTION/);
});
test('unexpected mode or missing staging credentials cannot write',()=>{
  assert.match(script,/CV_FRMS_STAGING_TARGET_OR_CREDENTIALS_MISSING/);
  assert.match(script,/CV_FRMS_RECOVERY_REQUIRED/);
  assert.match(script,/CV_FRMS_APPLY_NOT_CONFIRMED/);
  assert.match(script,/CV_FRMS_FIXTURE_PREFLIGHT_FAILED/);
  assert.match(script,/CV_FRMS_FIXTURE_POSTCONDITION_FAILED/);
  assert.match(script,/foreignCheckins/);
  assert.match(script,/collision/);
});
