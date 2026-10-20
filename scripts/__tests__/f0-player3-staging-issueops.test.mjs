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


test('official staging guard checks GitHub bot dispatch against an immutable admin comment',async()=>{
  const {runInNewContext}=await import('node:vm');
  const official=readFileSync('.github/workflows/deploy-staging.yml','utf8');
  const heredoc=official.split("node <<'NODE'\n")[1]?.split('\n          NODE')[0];
  assert.ok(heredoc,'official guard inline Node program exists');
  const program=heredoc.split('\n').map(line=>line.replace(/^ {10}/,'')).join('\n');
  const end=program.indexOf('})().catch');
  assert.ok(end>0,'guard catch boundary is present');
  const executable=program.slice(0,end)+'})()';
  const commentId=6291312417;
  const repo='Airtrust-Org/airtrust';
  const fixedTime=Date.parse('2026-10-20T12:56:00Z');
  const makeDate=class extends Date {
    static now(){return fixedTime;}
  };
  const run=async({body='AIRTRUST_F0_PLAYER3_STAGING_V1 '+sha,
    admin=true,created='2026-10-20T12:54:12Z',
    updated=created,actor='github-actions[bot]',apply='false',worker='true',
    frontend='true',smoke='true',reasonId=commentId,commentIssue=776}={})=>{
    const env={
      GITHUB_REPOSITORY:repo,PR_NUMBER:'1389',RELEASE_SHA:sha,
      GITHUB_ACTOR:actor,GITHUB_TOKEN:'unit-test-token',
      DEPLOY_WORKER:worker,DEPLOY_FRONTEND:frontend,RUN_SMOKE:smoke,
      APPLY_MIGRATIONS:apply,APPROVED_MIGRATIONS:'',
      RELEASE_REASON:'F0 Player3 synthetic QA staging runtime, issue 776 comment '+
        reasonId+', no migrations or production'
    };
    const requests=[];
    const fakeFetch=async(url)=>{
      const path=String(url).replace('https://api.github.com','');
      requests.push(path);
      let data;
      if(path=== '/repos/'+repo+'/pulls/1389')
        data={state:'open',base:{ref:'main'},head:{sha,repo:{full_name:repo,fork:false}}};
      else if(path=== '/repos/'+repo+'/git/commits/'+sha)data={sha};
      else if(path=== '/repos/'+repo+'/issues/comments/'+commentId)
        data={issue_url:'https://api.github.com/repos/'+repo+'/issues/'+commentIssue,
          body,created_at:created,updated_at:updated,
          user:{login:'isaeldaumas',type:'User'}};
      else if(path=== '/repos/'+repo+'/collaborators/isaeldaumas/permission')
        data={permission:admin?'admin':'write'};
      else if(path=== '/repos/'+repo+'/collaborators/external-bot/permission')
        data={permission:'read'};
      else throw Error('UNEXPECTED_TEST_ENDPOINT:'+path);
      return {ok:true,json:async()=>data};
    };
    const sandbox={process:{env},fetch:fakeFetch,Date:makeDate,
      console:{log:()=>{},error:()=>{}}};
    return runInNewContext(executable,sandbox);
  };
  await assert.doesNotReject(run());
  await assert.rejects(run({admin:false}),/F0_STAGING_ADMIN_PERMISSION_REQUIRED/);
  await assert.rejects(run({updated:'2026-10-20T12:55:00Z'}),/F0_STAGING_ADMIN_COMMENT_MISMATCH/);
  await assert.rejects(run({created:'2026-10-20T10:54:12Z'}),/F0_STAGING_ADMIN_COMMENT_/);
  await assert.rejects(run({commentIssue:1389}),/F0_STAGING_ADMIN_COMMENT_MISMATCH/);
  await assert.rejects(run({body:'untrusted command'}),/F0_STAGING_ADMIN_COMMENT_MISMATCH/);
  await assert.rejects(run({apply:'true'}),/F0_STAGING_BOT_SCOPE_DENIED/);
  await assert.rejects(run({frontend:'false'}),/F0_STAGING_BOT_SCOPE_DENIED/);
  await assert.rejects(run({actor:'external-bot'}),/Workflow actor must have write/);
});
