import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseRequest,assertGates,assertReviewedDelta,releaseInputs,GATES}
  from '../staging/dispatch-f0-player3-staging-from-comment.mjs';

const sha='3c4941931694f0bb01ce574dfa2cff6a92cf1684';
const main='6dff689e6c3a4c7c15fd91a1ab85b547c715ce98';
const actor='isaeldaumas';
const event=(body='AIRTRUST_F0_PLAYER3_STAGING_V1 '+sha)=>({
 action:'created',issue:{number:776},repository:{full_name:'Airtrust-Org/airtrust'},
 comment:{id:6283200012,user:{login:actor},body}
});
const env={actor,ref:'refs/heads/main',repo:'Airtrust-Org/airtrust',sha:main};
test('only exact immutable F0 issue 776 created-command on trusted main is accepted',()=>{
 assert.equal(parseRequest(event(),env),sha);
 for(const [e,c] of [
   [event('AIRTRUST_F0_PLAYER3_STAGING_V1 '+sha+'\nDISPATCH'),env],
   [event('AIRTRUST_F0_PLAYER3_STAGING_V1 deadbeef'),env],
   [{...event(),issue:{number:1492}},env],
   [{...event(),action:'edited'},env],
   [{...event(),issue:{number:776,pull_request:{url:'PR'}}},env],
   [{...event(),comment:{...event().comment,user:{login:'another'}}},env],
   [event(),{...env,ref:'refs/heads/dev'}],
   [event(),{...env,sha:'abc'}],
   [event(),{...env,repo:'Elsewhere/test'}]
 ])assert.throws(()=>parseRequest(e,c),/F0_CLOUD_DISPATCH_/);
});
test('eight canonical gates, SCORM E2E and Check PR must be exact GH Actions successes',()=>{
 const checks=GATES.map(name=>({name,status:'completed',conclusion:'success',app:{slug:'github-actions'}}));
 assert.doesNotThrow(()=>assertGates(checks));
 assert.throws(()=>assertGates(checks.filter(c=>c.name!=='public-e2e')),/REQUIRED_GATE_NOT_GREEN/);
 assert.throws(()=>assertGates(checks.map(c=>c.name==='lint'?{...c,conclusion:'failure'}:c)),/REQUIRED_GATE_NOT_GREEN/);
 assert.throws(()=>assertGates([...checks,checks[0]]),/REQUIRED_GATE_NOT_GREEN/);
 assert.throws(()=>assertGates(checks.map(c=>c.name==='worker-tests-2'?{...c,app:{slug:'external'}}:c)),/REQUIRED_GATE_NOT_GREEN/);
});
test('runtime main drift is rejected; reviewed F0 infra-only delta accepted',()=>{
 assert.doesNotThrow(()=>assertReviewedDelta({status:'diverged',ahead_by:4,
  files:[{filename:'scripts/staging/player3-qa-trusted-executor.mjs'},
   {filename:'.github/workflows/f0-player3-staging-issueops.yml'},
   {filename:'.github/workflows/ci.yml'}]}));
 assert.throws(()=>assertReviewedDelta({status:'diverged',ahead_by:4,
  files:[{filename:'worker-airtrust/src/index.ts'}]}),/RUNTIME_MAIN_DRIFT_DENIED/);
 assert.throws(()=>assertReviewedDelta({status:'diverged',ahead_by:20,files:[]}),/DELTA_UNBOUNDED/);
});
test('the ONLY dispatched action is official Worker+Pages staging, no migrations or prod',()=>{
 const inputs=releaseInputs(sha,6283200012);
 assert.equal(inputs.release_sha,sha);
 assert.equal(inputs.pr_number,'1389');
 assert.equal(inputs.apply_migrations,'false');
 assert.equal(inputs.approved_migrations,'');
 assert.equal(inputs.deploy_worker,'true');
 assert.equal(inputs.deploy_frontend,'true');
 assert.equal(inputs.run_smoke,'true');
 assert.equal(inputs.run_full_smoke,'false');
 assert.match(inputs.release_reason,/no migrations or production/);
 assert.throws(()=>releaseInputs('bad',1),/INVALID_INPUT/);
});
test('GitHub-only entrypoint cannot bypass official protected deploy',()=>{
 const wf=readFileSync('.github/workflows/f0-player3-staging-issueops.yml','utf8');
 const source=readFileSync('scripts/staging/dispatch-f0-player3-staging-from-comment.mjs','utf8');
 assert.match(wf,/issue_comment:/);
 assert.match(wf,/github\.event\.issue\.number == 776/);
 assert.match(wf,/actions: write/);
 assert.doesNotMatch(wf,/secrets\.CLOUDFLARE|workflow_dispatch:/);
 assert.match(source,/perm\.permission!=='admin'/);
 assert.match(source,/F0_CLOUD_DISPATCH_TRUSTED_MAIN_MOVED/);
 assert.match(source,/\/actions\/workflows\/deploy-staging\.yml\/dispatches/);
 assert.match(source,/response\.status!==204/);
 assert.doesNotMatch(source,/deploy-airtrust\.yml|apply-migration|D1 execute/i);
});
