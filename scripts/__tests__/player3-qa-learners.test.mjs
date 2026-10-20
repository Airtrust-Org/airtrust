import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertGrant,assertPreflight,assertPostflight,verifyClaim,
  LEARNERS,EXPECTED_CHECKS,QA_TENANT,QA_COURSE} from '../staging/player3-qa-learners.mjs';

const sha='307821d49f21161bfbd70b756d7d174b649fbea9';
const actor='isaeldaumas';
const now=Date.parse('2026-10-20T16:00:00Z');
const valid=()=>({
  body:'AIRTRUST_PLAYER3_QA_LEARNERS_V1 '+sha+' tenant=999006 course=327',
  issue_url:'https://api.github.com/repos/Airtrust-Org/airtrust/issues/776',
  user:{login:actor},
  created_at:'2026-10-20T15:30:00Z',
  updated_at:'2026-10-20T15:30:00Z',
});
const before=()=>({
  qa_tenant:1,alpha_count:1,alpha_id:2,bravo_count:1,bravo_id:3,
  qa_browser_users:0,qa_employee_linked_users:0,qa_existing_course_enrollments:0,
  qa_existing_native_pins:0,qa_course_published:1,qa_editions_published:1,
  qa_marker:1,applied_0561:1,applied_0562:1,
});
const readMeta={changed_db:false,rows_written:0};

test('only same-author immutable fresh exact SHA/tenant/course GitHub admin grant',()=>{
  assert.doesNotThrow(()=>assertGrant(valid(),'admin',actor,sha,now));
  for(const altered of [
    {body:'AIRTRUST_PLAYER3_QA_LEARNERS_V1 '+sha+' tenant=6 course=327'},
    {body:valid().body+'\n'},
    {issue_url:'https://api.github.com/repos/Airtrust-Org/airtrust/issues/1389'},
    {user:{login:'another'}},
    {updated_at:'2026-10-20T15:31:00Z'},
    {created_at:'2026-10-20T05:30:00Z',updated_at:'2026-10-20T05:30:00Z'},
    {created_at:'not-a-date',updated_at:'not-a-date'},
  ]) assert.throws(()=>assertGrant({...valid(),...altered},'admin',actor,sha,now),
    /EXACT_ADMIN_GRANT_REQUIRED/);
  assert.throws(()=>assertGrant(valid(),'write',actor,sha,now),/EXACT_ADMIN_GRANT_REQUIRED/);
  assert.throws(()=>assertGrant(valid(),'admin','other-user',sha,now),/EXACT_ADMIN_GRANT_REQUIRED/);
});

test('SELECT-only fixture requires exactly two different physically unlinked QA employees',()=>{
  assert.deepEqual(assertPreflight(before(),readMeta),{chromium:2,webkit:3});
  for(const mutated of [
    {qa_tenant:0},{alpha_count:2},{bravo_count:0},{bravo_id:2},
    {qa_browser_users:1},{qa_employee_linked_users:1},
    {qa_existing_course_enrollments:1},{qa_existing_native_pins:1},
    {qa_course_published:0},{qa_editions_published:0},
    {qa_marker:0},{applied_0561:0},{applied_0562:0},
  ])assert.throws(()=>assertPreflight({...before(),...mutated},readMeta),
    /PHYSICAL_PREFLIGHT_FAILED/);
  assert.throws(()=>assertPreflight(before(),{changed_db:true,rows_written:1}),
    /PHYSICAL_PREFLIGHT_FAILED/);
});

test('final readback requires two actual independent pinned course-327 cycles',()=>{
  const row={qa_tenant:1,qa_browser_users:2,qa_distinct_employees:2,
    qa_pinned_native_enrollments:2,qa_distinct_cycles:2,
    qa_pinned_published_edition:2};
  assert.doesNotThrow(()=>assertPostflight(row,readMeta));
  for(const k of Object.keys(row)){
    assert.throws(()=>assertPostflight({...row,[k]:0},readMeta),
      /PHYSICAL_POSTFLIGHT_FAILED/);
  }
  assert.throws(()=>assertPostflight(row,{changed_db:false,rows_written:1}),
    /PHYSICAL_POSTFLIGHT_FAILED/);
});

test('learner identity JWT scope assertions never accept another tenant or employee',()=>{
  const claims={empresa_id:QA_TENANT,funcionario_id:2,role:'ALUNO'};
  const make=v=>'a.'+Buffer.from(JSON.stringify(v)).toString('base64url')+'.b';
  assert.doesNotThrow(()=>verifyClaim(make(claims),2));
  for(const c of [
    {...claims,empresa_id:6},{...claims,funcionario_id:3},
    {...claims,role:'ADMIN'}, {...claims,funcionario_id:null},
  ])assert.throws(()=>verifyClaim(make(c),2),/IDENTITY_SCOPE_INVALID/);
  assert.throws(()=>verifyClaim('notjwt',2),/JWT_STRUCTURE/);
});

test('only fixed synthetic staging identities and course; no production or old EADs',()=>{
  assert.equal(QA_COURSE,327);
  assert.equal(LEARNERS.length,2);
  assert.notEqual(LEARNERS[0].email,LEARNERS[1].email);
  assert.notEqual(LEARNERS[0].employeeCode,LEARNERS[1].employeeCode);
  assert.ok(LEARNERS.every(x=>x.email.endsWith('@staging.airtrust.invalid')));
  assert.equal(EXPECTED_CHECKS.length,10);
  const source=readFileSync('scripts/staging/player3-qa-learners.mjs','utf8');
  assert.match(source,/\/api\/admin\/usuarios/);
  assert.match(source,/\/api\/auth\/invite\/accept/);
  assert.match(source,/\/api\/lms\/native\/cursos\/327\/matricular/);
  assert.match(source,/spawnSync\('\.\/node_modules\/\.bin\/wrangler'/);
  assert.doesNotMatch(source,/\b(?:wrangler d1|d1 execute).*--command=.*(?:INSERT|UPDATE|DELETE)/i);
});

test('GitHub Actions workflow uses main, protected staging, separate read/provision credentials and shared mutex',()=>{
  const workflow=readFileSync('.github/workflows/staging-player3-qa-learners.yml','utf8');
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/group: airtrust-staging-mutations-and-scorm-qa/);
  assert.match(workflow,/environment: staging/);
  assert.match(workflow,/secrets\.PLAYER3_QA_CHROMIUM_PASSWORD/);
  assert.match(workflow,/secrets\.PLAYER3_QA_WEBKIT_PASSWORD/);
  assert.match(workflow,/secrets\.QA_EXAMINER_ADMIN_PASSWORD/);
  assert.match(workflow,/secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.match(workflow,/run: node scripts\/staging\/player3-qa-learners\.mjs guard/);
  assert.match(workflow,/run: node scripts\/staging\/player3-qa-learners\.mjs verify/);
  assert.doesNotMatch(workflow,/deploy-airtrust\.yml|secrets\.CLOUDFLARE_WORKER_API_TOKEN/);
  assert.doesNotMatch(workflow,/schedule:|pull_request:|issue_comment:/);
});
