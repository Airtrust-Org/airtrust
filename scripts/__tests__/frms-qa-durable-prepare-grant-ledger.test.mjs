import test from 'node:test';
import assert from 'node:assert/strict';
import {durablePrepareGrantLedger} from '../../ops/frms-qa-repair/durable-prepare-grant-ledger.mjs';
import {prepareViaPrivateServiceBinding} from '../../ops/frms-qa-repair/private-binding-prepare-prototype.mjs';
import {TARGET} from '../staging/frms-qa-cases-repair-plan.mjs';

const sha='a'.repeat(40),grantId='6373988992',runId='40018273616';
const key='frms-qa-prepare-grant:'+sha+':'+grantId;
const claim={sha,runId,runAttempt:1,phase:'prepare'};

// A transactional, durable-storage-shaped disposable fixture. All test
// storage stays in process; it does NOT represent a deployed Cloudflare DO.
const disposableStorage=()=>{
  const persisted=new Map();
  let pending=Promise.resolve();
  return {
    persisted,
    async transaction(callback){
      const predecessor=pending;
      let release;
      pending=new Promise(resolve=>{release=resolve;});
      await predecessor;
      try{
        const staged=new Map(persisted);
        const tx={
          async get(k){return staged.get(k);},
          async put(k,v){staged.set(k,v);},
        };
        const result=await callback(tx);
        persisted.clear();
        for(const [k,v] of staged)persisted.set(k,v);
        return result;
      }finally{release();}
    },
  };
};
const reserve=(ledger,k=key,value=claim)=>ledger.transaction(async tx=>{
  if(await tx.get(k))return false;
  await tx.put(k,value);
  return true;
});

test('one successful reservation is permanent across adapter instances',async()=>{
  const storage=disposableStorage();
  assert.equal(await reserve(durablePrepareGrantLedger(storage)),true);
  assert.equal(await reserve(durablePrepareGrantLedger(storage)),false);
  assert.deepEqual(storage.persisted.get(key),claim);
  assert.equal(storage.persisted.size,1);
});

test('concurrent duplicate reservations allow exactly one successful commit',async()=>{
  const storage=disposableStorage();
  const results=await Promise.all(Array.from({length:24},()=>reserve(durablePrepareGrantLedger(storage))));
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(results.filter(x=>x===false).length,23);
  assert.equal(storage.persisted.size,1);
});

test('wrong tenant/phase-shaped key or malformed grant metadata fails without persistence',async()=>{
  const storage=disposableStorage(),ledger=durablePrepareGrantLedger(storage);
  const badKeys=[
    'frms-qa-apply-grant:'+sha+':'+grantId,
    'frms-qa-prepare-grant:'+'b'.repeat(39)+':'+grantId,
    'frms-qa-prepare-grant:'+sha+':0',
    'frms-qa-prepare-grant:'+sha+':../../admin',
    'frms-qa-prepare-grant:'+sha+':'+grantId+':999014',
  ];
  for(const k of badKeys)
    await assert.rejects(reserve(ledger,k),/QA_PREPARE_DURABLE_GRANT_LEDGER_DENIED/);
  for(const v of [
    {...claim,phase:'apply'}, {...claim,sha:'b'.repeat(40)},
    {...claim,runAttempt:0}, {...claim,runId:'1'},
    {...claim,tenantId:999014}, {...claim,token:'DO_NOT_SAVE'},
  ])
    await assert.rejects(reserve(ledger,key,v),/QA_PREPARE_DURABLE_GRANT_LEDGER_DENIED/);
  assert.equal(storage.persisted.size,0);
});

test('corrupt or falsy persisted grant records fail closed without overwrite',async()=>{
  const storage=disposableStorage(),ledger=durablePrepareGrantLedger(storage);
  for(const persisted of [null,false,0,'',{}, {...claim,phase:'apply'}]){
    storage.persisted.set(key,persisted);
    await assert.rejects(reserve(ledger),/QA_PREPARE_DURABLE_GRANT_LEDGER_DENIED/);
    assert.equal(storage.persisted.get(key),persisted);
    assert.equal(storage.persisted.size,1);
  }
  storage.persisted.clear();
  assert.equal(await reserve(ledger),true);
});

