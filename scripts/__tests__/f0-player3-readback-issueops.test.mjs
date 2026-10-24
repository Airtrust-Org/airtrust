import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  REPO,GATES,PREFIX,WORKFLOW,
  parseRequest,assertCandidate,activeRunDecision,
} from '../staging/dispatch-f0-player3-readback-from-comment.mjs';
const sha='a'.repeat(40),main='b'.repeat(40);
const now=Date.parse('2026-10-20T20:00:00Z');
const event=()=>({
  action:'created',repository:{full_name:REPO},
  issue:{number:776},
  comment:{user:{login:'qa-admin'},created_at:'2026-10-20T19:59:00Z',
    updated_at:'2026-10-20T19:59:00Z',body:PREFIX+sha},
});
const ctx=()=>({
  repo:REPO,ref:'refs/heads/main',eventName:'issue_comment',
  mainSha:main,actor:'qa-admin',
});
const healthy=()=>({
  pr:{number:1389,state:'open',draft:true,base:{ref:'main'},
    head:{sha,repo:{full_name:REPO,fork:false}}},
  sha,
  checks:{total_count:10,check_runs:GATES.map(name=>({
    name,status:'completed',conclusion:'success',app:{slug:'github-actions'},
  }))},
  version:{environment:'staging',sourceSha:sha,
    releaseManifestSha256:'d'.repeat(64),workerBundleSha256:'e'.repeat(64)},
});
const run=(status,conclusion,head_sha=main)=>({
  event:'workflow_dispatch',head_branch:'main',status,conclusion,
  head_sha,created_at:'2026-10-20T19:50:00Z',
});

test('issue command accepts only unedited admin-shaped #776 created comment',()=>{
  assert.equal(parseRequest(event(),ctx()),sha);
  assert.throws(()=>parseRequest({...event(),issue:{number:775}},ctx()),
    /EXACT_UNEDITED_ADMIN_COMMENT_REQUIRED/);
  const wrong=event();wrong.comment.updated_at='2026-10-20T19:59:01Z';
  assert.throws(()=>parseRequest(wrong,ctx()),/EXACT_UNEDITED_ADMIN_COMMENT_REQUIRED/);
  const injected=event();injected.comment.body=PREFIX+sha+'; curl example';
  assert.throws(()=>parseRequest(injected,ctx()),/COMMAND_FORMAT_INVALID/);
  assert.throws(()=>parseRequest(event(),{...ctx(),ref:'refs/heads/feature'}),
    /TRUSTED_MAIN_EVENT_REQUIRED/);
  assert.equal(WORKFLOW,'staging-player3-existing-learner-readback.yml');
});

test('require F4 OPEN/DRAFT exact SHA, 10 github-actions green, physical staging',()=>{
  assert.doesNotThrow(()=>assertCandidate(healthy()));
  const altered=healthy();altered.pr.draft=false;
  assert.throws(()=>assertCandidate(altered),/F4_HEAD_OR_REVIEW_SCOPE_CHANGED/);
  const missing=healthy();missing.checks.check_runs=missing.checks.check_runs.slice(1);
  assert.throws(()=>assertCandidate(missing),/CI_GATE_NOT_GREEN/);
  const stale=healthy();stale.version.sourceSha='0'.repeat(40);
  assert.throws(()=>assertCandidate(stale),/LIVE_STAGING_RELEASE_MISMATCH/);
});

test('cloud dispatcher does not repeat waiting, running or already green QA',()=>{
  for(const status of ['queued','in_progress','waiting','pending']){
    assert.equal(activeRunDecision({workflow_runs:[run(status,null)]},main,now),
      'SKIP_RECENT_ACTIVE_OR_SUCCESS');
  }
  assert.equal(activeRunDecision({workflow_runs:[run('completed','success')]},main,now),
    'SKIP_RECENT_ACTIVE_OR_SUCCESS');
  assert.equal(activeRunDecision({workflow_runs:[run('completed','failure')]},main,now),
    'SKIP_SAME_TRUSTED_MAIN_FAILED_RUN');
  assert.equal(activeRunDecision({workflow_runs:[run('completed','failure','f'.repeat(40))]},
    main,now),'DISPATCH_ALLOWED');
});

test('old runs and unrelated workflows do not prevent protected read-only dispatch',()=>{
  const unrelated={...run('in_progress',null),event:'push'};
  assert.equal(activeRunDecision({workflow_runs:[unrelated]},main,now),
    'DISPATCH_ALLOWED');
  const old={...run('in_progress',null),created_at:'2026-10-19T11:00:00Z'};
  assert.equal(activeRunDecision({workflow_runs:[old]},main,now),
    'DISPATCH_ALLOWED');
  assert.throws(()=>activeRunDecision({workflow_runs:null},main,now),
    /RUN_INVENTORY_UNAVAILABLE/);
});
