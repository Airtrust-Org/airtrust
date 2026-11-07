import test from 'node:test';
import assert from 'node:assert/strict';
import {captureTrustedRunnerRecoveryHandoff as acquire}
  from '../../ops/frms-qa-repair/trusted-runner-bookmark-acquisition.mjs';
import {verifyRecoveryHandoff}
  from '../../ops/frms-qa-repair/recovery-handoff-prototype.mjs';

const NOW=new Date('2026-10-23T14:00:00.000Z');
const ACCOUNT='a'.repeat(32);
const API_TOKEN='SYNTHETIC_EXISTING_STAGING_TOKEN_NEVER_OUTPUT';
const BRIDGE='b'.repeat(64),CALLER='c'.repeat(64),NONCE='d'.repeat(64);
const SHA='e'.repeat(40),RUN='39972064378';
const DB='bf9963f4-eb12-439b-a830-20bbf577ac22';
const BOOKMARK='00000001-00000002-00004e2f-0a83ea2fceebc654de0640c422be4653';
const record=()=>({requested:[]});
const fixture=(state=record(),body={success:true,result:{bookmark:BOOKMARK}})=>
  async(url,opts)=>{
    state.requested.push({url,opts});
    return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
  };
const args=(fetcher)=>({
  accountId:ACCOUNT,apiToken:API_TOKEN,bridgeKeyHex:BRIDGE,callerKeyHex:CALLER,
  callerNonce:NONCE,operation:'prepare',releaseSha:SHA,runId:RUN,
  runAttempt:1,now:NOW,fetcher,
});
const ledger=()=>{
  const used=new Map();
  return {used,transaction:async cb=>cb({
    get:async k=>used.get(k),
    put:async(k,v)=>{used.set(k,v);},
  })};
};
test('pinned HTTPS GET obtains a fresh bookmark, signs privately and never transports the token',async()=>{
  const state=record(),proof=await acquire(args(fixture(state)));
  assert.equal(state.requested.length,1);
  const [{url,opts}]=state.requested;
  assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+
    '/d1/database/'+DB+'/time_travel/bookmark');
  assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'manual');
  assert.equal(opts.headers.Authorization,'Bearer '+API_TOKEN);
  assert.equal(opts.headers.Accept,'application/json');
  assert.equal(proof.claims.bookmark,BOOKMARK);
  assert.equal(proof.claims.source,'CLOUDFLARE_D1_TIME_TRAVEL_GET');
  assert.equal(JSON.stringify(proof).includes(API_TOKEN),false);
  assert.equal(JSON.stringify(proof).includes(CALLER),false);
  assert.equal(JSON.stringify(proof).includes(BRIDGE),false);
  assert.equal(Object.keys(proof).sort().join(','),'claims,mac');
  const storage=ledger(), expected={
    accountId:ACCOUNT,releaseSha:SHA,operation:'prepare',runId:RUN,
    runAttempt:1,callerNonce:NONCE,
  };
  const result=await verifyRecoveryHandoff({
    proof,keyHex:BRIDGE,expected,storage,now:NOW});
  assert.equal(result.bookmark,BOOKMARK);
  await assert.rejects(verifyRecoveryHandoff({
    proof,keyHex:BRIDGE,expected,storage,now:NOW}),/QA_RECOVERY_BRIDGE_DENIED/);
});
test('bad scope or reused caller signing key is rejected before network access',async()=>{
  const state=record(),fetcher=fixture(state);
  for(const change of [
    {bridgeKeyHex:CALLER},{bridgeKeyHex:''},{callerNonce:'wrong'},
    {accountId:'bad'},{releaseSha:'not-a-sha'},
    {operation:'delete'},{runAttempt:0},{runId:'foo'},
    {apiToken:''},
  ]){
    await assert.rejects(acquire({...args(fetcher),...change}),
      /QA_RECOVERY_ACQUISITION_DENIED/);
  }
  assert.equal(state.requested.length,0);
});
test('redirects, refused requests, malformed transport and unsafe upstream responses fail closed',async()=>{
  const invalid=[
    async()=>new Response(null,{status:403}),
    async()=>new Response(null,{status:302,headers:{Location:'https://example.com/'}}),
    async()=>({ok:true,status:200,redirected:true,json:async()=>({success:true,result:{bookmark:BOOKMARK}})}),
    async()=>new Response('bad json',{status:200}),
    async()=>{throw Error('sensitive transport failure '+API_TOKEN);},
    fixture(record(),{success:false,result:{bookmark:BOOKMARK}}),
    fixture(record(),{success:true,result:{bookmark:'../other'}}),
    fixture(record(),{success:true,result:{bookmark:''}}),
    fixture(record(),{success:true,result:{}}),
    fixture(record(),{success:true,result:{bookmark:'x'.repeat(161)}}),
  ];
  for(const f of invalid){
    await assert.rejects(acquire(args(f)),e=>{
      assert.equal(e.message,'QA_RECOVERY_ACQUISITION_DENIED');
      assert.equal(e.message.includes(API_TOKEN),false);
      return true;
    });
  }
});
test('bookmark cannot be supplied by caller input or switched between operation and SHA',async()=>{
  const f=fixture();
  const proof=await acquire({...args(f),bookmark:'MALICIOUS_CALLER_BOOKMARK'});
  assert.equal(proof.claims.bookmark,BOOKMARK);
  const storage=ledger(),expected={
    accountId:ACCOUNT,releaseSha:SHA,operation:'apply',runId:RUN,
    runAttempt:1,callerNonce:NONCE,
  };
  await assert.rejects(verifyRecoveryHandoff({
    proof,keyHex:BRIDGE,expected,storage,now:NOW}),/QA_RECOVERY_BRIDGE_DENIED/);
  assert.equal(storage.used.size,0);
});
test('runner proof still is not a signed Ed25519 apply grant or proof of HTTPS provenance',async()=>{
  const proof=await acquire(args(fixture()));
  assert.equal(Object.hasOwn(proof,'signatureBase64'),false);
  assert.equal(Object.hasOwn(proof,'cloudflareToken'),false);
  assert.equal(Object.hasOwn(proof,'independentApproval'),false);
  assert.equal(Object.hasOwn(proof,'cloudflareResponseSignature'),false);
});
