// FRMS staging-only infrastructure attestation. READ-ONLY Cloudflare GETs.
// This never creates buckets, deploys Workers, writes D1/R2 or issues grants.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const EXPECTED = Object.freeze({
  worker:'airtrust-frms-qa-repair-staging-private',
  d1Id:'bf9963f4-eb12-439b-a830-20bbf577ac22',
  d1Name:'airtrust-db-staging-baseline-20260701',
  bucket:'airtrust-frms-qa-preimages-staging-private',
  prefix:'frms-qa/999013/',
});
const fail = code => { throw new Error(code); };
const sections = text => {
  const result = new Map([['root',[]]]);
  let section='root';
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();
    if(!line || line.startsWith('#'))continue;
    if(/^\[\[?[\w.]+\]\]?$/.test(line)){
      section=line.replace(/^\[+|\]+$/g,'');
      result.set(section,[...(result.get(section)||[]),[]]);
    } else {
      const list=result.get(section);
      if(!list)fail('QA_PRIVATE_CONFIG_MALFORMED');
      if(section==='root')list.push(line);
      else list.at(-1).push(line);
    }
  }
  return result;
};
const exact = (lines,key,value) =>
  lines.some(line=>line===key+' = '+value);
const only = (map, key) => {
  const val=map.get(key);
  if(!val||(key!=='root'&&val.length!==1))fail('QA_PRIVATE_CONFIG_BINDINGS_INVALID');
  return key==='root'?val:val[0];
};

export function assertPrivateConfig(text){
  if(typeof text!=='string'||/\bproduction\b|7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae/i.test(text))
    fail('QA_PRIVATE_CONFIG_PRODUCTION_REJECTED');
  const source=sections(text);
  if([...source.keys()].sort().join('|') !==
    ['root','vars','d1_databases','r2_buckets','durable_objects.bindings','migrations'].sort().join('|'))
    fail('QA_PRIVATE_CONFIG_EXTRA_BINDING_REJECTED');
  const root=only(source,'root');
  if(!exact(root,'name',JSON.stringify(EXPECTED.worker))||
     !exact(root,'main','"worker.mjs"')||
     !exact(root,'workers_dev','false')||
     !exact(root,'preview_urls','false')||
     !root.some(l=>l==='compatibility_flags = ["nodejs_compat"]')||
     root.some(l=>/^(route|routes|triggers|account_id|zone_id|services)\b/.test(l)))
    fail('QA_PRIVATE_CONFIG_EXPOSURE_REJECTED');
  const vars=only(source,'vars');
  if(!exact(vars,'ENVIRONMENT','"staging"')||
     !exact(vars,'D1_ID',JSON.stringify(EXPECTED.d1Id))||
     vars.some(l=>/RELEASE_SHA|PRIVATE_STORAGE_VERIFIED|APPROVAL_|PREIMAGE_|CALLER_/.test(l)))
    fail('QA_PRIVATE_CONFIG_SECRET_OR_SHA_REJECTED');
  const db=only(source,'d1_databases');
  const r2=only(source,'r2_buckets');
  const doBinding=only(source,'durable_objects.bindings');
  const migration=only(source,'migrations');
  if(!exact(db,'binding','"DB"')||
     !exact(db,'database_id',JSON.stringify(EXPECTED.d1Id))||
     !exact(db,'database_name',JSON.stringify(EXPECTED.d1Name))||
     !exact(r2,'binding','"PREIMAGES"')||
     !exact(r2,'bucket_name',JSON.stringify(EXPECTED.bucket))||
     !exact(doBinding,'name','"COORDINATOR"')||
     !exact(doBinding,'class_name','"FrmsQaCoordinator"')||
     !exact(migration,'new_sqlite_classes','["FrmsQaCoordinator"]'))
    fail('QA_PRIVATE_CONFIG_BINDINGS_INVALID');
  for(const [section,allowed] of Object.entries({
    root:['name','main','compatibility_date','compatibility_flags','workers_dev','preview_urls'],
    vars:['ENVIRONMENT','D1_ID'],
    d1_databases:['binding','database_name','database_id'],
    r2_buckets:['binding','bucket_name'],
    'durable_objects.bindings':['name','class_name'],
    migrations:['tag','new_sqlite_classes'],
  })){
    const lines=only(source,section);
    if(lines.some(l=>!allowed.includes(l.split(/\s*=\s*/)[0]))||
      new Set(lines.map(l=>l.split(/\s*=\s*/)[0])).size!==lines.length)
      fail('QA_PRIVATE_CONFIG_EXTRA_BINDING_REJECTED');
  }
  return EXPECTED;
}

