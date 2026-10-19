// Disposable GET-only Cloudflare API simulation; zero external network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertPrivateConfig,inspectPrivateStagingResources,EXPECTED } from '../../ops/frms-qa-repair/verify-readiness.mjs';

const config=await readFile('ops/frms-qa-repair/wrangler.staging.toml','utf8');
const id='a'.repeat(32);
const state=()=>({
  database:{uuid:EXPECTED.d1Id,name:EXPECTED.d1Name},
  bucket:{name:EXPECTED.bucket},custom:{domains:[]},
  managed:{enabled:false},
  lifecycle:{rules:[{id:'Expire reviewed QA preimages',enabled:true,
    conditions:{prefix:EXPECTED.prefix},
    deleteObjectsTransition:{condition:{type:'Age',maxAge:86400}}}]},
});
function harness(overrides={}){
  const inventory={...state(),...overrides},paths=[];
  return {
    paths,
    fetcher:async(url,options)=>{
      const path=new URL(url).pathname;
      assert.equal(options.method,'GET');
      assert.equal(options.redirect,'manual');
      assert.equal(options.headers.Authorization,'Bearer disposable');
      paths.push(path);
      let key=path.endsWith('/domains/custom')?'custom':
        path.endsWith('/domains/managed')?'managed':
        path.endsWith('/lifecycle')?'lifecycle':
        path.includes('/d1/database/')?'database':'bucket';
      return Response.json({success:true,result:inventory[key]});
    },
  };
}
const check=h=>inspectPrivateStagingResources({accountId:id,token:'disposable',fetcher:h.fetcher});

test('pinned private config has exact staging D1/R2/DO and no HTTP exposure',()=>{
  assert.equal(assertPrivateConfig(config).d1Id,EXPECTED.d1Id);
  for(const replacement of [
    config.replace('workers_dev = false','workers_dev = true'),
    config.replace('preview_urls = false','preview_urls = true'),
    config.replace(EXPECTED.d1Id,'7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae'),
    config+'\n[[routes]]\npattern = "api.airtrust.online"',
    config.replace('bucket_name = "'+EXPECTED.bucket+'"','bucket_name = "airtrust-storage"'),
    config.replace('ENVIRONMENT = "staging"','ENVIRONMENT = "production"'),
    config+'\n[[r2_buckets]]\nbinding = "OTHER"\nbucket_name = "airtrust-storage"',
    config+'\nRELEASE_SHA = "'+'c'.repeat(40)+'"',
  ])assert.throws(()=>assertPrivateConfig(replacement),/^Error: QA_PRIVATE_CONFIG_/);
});

test('real remote attestation accepts exact named private resources using GET only',async()=>{
  const h=harness();const result=await check(h);
  assert.equal(result.verdict,'PRIVATE_STAGING_RESOURCES_READONLY_VERIFIED');
  assert.equal(result.writes,0);
  assert.equal(h.paths.length,5);
  assert.equal(h.paths.filter(p=>p.includes('domains/')).length,2);
});

test('wrong D1 or R2, public domains and no TTL are all fail closed',async()=>{
  for(const mutation of [
    {database:{uuid:'b'.repeat(32),name:EXPECTED.d1Name}},
    {bucket:{name:'airtrust-storage'}},
    {custom:{domains:[{domain:'public.example',enabled:false}]}},
    {managed:{enabled:true}},
    {lifecycle:{rules:[]}},
    {lifecycle:{rules:[{enabled:true,conditions:{prefix:'other'},
       deleteObjectsTransition:{condition:{type:'Age',maxAge:86400}}}]}},
    {lifecycle:{rules:[{enabled:true,conditions:{prefix:EXPECTED.prefix},
       deleteObjectsTransition:{condition:{type:'Age',maxAge:86401}}}]}},
  ])await assert.rejects(check(harness(mutation)),/QA_PRIVATE_/);
});

test('unknown API permissions/status and missing credentials reject without any write',async()=>{
  await assert.rejects(inspectPrivateStagingResources({accountId:id,token:''}),
    /QA_PRIVATE_READONLY_CREDENTIAL_MISSING/);
  const h=harness();
  h.fetcher=async()=>new Response(null,{status:403});
  await assert.rejects(check(h),/QA_PRIVATE_CF_READ_FAILED/);
  const h2=harness();
  h2.fetcher=async()=>Response.json({success:false,result:{}});
  await assert.rejects(check(h2),/QA_PRIVATE_CF_READ_FAILED/);
});
