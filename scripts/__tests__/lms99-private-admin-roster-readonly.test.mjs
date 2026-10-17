import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, validateRoster } from '../production/lms99-private-admin-roster-readonly.mjs';

test('classify protects edition mismatch over a server-ready closure', () => {
  assert.equal(classify({
    edition_mismatch: {required:true}, closure_readiness: {
      code:'SCORM_READY_FOR_SERVER_VERIFICATION',eligible_for_server_verification:true,
    },
  }),'LMS_NEW_EDITION_REQUIRED');
  assert.equal(classify({
    closure_readiness:{code:'SCORE_BELOW_MASTERY',eligible_for_server_verification:false},
  }),'SCORE_BELOW_MASTERY');
  assert.equal(classify({
    closure_readiness:{code:'SCORM_READY_FOR_SERVER_VERIFICATION',eligible_for_server_verification:true},
  }),'SCORM_READY_FOR_SERVER_VERIFICATION');
});

test('12 enrollment names and enrollment identifiers are required, never guesses', () => {
  const good=Array.from({length:12},(_,i)=>({
    matricula_lms:2000+i,funcionario:'Aluno '+(i+1),status:'EM_ANDAMENTO',progresso_bruto:100,
  }));
  assert.equal(validateRoster(good),true);
  assert.throws(()=>validateRoster(good.slice(0,11)),/PENDING_COUNT_CHANGED/);
  assert.throws(()=>validateRoster([...good.slice(0,11),good[0]]),/DUPLICATE_ID/);
  assert.throws(()=>validateRoster(good.map((r,i)=>i===0?{...r,status:'CONCLUIDO'}:r)),/ROW_INVALID/);
  assert.throws(()=>validateRoster(good.map((r,i)=>i===0?{...r,funcionario:''}:r)),/ROW_INVALID/);
});

test('privileged review is tenant-pinned, encrypted, and read-only', () => {
  const root=new URL('../../',import.meta.url);
  const src=readFileSync(new URL('scripts/production/lms99-private-admin-roster-readonly.mjs',root),'utf8');
  const flow=readFileSync(new URL('.github/workflows/production-lms99-private-admin-roster-readonly.yml',root),'utf8');
  assert.match(src,/const TENANT = 6/);
  assert.match(src,/LMS99_PRIVATE_REVIEW_/);
  assert.match(src,/READ_PATH_BLOCKED/);
  assert.match(src,/EXPECTED === 12/);
  assert.match(src,/createCipheriv\('aes-256-gcm'/);
  assert.match(src,/publicEncrypt\(\{key,oaepHash:'sha256'\}/);
  assert.match(src,/flag:'wx'/);
  assert.doesNotMatch(src,/\/(?:finalizar|nova-edicao|scorm\/commit)/);
  assert.doesNotMatch(src,/wrangler\s+(?:d1|r2|deploy)/);
  assert.match(flow,/workflow_dispatch:/);
  assert.match(flow,/environment: production/);
  assert.match(flow,/verify-release-gates\.mjs/);
  assert.match(flow,/secrets\.PROD_SMOKE_EMAIL/);
  assert.match(flow,/retention-days: 1/);
  assert.doesNotMatch(flow,/\bpush:|\bpull_request:/);
});
