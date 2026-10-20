import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateF0DelegatedStaging} from '../staging/f0-delegated-staging-attestation.mjs';

const sha='3c4941931694f0bb01ce574dfa2cff6a92cf1684';
const now='2026-10-20T13:00:00Z';
const c={
  id:6291312417,
  issue_url:'https://api.github.com/repos/Airtrust-Org/airtrust/issues/776',
  user:{type:'User',login:'isaeldaumas'},
  body:'AIRTRUST_F0_PLAYER3_STAGING_V1 '+sha,
  created_at:now,updated_at:now
};
const valid={
  actor:'github-actions[bot]',commentId:'6291312417',
  releaseSha:sha,prNumber:'1389',deployWorker:'true',
  deployFrontend:'true',applyMigrations:'false',
  approvedMigrations:'',runSmoke:'true',
  comment:c,adminPermission:'admin',nowMs:Date.parse(now)+1000
};
const deny=(patch,reason)=>assert.throws(
  ()=>validateF0DelegatedStaging({...valid,...patch}),
  new RegExp('F0_STAGING_DELEGATION_'+reason)
);

test('signed-in admin issue #776 comment delegates exact staging worker+pages only',()=>{
 assert.deepEqual(validateF0DelegatedStaging(valid),{
   adminLogin:'isaeldaumas',commentId:6291312417,releaseSha:sha
 });
});
test('never give bot general staging, schema, production, or smoke-free privileges',()=>{
 deny({actor:'attacker'},'IDENTITY_OR_COMMENT_ID_DENIED');
 deny({commentId:'-1'},'IDENTITY_OR_COMMENT_ID_DENIED');
 deny({prNumber:'1623'},'RELEASE_SCOPE_DENIED');
 deny({releaseSha:'f'.repeat(40)},'IMMUTABLE_ADMIN_ISSUE_COMMAND_REQUIRED');
 deny({deployWorker:'false'},'RELEASE_SCOPE_DENIED');
 deny({deployFrontend:'false'},'RELEASE_SCOPE_DENIED');
 deny({applyMigrations:'true'},'RELEASE_SCOPE_DENIED');
 deny({approvedMigrations:'0564.sql'},'RELEASE_SCOPE_DENIED');
 deny({runSmoke:'false'},'RELEASE_SCOPE_DENIED');
});
test('no anonymous, stale, edited, forged, or downgraded admin comment',()=>{
 deny({comment:{...c,id:2}},'IMMUTABLE_ADMIN_ISSUE_COMMAND_REQUIRED');
 deny({comment:{...c,body:'hello'}},'IMMUTABLE_ADMIN_ISSUE_COMMAND_REQUIRED');
 deny({comment:{...c,issue_url:c.issue_url.replace('/776','/1492')}},'IMMUTABLE_ADMIN_ISSUE_COMMAND_REQUIRED');
 deny({comment:{...c,user:{type:'Bot',login:'github-actions[bot]'}}},'IMMUTABLE_ADMIN_ISSUE_COMMAND_REQUIRED');
 deny({comment:{...c,updated_at:'2026-10-20T13:01:00Z'}},'IMMUTABLE_ADMIN_ISSUE_COMMAND_REQUIRED');
 deny({adminPermission:'write'},'COMMENT_AUTHOR_ADMIN_REQUIRED');
 deny({nowMs:Date.parse(now)+5*60*60*1000},'COMMENT_TOO_OLD_OR_FUTURE');
 deny({nowMs:Date.parse(now)-3*60*1000},'COMMENT_TOO_OLD_OR_FUTURE');
});
test('the official staging guard consumes the id and does not silently accept bot',()=>{
 const wf=readFileSync('.github/workflows/deploy-staging.yml','utf8');
 assert.doesNotMatch(wf,/f0_request_comment_id:/);
 assert.match(wf,/f0RequestMatch/);
 const block=wf.split('  workflow_dispatch:\n    inputs:\n')[1].split('\n# The')[0];
 assert.equal((block.match(/^      [a-z_]+:$/gm)||[]).length,10);
 assert.match(wf,/validateF0DelegatedStaging/);
 assert.match(wf,/issues\/comments/);
 assert.match(wf,/issues: read/);
 assert.match(wf,/actor==='github-actions\[bot\]'/);
 assert.match(wf,/if \(f0Id\) throw new Error/);
 assert.match(wf,/environment: staging/);
 const dispatcher=readFileSync('scripts/staging/dispatch-f0-player3-staging-from-comment.mjs','utf8');
 assert.match(dispatcher,/f0_request_comment_id:String\(commentId\)/);
});
