import test from 'node:test';
import assert from 'node:assert/strict';
import {signRecoveryHandoff,verifyRecoveryHandoff} from '../../ops/frms-qa-repair/recovery-handoff-prototype.mjs';

const NOW=new Date('2026-10-23T14:00:00.000Z');
const KEY='a'.repeat(64),ACCOUNT='b'.repeat(32),SHA='c'.repeat(40),
  CALLER_NONCE='d'.repeat(64);
const input={keyHex:KEY,accountId:ACCOUNT,bookmark:'00000001-00000002-00004e2f-0a83ea2fceebc654de0640c422be4653',
  callerNonce:CALLER_NONCE,operation:'prepare',releaseSha:SHA,
  runId:'39972064378',runAttempt:1,now:NOW,capturedAt:new Date(+NOW-2000)};
const expected={accountId:ACCOUNT,releaseSha:SHA,operation:'prepare',
  runId:'39972064378',runAttempt:1,callerNonce:CALLER_NONCE};
const storage=()=>{
  const records=new Map();
  return {records,transaction:async cb=>cb({
    get:async k=>records.get(k),
    put:async(k,v)=>{records.set(k,v);},
  })};
};
const issue=(overrides={})=>signRecoveryHandoff({...input,...overrides});
const check=(proof,options={})=>verifyRecoveryHandoff({
  proof,keyHex:KEY,expected,storage:storage(),now:NOW,...options,
});
test('fresh staged GET claim can be authenticated and consumed once without a token',async()=>{
  const proof=issue();
  const state=storage();
  const result=await check(proof,{storage:state});
  assert.equal(result.bookmark,input.bookmark);
  assert.equal(result.dbId,'bf9963f4-eb12-439b-a830-20bbf577ac22');
  assert.equal(state.records.size,1);
  await assert.rejects(check(proof,{storage:state}),/QA_RECOVERY_BRIDGE_DENIED/);
  assert.equal(JSON.stringify(result).includes(KEY),false);
});
test('source, target, caller, run, operation and release scope are not transferrable',async()=>{
  const proof=issue();
  for(const x of [
    {operation:'apply'}, {releaseSha:'e'.repeat(40)},
    {accountId:'f'.repeat(32)}, {callerNonce:'e'.repeat(64)},
    {runId:'39972064379'}, {runAttempt:2},
  ])await assert.rejects(check(proof,{expected:{...expected,...x}}),/QA_RECOVERY_BRIDGE_DENIED/);
  for(const x of [{source:'D1_SESSION_BOOKMARK'}, {dbId:'wrong'},
    {tenantId:2}, {bookmark:'not a bookmark!'}, {unexpected:'field'}])
    await assert.rejects(check({...proof,claims:{...proof.claims,...x}}),
      /QA_RECOVERY_BRIDGE_DENIED/);
});
test('signature tampering and wrong signer key fail without consuming a nonce',async()=>{
  const proof=issue(),state=storage();
  await assert.rejects(check({...proof,mac:'0'.repeat(64)},{storage:state}),
    /QA_RECOVERY_BRIDGE_DENIED/);
  await assert.rejects(check(proof,{keyHex:'e'.repeat(64),storage:state}),
    /QA_RECOVERY_BRIDGE_DENIED/);
  assert.equal(state.records.size,0);
});
test('fresh capture and expiry cannot be fabricated outside the bounded window',async()=>{
  for(const d of [-100000,20000]){
    const stale=new Date(+NOW+d);
    assert.throws(()=>issue({capturedAt:stale}),/QA_RECOVERY_BRIDGE_DENIED/);
  }
  const proof=issue();
  await assert.rejects(check(proof,{now:new Date(+NOW+91000)}),
    /QA_RECOVERY_BRIDGE_DENIED/);
  await assert.rejects(check(proof,{now:new Date(+NOW-11000)}),
    /QA_RECOVERY_BRIDGE_DENIED/);
});
test('lost ledger and replay checker are fail-closed rather than accepting evidence',async()=>{
  const proof=issue();
  await assert.rejects(check(proof,{storage:{transaction:async()=>{throw Error('disk failure');}}}),
    /QA_RECOVERY_BRIDGE_DENIED/);
  await assert.rejects(check(proof,{storage:{transaction:async()=>false}}),
    /QA_RECOVERY_BRIDGE_DENIED/);
  await assert.rejects(check(proof,{storage:null}),/QA_RECOVERY_BRIDGE_DENIED/);
});
test('HMAC evidence alone never claims independent Ed25519 approval or recovery provenance',async()=>{
  const proof=issue();
  assert.equal(Object.keys(proof).sort().join(','),'claims,mac');
  assert.equal(Object.prototype.hasOwnProperty.call(proof,'signatureBase64'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(proof,'cloudflareToken'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(proof,'authorization'),false);
});