test('rejected transaction after put rolls back and never marks grant used',async()=>{
  const storage=disposableStorage(),ledger=durablePrepareGrantLedger(storage);
  await assert.rejects(ledger.transaction(async tx=>{
    await tx.get(key);
    await tx.put(key,claim);
    return false;
  }),/QA_PREPARE_DURABLE_GRANT_LEDGER_DENIED/);
  assert.equal(storage.persisted.size,0);
  assert.equal(await reserve(ledger),true);
});

test('bad storage, missing read/write or other failures are sanitized and denied',async()=>{
  assert.throws(()=>durablePrepareGrantLedger(null),/QA_PREPARE_DURABLE_GRANT_LEDGER_DENIED/);
  const storage={transaction:async fn=>fn({get:async()=>undefined})};
  await assert.rejects(reserve(durablePrepareGrantLedger(storage)),
    /QA_PREPARE_DURABLE_GRANT_LEDGER_DENIED/);
  const failing={transaction:async()=>{throw Error('SECRET INTERNAL STORAGE ERROR');}};
  await assert.rejects(reserve(durablePrepareGrantLedger(failing)),err=>{
    assert.equal(err.message,'QA_PREPARE_DURABLE_GRANT_LEDGER_DENIED');
    return true;
  });
});

test('prepare caller consumes grant before private binding; rejection never auto-retries',async()=>{
  const storage=disposableStorage(),ledger=durablePrepareGrantLedger(storage);
  const env={
    GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'Airtrust-Org/airtrust',
    GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
    GITHUB_SHA:sha,GITHUB_RUN_ID:runId,GITHUB_RUN_ATTEMPT:'1',
    FRMS_QA_PREPARE_CONFIRM:'AIRTRUST_FRMS_QA_PREPARE_ONLY_F0_APPROVED',
    FRMS_QA_PREPARE_GRANT_ID:grantId,FRMS_QA_CALLER_KEY_HEX:'f'.repeat(64),
  };
  let calls=0;
  const binding={prepare:async()=>{calls++;throw Error('synthetic transport failed');}};
  const verifier=async req=>({
    status:'VERIFIED_BY_INDEPENDENT_GITHUB_ADMIN_CHECK',
    schema:'AIRTRUST_FRMS_QA_PREPARE_GRANT_VERIFIED_V1',
    sha:req.sha,dbId:TARGET.db_id,tenantId:999013,
    grantId:req.grantId,runId:req.runId,runAttempt:req.runAttempt,
  });
  const args={env,binding,independentGrantVerifier:verifier,grantLedger:ledger};
  await assert.rejects(prepareViaPrivateServiceBinding(args),/QA_PRIVATE_CALLER_TRANSPORT_DENIED/);
  assert.equal(calls,1);
  assert.equal(storage.persisted.size,1);
  await assert.rejects(prepareViaPrivateServiceBinding(args),/QA_PRIVATE_CALLER_TRANSPORT_DENIED/);
  assert.equal(calls,1);
  assert.equal(storage.persisted.size,1);
});

test('no grant persistence before independent admin verifier succeeds',async()=>{
  const storage=disposableStorage(),ledger=durablePrepareGrantLedger(storage);
  await assert.rejects(prepareViaPrivateServiceBinding({
    env:{GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'Airtrust-Org/airtrust',
      GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
      GITHUB_SHA:sha,GITHUB_RUN_ID:runId,GITHUB_RUN_ATTEMPT:'1',
      FRMS_QA_PREPARE_CONFIRM:'AIRTRUST_FRMS_QA_PREPARE_ONLY_F0_APPROVED',
      FRMS_QA_PREPARE_GRANT_ID:grantId,FRMS_QA_CALLER_KEY_HEX:'f'.repeat(64)},
    binding:{prepare:async()=>{throw Error('must not run');}},
    independentGrantVerifier:async()=>({approved:true}),grantLedger:ledger,
  }),/QA_PRIVATE_CALLER_TRANSPORT_DENIED/);
  assert.equal(storage.persisted.size,0);
});
