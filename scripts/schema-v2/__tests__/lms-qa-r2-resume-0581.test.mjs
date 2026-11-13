// source_reference: AirTrust #2241, Schema V2 0581 exact-key R2 private recovery.
// operational_decision: local mocked HTTP only; never contacts Cloudflare in this test.
// dry_run_required: no production mutation; synthetic in-memory R2 objects only.
// rollback_plan_required: idempotent replay from immutable protected GitHub artifact.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';


test('R2 0581: interrupted removal resumes exact 132 QA keys without touching unrelated objects',async()=>{
 const base=mkdtempSync(join(tmpdir(),'airtrust-r2-0581-'));
 const filename=join(base,'airtrust-qa-lms-0581-r2-keys.json');
 const keys=Array.from({length:132},(_,i)=>({
   key:`certificados/empresa-6/funcionario-194/historico-${i+1}/aabbccdd.pdf`,
   employeeId:194,historyId:i+1,
 }));
 writeFileSync(filename,JSON.stringify(keys));
 const priorEnv={RUNNER_TEMP:process.env.RUNNER_TEMP,GITHUB_ACTIONS:process.env.GITHUB_ACTIONS,
   GITHUB_REF:process.env.GITHUB_REF,CLOUDFLARE_ACCOUNT_ID:process.env.CLOUDFLARE_ACCOUNT_ID,
   CLOUDFLARE_WORKER_API_TOKEN:process.env.CLOUDFLARE_WORKER_API_TOKEN,
   QA_R2_PURGE_CONFIRMATION:process.env.QA_R2_PURGE_CONFIRMATION};
 const prevFetch=globalThis.fetch;
 const deleted=new Set();
 const unrelated='certificados/empresa-6/funcionario-40/historico-100/aaaaaaaa.pdf';
 let firstAttempt=true;
 try{
   Object.assign(process.env,{
     RUNNER_TEMP:base,GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/main',
     CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_WORKER_API_TOKEN:'synthetic-only-token',
     QA_R2_PURGE_CONFIRMATION:'AIRTRUST_QA_R2_0581_POST_D1',
   });
   const previousArg=process.argv[2];
   process.argv[2]='r2-cleanup';
   const {r2Cleanup}=await import('../validate-lms-qa-0581.mjs?resume-fixture');
   process.argv[2]=previousArg;
   globalThis.fetch=async (url,options={})=>{
     const key=String(url).split('/objects/')[1];
     assert.ok(keys.some(x=>x.key===key),'no other bucket object can be touched: '+key);
     const method=options.method||'GET';
     if(method==='DELETE'){
       if(firstAttempt && deleted.size===65)return new Response(null,{status:503});
       if(deleted.has(key))return new Response(null,{status:404});
       deleted.add(key);
       return new Response(null,{status:204});
     }
     if(method==='GET')return new Response(null,{status:deleted.has(key)?404:206});
     throw Error('UNEXPECTED_METHOD');
   };
   await assert.rejects(r2Cleanup(),/R2_DELETE_FAILED/);
   assert.equal(deleted.size,65);
   firstAttempt=false;
   await r2Cleanup();
   assert.equal(deleted.size,132);
   assert.equal(deleted.has(unrelated),false);
 }finally{
   globalThis.fetch=prevFetch;
   for(const [key,val] of Object.entries(priorEnv)){
     if(val===undefined)delete process.env[key];else process.env[key]=val;
   }
   rmSync(base,{recursive:true,force:true});
 }
});
