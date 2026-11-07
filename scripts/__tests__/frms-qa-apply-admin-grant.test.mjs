// Synthetic GitHub REST fixtures only. Never emits a grant, calls Cloudflare,
// accesses real issues or authorizes a live FRMS staging apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import {exactApplyGrantPlan,verifyApplyAdminGrant} from
  '../../ops/frms-qa-repair/verify-apply-admin-grant.mjs';

const NOW=Date.parse('2026-10-23T19:00:00.000Z');
const SHA='b'.repeat(40),REPO='Airtrust-Org/airtrust',RUN='40019815631';
const GRANT='6374255192',TOKEN='synthetic-github-token-never-in-output';
const WORKFLOW='.github/workflows/staging-frms-qa-private-transaction.yml';
const DB='bf9963f4-eb12-439b-a830-20bbf577ac22';
const IDS=['qa-frms-ux-j-2026-10-12-QA-FRMS-UX-01','qa-frms-ux-case-1',
  'qa-frms-ux-j-2026-10-11-QA-FRMS-UX-02','qa-frms-ux-case-2',
  'qa-frms-ux-j-2026-10-10-QA-FRMS-UX-01','qa-frms-ux-case-3',
  'qa-frms-ux-j-2026-10-09-QA-FRMS-UX-02','qa-frms-ux-case-4'];
const SIG=Buffer.alloc(64,17).toString('base64'),RECEIPT='c'.repeat(64);
const manifest=()=>({
  authority:'AIRTRUST_RELEASE_COORDINATION',coordinationIssue:776,
  scope:'FRMS_QA_999013_4_CASES_4_JOURNEYS',sha:SHA,environment:'staging',
  dbId:DB,tenantId:999013,
  planSha256:'38a81ed05821919d87b424ddfc7b731bfc8d7d759dadebbb6a21d11edb349ed3',
  authorizedIds:IDS,receiptSha256:RECEIPT,
  preimageSha256:'d'.repeat(64),artifactSha256:'e'.repeat(64),
  recoveryBookmark:'synthetic-f0-staging-bookmark',
  nonce:'f'.repeat(64),issuedAt:new Date(NOW-1000).toISOString(),
  expiresAt:new Date(NOW+60000).toISOString(),
});
const ENV={
  GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_REPOSITORY:REPO,GITHUB_REF:'refs/heads/main',
  GITHUB_WORKFLOW_REF:REPO+'/'+WORKFLOW+'@refs/heads/main',
  GITHUB_SHA:SHA,GITHUB_RUN_ID:RUN,GITHUB_RUN_ATTEMPT:'1',
  GITHUB_ACTOR:'f0-admin',GITHUB_TOKEN:TOKEN,
  FRMS_QA_APPLY_CONFIRM:'AIRTRUST_FRMS_QA_APPLY_F0_APPROVED',
  FRMS_QA_APPLY_EXPECTED_SHA:SHA,FRMS_QA_APPLY_GRANT_ID:GRANT,
};
const plan=()=>exactApplyGrantPlan({sha:SHA,manifest:manifest(),
  receiptId:RECEIPT,signatureBase64:SIG});
