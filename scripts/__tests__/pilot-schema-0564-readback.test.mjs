import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SQL, EXPECTED, STAGING_DB_ID, readback, validateReadback } from '../staging/pilot-schema-0564-readback.mjs';
const response=(row={...EXPECTED},meta={changed_db:false,rows_written:0,changes:0})=>({success:true,result:[{success:true,results:[row],meta}]});
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_D1_READONLY_API_TOKEN:'synthetic-only',RELEASE_SHA:'b'.repeat(40)};
test('fixed SELECT runs on SQLite and missing schema fails closed',()=>{
 const db=new DatabaseSync(':memory:');
 try{
 db.exec('CREATE TABLE airtrust_schema_baselines_v2 (baseline_id TEXT,status TEXT); CREATE TABLE airtrust_schema_changes_v2 (change_id TEXT,baseline_id TEXT,file_hash TEXT,plan_hash TEXT); CREATE TABLE cv_voo_abastecimentos (id INTEGER)');
 const row={...db.prepare(SQL).get()};
 assert.deepEqual(row,Object.fromEntries(Object.keys(EXPECTED).map(key=>[key,0])));
 assert.throws(()=>validateReadback(response(row)),/METADATA_MISMATCH/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cv_voo_abastecimentos').get().n,0);
 }finally{db.close();}
});
test('rejects each missing or drifted prerequisite and extra data',()=>{
 for(const key of Object.keys(EXPECTED))assert.throws(()=>validateReadback(response({...EXPECTED,[key]:0})),/METADATA_MISMATCH/);
 assert.throws(()=>validateReadback(response({...EXPECTED,pii:'must-not-pass'})),/METADATA_MISMATCH/);
 assert.throws(()=>validateReadback(response({...EXPECTED,ledger0564:'1'})),/METADATA_MISMATCH/);
});
test('requires positive read-only evidence, exactly one result and one row',()=>{
 for(const meta of [{},{changed_db:true,rows_written:0},{changed_db:false,rows_written:1},{changed_db:false,rows_written:0,changes:1}])
 assert.throws(()=>validateReadback(response({...EXPECTED},meta)),/NOT_PROVEN_READONLY/);
 assert.throws(()=>validateReadback({success:true,result:[]}),/RESPONSE_INVALID/);
 const r=response();r.result[0].results.push({...EXPECTED});assert.throws(()=>validateReadback(r),/ROW_INVALID/);
});
test('only pinned staging endpoint and fixed SELECT are sent; output is allowlisted',async()=>{
 const report=await readback(env,async(url,options)=>{
 assert.equal(url,`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${STAGING_DB_ID}/query`);
 assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
 assert.deepEqual(JSON.parse(options.body),{sql:SQL,params:[]});
 return {ok:true,json:async()=>response()};
 });
 assert.equal(report.schemaMetadata,'PASS');assert.equal(report.runtimeProvenance,'NOT_VERIFIED');
 assert.doesNotMatch(JSON.stringify(report),/synthetic-only|SELECT|Bearer/);
});
test('no fallback token or caller SQL; failures sanitized',async()=>{
 let calls=0;const request=async()=>{calls++;throw Error('secret raw body');};
 await assert.rejects(readback({...env,CLOUDFLARE_D1_READONLY_API_TOKEN:'',CLOUDFLARE_WORKER_API_TOKEN:'broad'},request),/READONLY_CREDENTIALS_REQUIRED/);
 await assert.rejects(readback({...env,RELEASE_SHA:'invalid'},request),/RELEASE_SHA_REQUIRED/);assert.equal(calls,0);
 await assert.rejects(readback(env,request),/^Error: PILOT_READBACK_TRANSPORT_FAILED$/);
 await assert.rejects(readback(env,async()=>({ok:false,status:403})),/HTTP_403/);
});

test('readback workflow uses only the dedicated D1 read-only credential',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/staging-pilot-schema-0564-readback.yml',import.meta.url),'utf8');
 assert.match(workflow,/CLOUDFLARE_D1_READONLY_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_D1_READONLY_API_TOKEN\s*\}\}/);
 assert.doesNotMatch(workflow,/CLOUDFLARE_D1_BACKUP_API_TOKEN/);
});
