import test from 'node:test';
import assert from 'node:assert/strict';
import {proveBookmarkLocally}
  from '../../ops/frms-qa-repair/staging-bookmark-get-local-proof.mjs';

const TOKEN='SYNTHETIC_BEARER_NEVER_LOG';
const ACCOUNT='a'.repeat(32),SHA='b'.repeat(40),CALLER='c'.repeat(64);
const now=new Date('2026-10-23T14:00:00.000Z');
const BOOKMARK='00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683';
const env={
  GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'Airtrust-Org/airtrust',
  GITHUB_REF:'refs/heads/main',GITHUB_SHA:SHA,
  GITHUB_RUN_ID:'39972064378',GITHUB_RUN_ATTEMPT:'1',
  FRMS_QA_BOOKMARK_READONLY_CONFIRM:'FRMS_QA_BOOKMARK_GET_HMAC_LOCAL_READONLY',
  CLOUDFLARE_ACCOUNT_ID:ACCOUNT,
  CLOUDFLARE_WORKER_API_TOKEN:TOKEN,
  FRMS_QA_CALLER_KEY_HEX:CALLER,
};
const ok=()=>async()=>new Response(JSON.stringify({
  success:true,result:{bookmark:BOOKMARK},
}),{status:200});
test('successful GET proves transient local MAC without exposing data or authorizing deploy',async()=>{
  const result=await proveBookmarkLocally({env,fetcher:ok(),now});
  assert.equal(result.verdict,'FRMS_QA_BOOKMARK_GET_HMAC_LOCAL_READONLY_VERIFIED');
  assert.equal(result.writes,0);
  assert.equal(result.workerDeployed,false);
  assert.equal(result.runtimeTokenInstalled,false);
  assert.equal(result.operationalCaller,false);
  assert.equal(result.independentEd25519Approval,false);
  assert.equal(JSON.stringify(result).includes(BOOKMARK),false);
  assert.equal(JSON.stringify(result).includes(TOKEN),false);
});
test('workflow, tenant account and runner identity guards reject before GET',async()=>{
  let reads=0;const f=async()=>{reads++;return new Response(null,{status:200});};
  for(const change of [
    {GITHUB_ACTIONS:'false'},{GITHUB_REPOSITORY:'another/repo'},
    {GITHUB_REF:'refs/heads/feature'},{GITHUB_SHA:'invalid'},
    {GITHUB_RUN_ID:'bad'},{GITHUB_RUN_ATTEMPT:'0'},
    {FRMS_QA_BOOKMARK_READONLY_CONFIRM:'wrong'},
    {CLOUDFLARE_ACCOUNT_ID:'wrong'},{CLOUDFLARE_WORKER_API_TOKEN:''},
    {FRMS_QA_CALLER_KEY_HEX:''},
  ]){
    await assert.rejects(proveBookmarkLocally({
      env:{...env,...change},fetcher:f,now,
    }),/QA_STAGING_BOOKMARK_LOCAL_PROOF_DENIED/);
  }
  assert.equal(reads,0);
});
test('remote 403 and thrown transport error are sanitized, never disclose token',async()=>{
  for(const f of [
    async()=>new Response(null,{status:403}),
    async()=>{throw Error('PROVIDER_SECRET:'+TOKEN);},
    async()=>new Response('broken',{status:200}),
  ]){
    await assert.rejects(proveBookmarkLocally({env,fetcher:f,now}),e=>{
      assert.equal(e.message,'QA_STAGING_BOOKMARK_LOCAL_PROOF_DENIED');
      assert.equal(e.message.includes(TOKEN),false);
      return true;
    });
  }
});