function fake(change={}){
  const calls=[];
  const created=new Date(NOW-2000).toISOString();
  const actor=change.commentActor||'f0-admin';
  const fetcher=async(uri,options)=>{
    calls.push(uri);
    assert.equal(options.method,'GET');
    assert.equal(options.redirect,'manual');
    assert.ok(uri.startsWith('https://api.github.com/repos/'+REPO+'/'));
    assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
    const u=new URL(uri),path=u.pathname;
    if(path.endsWith('/branches/main'))
      return Response.json({commit:{sha:change.mainSha||SHA}});
    if(path.endsWith('/actions/runs/'+RUN))
      return Response.json({id:Number(RUN),head_sha:SHA,head_branch:'main',
        event:'workflow_dispatch',run_attempt:1,path:change.runPath||WORKFLOW,
        status:change.runStatus||'in_progress',actor:{login:'f0-admin'}});
    if(path.endsWith('/issues/comments/'+GRANT)){
      return Response.json({id:Number(GRANT),
        issue_url:'https://api.github.com/repos/'+REPO+'/issues/776',
        created_at:change.old?new Date(NOW-2*3600000-1000).toISOString():created,
        updated_at:change.edited?new Date(NOW-1000).toISOString():created,
        user:{login:actor},
        body:'AIRTRUST_FRMS_QA_APPLY_GRANT_V1\n'+
          JSON.stringify(change.forged?{approved:true}:change.body||plan())});
    }
    if(path.endsWith('/permission'))
      return Response.json({permission:change.badAdmin?'write':'admin'});
    if(path.endsWith('/check-runs')){
      const name=u.searchParams.get('check_name');
      return Response.json({check_runs:name===change.badGate?[]:[{
        name,head_sha:SHA,status:'completed',conclusion:'success',
        app:{slug:'github-actions'},
      }]});
    }
    throw Error('synthetic URL not allowlisted');
  };
  return {calls,fetcher};
}
const verify=(options={},change={})=>{
  const fixture=fake(change);
  return verifyApplyAdminGrant({env:{...ENV,...options.env},manifest:options.manifest||manifest(),
    receiptId:options.receiptId||RECEIPT,
    signatureBase64:options.signatureBase64||SIG,
    fetcher:fixture.fetcher,now:options.now??NOW});
};

test('exact apply grant binds eight synthetic IDs, digest, receipt, signature and no production',()=>{
  const p=plan();
  assert.deepEqual(p.authorized_ids,IDS);
  assert.equal(p.receipt_sha256,RECEIPT);
  assert.equal(p.apply_authorized,true);
  assert.equal(p.d1_batch_exact_rows,8);
  assert.equal(p.production_authorized,false);
  assert.equal(p.global_mutex,'airtrust-staging-mutations-and-scorm-qa');
  assert.equal(p.workflow_path,WORKFLOW);
  assert.equal(JSON.stringify(p).includes(SIG),false);
  assert.equal(JSON.stringify(p).includes(TOKEN),false);
});
test('trusted apply verification requires admin GET, current main and all eight Actions gates',async()=>{
  const {calls,fetcher}=fake();
  const verdict=await verifyApplyAdminGrant({env:ENV,manifest:manifest(),
    receiptId:RECEIPT,signatureBase64:SIG,fetcher,now:NOW});
  assert.equal(verdict.status,'VERIFIED_BY_INDEPENDENT_GITHUB_ADMIN_CHECK');
  assert.equal(verdict.sha,SHA);
  assert.equal(verdict.grantId,GRANT);
  assert.equal(verdict.tenantId,999013);
  assert.equal(calls.filter(x=>x.includes('check-runs')).length,8);
  assert.equal(JSON.stringify(verdict).includes(TOKEN),false);
});
test('forged or edited comment, wrong admin, failed gate, wrong main or stale grant fail closed',async()=>{
  for(const change of [{forged:true},{edited:true},{badAdmin:true},
    {badGate:'worker-tests-2'},{mainSha:'a'.repeat(40)},
    {old:true},{runStatus:'completed'},{runPath:'.github/workflows/other.yml'}]){
    await assert.rejects(verify({},change),/FRMS_QA_APPLY_ADMIN_GRANT_DENIED/);
  }
});
test('manifest, receipt, signature and workflow identity cannot be substituted',async()=>{
  for(const bad of [
    {manifest:{...manifest(),authorizedIds:[...IDS].reverse()}},
    {manifest:{...manifest(),tenantId:6}},
    {manifest:{...manifest(),preimageSha256:'0'.repeat(64)}},
    {manifest:{...manifest(),sha:'a'.repeat(40)}},
    {receiptId:'a'.repeat(64)},
    {signatureBase64:Buffer.alloc(64,18).toString('base64')},
    {env:{GITHUB_WORKFLOW_REF:REPO+'/.github/workflows/staging-frms-qa-private-prepare.yml@refs/heads/main'}},
    {env:{FRMS_QA_APPLY_CONFIRM:'unapproved'}},
    {env:{GITHUB_TOKEN:''}},
    {now:NOW+61000},
  ])await assert.rejects(verify(bad),/FRMS_QA_APPLY_ADMIN_GRANT_DENIED/);
});