function assertInventory({database,bucket,custom,managed,lifecycle}){
  if(database?.uuid!==EXPECTED.d1Id||database?.name!==EXPECTED.d1Name)
    fail('QA_PRIVATE_D1_BINDING_UNVERIFIED');
  if(bucket?.name!==EXPECTED.bucket)
    fail('QA_PRIVATE_R2_BUCKET_MISSING');
  if(!Array.isArray(custom?.domains)||custom.domains.length!==0||managed?.enabled!==false)
    fail('QA_PRIVATE_R2_PUBLIC_ACCESS_REJECTED');
  const allowed=Array.isArray(lifecycle?.rules)&&lifecycle.rules.some(r=>
    r.enabled===true && r.conditions?.prefix===EXPECTED.prefix &&
    r.deleteObjectsTransition?.condition?.type==='Age' &&
    Number.isInteger(r.deleteObjectsTransition.condition.maxAge) &&
    r.deleteObjectsTransition.condition.maxAge>0 &&
    r.deleteObjectsTransition.condition.maxAge<=86400);
  if(!allowed)fail('QA_PRIVATE_R2_RETENTION_UNVERIFIED');
  return {
    verdict:'PRIVATE_STAGING_RESOURCES_READONLY_VERIFIED',
    dbId:EXPECTED.d1Id,bucket:EXPECTED.bucket,public:false,
    maxRetentionSeconds:86400,writes:0,
  };
}

/** Injection is for disposable tests. Real runner must supply least-privilege GET token. */
export async function inspectPrivateStagingResources({accountId,token,fetcher=fetch}){
  if(!/^[a-f0-9]{32}$/.test(String(accountId))||!String(token||'').trim())
    fail('QA_PRIVATE_READONLY_CREDENTIAL_MISSING');
  const base='https://api.cloudflare.com/client/v4/accounts/'+accountId;
  const bucket=encodeURIComponent(EXPECTED.bucket);
  const get=async path=>{
    const r=await fetcher(base+path,{method:'GET',redirect:'manual',
      headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
    if(!r.ok)fail('QA_PRIVATE_CF_READ_FAILED');
    const body=await r.json();
    if(body?.success!==true||body?.result===undefined)
      fail('QA_PRIVATE_CF_READ_FAILED');
    return body.result;
  };
  const [database,bucketState,custom,managed,lifecycle]=await Promise.all([
    get('/d1/database/'+EXPECTED.d1Id),
    get('/r2/buckets/'+bucket),
    get('/r2/buckets/'+bucket+'/domains/custom'),
    get('/r2/buckets/'+bucket+'/domains/managed'),
    get('/r2/buckets/'+bucket+'/lifecycle'),
  ]);
  return assertInventory({database,bucket:bucketState,custom,managed,lifecycle});
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{
    const config=await readFile(new URL('./wrangler.staging.toml',import.meta.url),'utf8');
    assertPrivateConfig(config);
    const verified=await inspectPrivateStagingResources({
      accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
      token:process.env.CLOUDFLARE_FRMS_QA_READ_API_TOKEN,
    });
    console.log(JSON.stringify(verified));
  }catch(e){
    // Never echo Cloudflare response content, tokens, raw R2 or preimages.
    const message=/^QA_[A-Z0-9_]+$/.test(e.message)?e.message:
      'QA_PRIVATE_READINESS_FAILED_CLOSED';
    console.error(message);
    process.exitCode=2;
  }
}
