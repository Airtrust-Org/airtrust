#!/usr/bin/env node
/** Main-owned Player3 QA executor: synthetic-only, SHA-pinned, staging-only.
 * No user-controlled SQL or target names, no original courses or production.
 * Immutable QA fixtures require governed retirement, never blind DELETE.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {isExplicitMissingR2Object} from './player3-qa-r2-object-miss.mjs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const E=process.env;
const ROOT=process.cwd(), RELEASE=path.join(ROOT,'release');
const TEMP=path.join(E.RUNNER_TEMP||'/tmp','player3-qa');
const CAND=path.join(TEMP,'candidate'), SQL=path.join(TEMP,'plan.sql');
const PLAN=path.join(TEMP,'publication.json');
const PRE=path.join(TEMP,'d1-preimage.json');
const REC=path.join(TEMP,'d1-recovery.json');
const VERIFIED=path.join(TEMP,'content-verified.json');
const DB='airtrust-db-staging-baseline-20260701';
const BUCKET='airtrust-storage-staging';
const PROJECT='qa-player3-staging';
const ORIGIN='https://qa-player3-staging.pages.dev';
const AR='07d9a165a7840b548aee339354054885d437d19909537ead6e5eab4b71449c8e';
const SO='71fdbe8714a10b965507490fdd5d148a2bbb205185615ed4f6a0c8e82e7c4ea9';
const PO='20f10008389fb08db6abb73ae0f00908ad3cd457cb730e16086af4cefc3cd7c6';
const BA='b6317fb1a187fababb7a909943a65aa822741dc7a327433412e06f5e67a69216';
export const PIN=Object.freeze({
 'scripts/learning-factory/generate_player3_technical_zip.py':'a6c178bbddf132088007989300ec9f7c0ebd4943d68a53e7736066dfabd22bca',
 'worker-airtrust/package-lock.json':'6b5f8dbed586c6e67ebbf16dda5c157d5e16be621a81e136f530896cc69c45f6',
 'scripts/staging/build_player3_qa_catalog_sql_plan.py':'ad01d77112639fac1216b1bdc120b13c8fd7c8861513193bf0bdc36231745adc',
 'scripts/staging/player3-qa-governed-publisher.py':'a9d279306411c5af9063cd5f85de4fd4e6d78f3910ea07cfcca92a410f6224a0',
 'scripts/learning-factory/prepare_player3_technical_candidate.py':'1cf8cbe4e19e06115c511d091e01fa0854ae663c5c1b5fb22259617217f80a4b',
 'scripts/learning-factory/build_player3_qa_publication_plan.py':'e517317068f4bbab4f61ab8896f0cdcc03f4934f6feeeeee87d2fc0b14a7df92'
});
const WR=path.join(RELEASE,'worker-airtrust/node_modules/.bin/wrangler');
const PH=E.QA_PHASE, CID=Number(E.QA_COURSE_ID), APPROVER=Number(E.QA_APPROVER_ID);
function demand(ok,code){if(!ok)throw Error(code);}
function hash(data){return createHash('sha256').update(data).digest('hex');}
function fileHash(file){return hash(fs.readFileSync(file));}
function cleanRun(exe,args,cwd=RELEASE){
 try{return execFileSync(exe,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],
                                  maxBuffer:4194304,timeout:120000});}
 catch{throw Error('PLAYER3_GOVERNED_EXECUTION_FAILED');}
}
function save(file,data){fs.writeFileSync(file,data,{mode:0o600,flag:'wx'});}
function validateLocal(){
 demand(E.GITHUB_ACTIONS==='true' && E.GITHUB_REF==='refs/heads/main' &&
        E.GITHUB_REPOSITORY==='Airtrust-Org/airtrust' &&
        /^[0-9a-f]{40}$/.test(E.QA_RELEASE_SHA||'') &&
        ['bootstrap','publish','edition'].includes(PH),
        'PLAYER3_TRUSTED_MAIN_ONLY');
 for(const [name,expected] of Object.entries(PIN)){
   const p=path.join(RELEASE,name);
   demand(fs.existsSync(p)&&fileHash(p)===expected,'PLAYER3_REVIEWED_F4_CODE_DRIFT');
 }
 demand(Number.isSafeInteger(CID)&&CID>=0&&
        Number.isSafeInteger(APPROVER)&&APPROVER>=0,'PLAYER3_ID_OUT_OF_SCOPE');
}
function cloudflare(){
 demand(E.CLOUDFLARE_API_TOKEN&&E.CLOUDFLARE_ACCOUNT_ID&&fs.existsSync(WR),
        'PLAYER3_SCOPED_CLOUDFLARE_STAGING_TOKEN_REQUIRED');
}
async function doAccess(mode){
  validateLocal();
  demand(E.CLOUDFLARE_API_TOKEN&&E.CLOUDFLARE_ACCOUNT_ID,
         'PLAYER3_SCOPED_STAGING_CREDENTIAL_MISSING');
  const options={
    'access-pages':['pages/projects/'+PROJECT,PROJECT,'PLAYER3_QA_PAGES_TOKEN_SCOPE_MISSING'],
    'access-r2':['r2/buckets/'+BUCKET,BUCKET,'PLAYER3_QA_R2_TOKEN_SCOPE_MISSING']
  };
  const target=options[mode];
  demand(target,'PLAYER3_UNSUPPORTED_CREDENTIAL_PROBE');
  let response,body;
  try{
    response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+
      E.CLOUDFLARE_ACCOUNT_ID+'/'+target[0],{
        headers:{Authorization:'Bearer '+E.CLOUDFLARE_API_TOKEN},
        signal:AbortSignal.timeout(15000)});
    body=await response.json();
  }catch{throw Error(target[2]);}
  demand(response.ok&&body?.success===true&&body?.result?.name===target[1],target[2]);
  console.log(mode==='access-pages'?'PLAYER3_EXISTING_PAGES_STAGING_ACCESS_PASS':
                                    'PLAYER3_EXISTING_WORKER_R2_STAGING_ACCESS_PASS');
}
function readD1(statement){
 cloudflare();
 const output=cleanRun(WR,['d1','execute',DB,'--env','staging','--remote',
                           '--json','--command='+statement],
                       path.join(RELEASE,'worker-airtrust'));
 const data=JSON.parse(output);
 demand(Array.isArray(data)&&data.length===1&&data[0].success===true&&
        data[0].meta?.changed_db===false&&data[0].meta?.rows_written===0&&
        Array.isArray(data[0].results),'PLAYER3_D1_NOT_PROVEN_READONLY');
 return data[0].results;
}
// This workflow provisions a SECOND QA course. Never rebind old course 327.
export function assertV2QaSnapshot(r,phase,courseId){
 demand(r?.tenant===1&&r.s61===1&&r.s62===1&&
        r.v1_course===1&&r.v1_marker===1&&
        r.v1_edition===1&&r.v1_policy===1,
        'PLAYER3_V1_IMMUTABLE_QA_BASELINE_MISSING');
 if(phase==='bootstrap'){
  demand(courseId===0&&r.types===0&&r.courses===0&&r.course_id===0&&
         r.markers===0&&r.editions===0&&r.policies===0&&r.enrolled===0,
         'PLAYER3_V2_BOOTSTRAP_NOT_FRESH');
 }else{
  demand((phase==='publish'||phase==='edition')&&
         Number.isSafeInteger(courseId)&&courseId>0&&
         r.types===1&&r.courses===1&&r.course_id===courseId&&r.markers===1&&
         r.editions===0&&r.policies===0&&r.enrolled===0,
         'PLAYER3_V2_PUBLISH_OR_EDITION_STATE_DRIFT');
 }
 return r;
}
function snapshot(){
 const q=[
 "SELECT",
 "(SELECT COUNT(*) FROM empresas WHERE id=999006 AND codigo='qa_examiner_training' AND ativo=1 AND deleted_at IS NULL) AS tenant,",
 "(SELECT COUNT(*) FROM airtrust_schema_changes_v2 WHERE change_id='lms-native-catalog-activation-0561') AS s61,",
 "(SELECT COUNT(*) FROM airtrust_schema_changes_v2 WHERE change_id='lms-player3-canonical-terminal-0562') AS s62,",
 "(SELECT COUNT(*) FROM lms_cursos WHERE id=327 AND empresa_id=999006 AND titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC' AND version_tag='qa-player3-native-synthetic-v1' AND tipo_conteudo='scorm' AND deleted_at IS NULL) AS v1_course,",
 "(SELECT COUNT(*) FROM lms_native_catalog_activation WHERE empresa_id=999006 AND curso_id=327) AS v1_marker,",
 "(SELECT COUNT(*) FROM lms_native_edicoes WHERE empresa_id=999006 AND curso_id=327 AND artifact_sha256='0dcbbb7d50235d2e37d2c1ddda16c1f55cb2482551a6cf3a3a420829cf642b8f' AND status='PUBLISHED') AS v1_edition,",
 "(SELECT COUNT(*) FROM lms_player3_politicas WHERE empresa_id=999006 AND curso_id=327 AND estado='APPROVED') AS v1_policy,",
 "(SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=999006 AND codigo='QA-PLAYER3-NATIVE-TYPE-V2' AND ativo=1 AND deleted_at IS NULL) AS types,",
 "(SELECT COUNT(*) FROM lms_cursos WHERE empresa_id=999006 AND titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC-V2' AND version_tag='qa-player3-native-synthetic-v2' AND deleted_at IS NULL) AS courses,",
 "(SELECT COALESCE(MAX(id),0) FROM lms_cursos WHERE empresa_id=999006 AND titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC-V2' AND version_tag='qa-player3-native-synthetic-v2' AND deleted_at IS NULL) AS course_id,",
 "(SELECT COUNT(*) FROM lms_native_catalog_activation a JOIN lms_cursos c ON c.id=a.curso_id AND c.empresa_id=a.empresa_id WHERE a.empresa_id=999006 AND c.titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC-V2' AND c.version_tag='qa-player3-native-synthetic-v2' AND c.deleted_at IS NULL) AS markers,",
 "(SELECT COUNT(*) FROM lms_native_edicoes ed JOIN lms_cursos c ON c.id=ed.curso_id AND c.empresa_id=ed.empresa_id WHERE ed.empresa_id=999006 AND c.titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC-V2' AND c.version_tag='qa-player3-native-synthetic-v2') AS editions,",
 "(SELECT COUNT(*) FROM lms_player3_politicas p JOIN lms_cursos c ON c.id=p.curso_id AND c.empresa_id=p.empresa_id WHERE p.empresa_id=999006 AND c.titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC-V2' AND c.version_tag='qa-player3-native-synthetic-v2') AS policies,",
 "(SELECT COUNT(*) FROM lms_matriculas m JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id WHERE m.empresa_id=999006 AND c.titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC-V2' AND c.version_tag='qa-player3-native-synthetic-v2') AS enrolled"
 ].join(' ');
 const rows=readD1(q);
 demand(rows.length===1,'PLAYER3_QA_DB_NOT_UNIQUE');
 return assertV2QaSnapshot(rows[0],PH,CID);
}
function hasVerifiedBookmark(value){
 if(!value || typeof value!=='object')return false;
 return Object.entries(value).some(([key,item])=>
  (/bookmark/i.test(key) && typeof item==='string' && item.trim().length>0) ||
  (item && typeof item==='object' && hasVerifiedBookmark(item)));
}
function prepared(){
 demand(fs.existsSync(CAND)&&fs.existsSync(PRE)&&fs.existsSync(REC),
        'PLAYER3_PREPARE_AND_D1_RECOVERY_REQUIRED');
 const rec=JSON.parse(fs.readFileSync(REC,'utf8'));
 demand(hasVerifiedBookmark(rec),
        'PLAYER3_RECOVERY_POINT_INVALID');
 return JSON.parse(fs.readFileSync(PRE,'utf8'));
}
function publication(){
 demand(fs.existsSync(PLAN)&&fileHash(PLAN)===E.QA_PLAN_SHA,
        'PLAYER3_APPROVED_PUBLICATION_SHA_REQUIRED');
 const doc=JSON.parse(fs.readFileSync(PLAN,'utf8'));
 demand(doc.targetTenantId===999006&&doc.targetCourseId===CID&&
        doc.releaseSha===E.QA_RELEASE_SHA&&doc.artifactSha256===AR&&
        doc.publicHtml5Origin===ORIGIN&&
        doc.stagedR2Prefix==='lms/native/999006/'+CID+'/'+AR+'/'&&
        doc.privateR2Objects?.length===4&&doc.publicHtml5Objects?.length===2,
        'PLAYER3_PUBLICATION_NOT_QA_SCOPED');
 return doc;
}
async function verifyBytes(doc){
 cloudflare();
 for(const obj of doc.privateR2Objects){
  demand(obj.key.startsWith('lms/native/999006/'+CID+'/'+AR+'/'),
         'PLAYER3_CROSS_TENANT_R2_OBJECT_DENIED');
  const dest=path.join(TEMP,'proof-'+obj.key.split('/').at(-1));
  cleanRun(WR,['r2','object','get',BUCKET+'/'+obj.key,'--remote',
               '--file='+dest],path.join(RELEASE,'worker-airtrust'));
  demand(fs.existsSync(dest)&&fileHash(dest)===obj.sha256&&
         fs.statSync(dest).size===obj.bytes,'PLAYER3_PRIVATE_R2_HASH_MISMATCH');
 }
 for(const obj of doc.publicHtml5Objects){
  demand(obj.url.startsWith(ORIGIN+'/qa/player3/999006/'+CID+'/'+AR+'/'),
         'PLAYER3_THIRD_HTTPS_ORIGIN_INVALID');
  const response=await fetch(obj.url,{signal:AbortSignal.timeout(25000),
                                      headers:{'Cache-Control':'no-cache'}});
  demand(response.ok&&response.status===200,'PLAYER3_QA_HTTPS_NOT_FOUND');
  const data=Buffer.from(await response.arrayBuffer());
  demand(data.length===obj.bytes&&hash(data)===obj.sha256,
         'PLAYER3_QA_HTTPS_BYTE_HASH_INVALID');
 }
}
function doPrepare(){
 validateLocal();
 demand(!fs.existsSync(CAND)&&!fs.existsSync(PLAN)&&!fs.existsSync(SQL),
        'PLAYER3_PRIVATE_PLAN_REUSE_DENIED');
 fs.mkdirSync(TEMP,{recursive:true,mode:0o700});
 cleanRun('python3',['scripts/learning-factory/prepare_player3_technical_candidate.py',
   '--out',CAND,'--parent-origin','https://staging.airtrust.pages.dev',
   '--course-id','qa-player3-synthetic']);
 const manifest=JSON.parse(fs.readFileSync(path.join(CAND,'manifest.json'),'utf8'));
 demand(manifest.editionSha256===AR&&manifest.sourceZipSha256===SO&&
        manifest.policySha256===PO&&manifest.privateBankSha256===BA&&
        manifest.remoteWrites===false,'PLAYER3_FROZEN_SYNTHETIC_ARTIFACT_CHANGED');
 if(PH==='bootstrap'){
  cleanRun('python3',['scripts/staging/build_player3_qa_catalog_sql_plan.py',
    '--phase','bootstrap','--candidate',CAND,'--release-sha',E.QA_RELEASE_SHA,
    '--out',SQL]);
 }else{
  cleanRun('python3',['scripts/learning-factory/build_player3_qa_publication_plan.py',
    '--candidate',CAND,'--tenant-id','999006','--course-id',String(CID),
    '--release-sha',E.QA_RELEASE_SHA,'--content-origin',ORIGIN,'--out',PLAN]);
  publication();
  if(PH==='edition'){
   cleanRun('python3',['scripts/staging/build_player3_qa_catalog_sql_plan.py',
     '--phase','edition','--candidate',CAND,'--publication-plan',PLAN,
     '--approver-user-id',String(APPROVER),'--out',SQL]);
  }
 }
 if(PH!=='publish')
  demand(fileHash(SQL)===E.QA_SQL_SHA,'PLAYER3_GENERATED_SQL_HASH_NOT_APPROVED');
 console.log('PLAYER3_PINNED_OFFLINE_PLAN_READY_NO_WRITES');
}
function doPreflight(){
 validateLocal();cloudflare();fs.mkdirSync(TEMP,{recursive:true,mode:0o700});
 const row=snapshot();save(PRE,JSON.stringify(row));
 const stamp=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
 const raw=cleanRun(WR,['d1','time-travel','info',DB,'--env','staging',
                       '--timestamp='+stamp,'--json'],path.join(RELEASE,'worker-airtrust'));
 const data=JSON.parse(raw);
 demand(hasVerifiedBookmark(data),
        'PLAYER3_TIME_TRAVEL_BOOKMARK_MISSING');
 save(REC,JSON.stringify(data));
 console.log('PLAYER3_D1_RECOVERY_TIMESTAMP_UTC='+stamp);
 console.log('PLAYER3_D1_RECOVERY_RECEIPT_SHA256='+hash(Buffer.from(JSON.stringify(data))));
 if(PH==='publish'){
  demand(E.GITHUB_OUTPUT,'PLAYER3_TRUSTED_WORKFLOW_OUTPUT_REQUIRED');
  const proof=hash(Buffer.from(JSON.stringify({
    sha:E.QA_RELEASE_SHA,phase:PH,courseId:CID,planSha:E.QA_PLAN_SHA,
    snapshot:row,bookmarkSha:hash(Buffer.from(JSON.stringify(data)))
  })));
  fs.appendFileSync(E.GITHUB_OUTPUT,'d1_ready='+proof+'\n');
 }
 console.log('PLAYER3_D1_READONLY_PREIMAGE_AND_PRIVATE_TIME_TRAVEL_RECEIPT');
}
async function doVerify(){
 validateLocal();cloudflare();
 demand(PH==='edition','PLAYER3_PRIVATE_VERIFY_EDITION_ONLY');
 await verifyBytes(publication());
 demand(E.GITHUB_OUTPUT,'PLAYER3_TRUSTED_WORKFLOW_OUTPUT_REQUIRED');
 fs.appendFileSync(E.GITHUB_OUTPUT,'verified_plan_sha='+E.QA_PLAN_SHA+'\n');
 console.log('PLAYER3_PRIVATE_R2_AND_THIRD_ORIGIN_VERIFIED');
}
function postD1(){
 // An immutable original course and its historical learner pins must survive.
 const original=readD1("SELECT (SELECT COUNT(*) FROM lms_cursos WHERE id=327 AND empresa_id=999006 AND titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC' AND version_tag='qa-player3-native-synthetic-v1') AS course, (SELECT COUNT(*) FROM lms_native_catalog_activation WHERE empresa_id=999006 AND curso_id=327) AS marker, (SELECT COUNT(*) FROM lms_native_edicoes WHERE empresa_id=999006 AND curso_id=327 AND artifact_sha256='0dcbbb7d50235d2e37d2c1ddda16c1f55cb2482551a6cf3a3a420829cf642b8f' AND status='PUBLISHED') AS edition, (SELECT COUNT(*) FROM lms_player3_politicas WHERE empresa_id=999006 AND curso_id=327 AND estado='APPROVED') AS policy");
 demand(original.length===1&&original[0].course===1&&original[0].marker===1&&original[0].edition===1&&original[0].policy===1,'PLAYER3_V1_BASELINE_CHANGED');

 if(PH==='bootstrap'){
  const rows=readD1("SELECT c.id FROM lms_cursos c JOIN lms_native_catalog_activation a ON a.curso_id=c.id AND a.empresa_id=c.empresa_id JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id AND qc.empresa_id=qt.empresa_id WHERE c.empresa_id=999006 AND c.titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC-V2' AND c.version_tag='qa-player3-native-synthetic-v2' AND c.tipo_conteudo='scorm' AND c.scorm_launch_file IS NULL AND c.scorm_package_r2_prefix IS NULL AND qc.lms_integrada=1 AND qt.codigo='QA-PLAYER3-NATIVE-TYPE-V2'");
  demand(rows.length===1&&Number.isSafeInteger(rows[0].id),
         'PLAYER3_BOOTSTRAP_PHYSICAL_READBACK_MISSING');
  console.log('PLAYER3_QA_PHYSICAL_COURSE_ID='+rows[0].id);
 }else{
  const sql="SELECT ed.id FROM lms_native_edicoes ed JOIN lms_player3_politicas p ON p.edicao_id=ed.id AND p.empresa_id=ed.empresa_id AND p.curso_id=ed.curso_id WHERE ed.empresa_id=999006 AND ed.curso_id="+CID+" AND ed.status='PUBLISHED' AND ed.artifact_sha256='"+AR+"' AND p.estado='APPROVED' AND p.bank_sha256='"+BA+"' AND p.policy_sha256='"+PO+"' AND p.approver_user_id="+APPROVER;
  const rows=readD1(sql);
  demand(rows.length===1&&Number.isSafeInteger(rows[0].id),
         'PLAYER3_EDITION_POLICY_D1_READBACK_MISSING');
  console.log('PLAYER3_QA_PHYSICAL_EDITION_ID='+rows[0].id);
 }
}
const R2_PROOF=path.join(TEMP,'r2-upload-verified.json');
function validatePublishInputs(){
  validateLocal();cloudflare();
  demand(PH==='publish'&&/^[a-f0-9]{64}$/.test(E.QA_D1_PREFLIGHT_OK||''),
         'PLAYER3_PUBLISH_REQUIRES_GOVERNED_D1_PREFLIGHT');
  demand(E.PLAYER3_QA_APPROVED_SHA===E.QA_RELEASE_SHA&&
         E.PLAYER3_QA_LOCK_GRANTED==='airtrust-staging-mutations-and-scorm-qa'&&
         E.PLAYER3_QA_PHYSICAL_COURSE_VERIFIED==='true'&&
         E.PLAYER3_QA_RECOVERY_POINT_VERIFIED==='true'&&
         E.PLAYER3_QA_PAGES_PROJECT===PROJECT&&
         E.PLAYER3_QA_R2_BUCKET===BUCKET&&
         E.CONFIRM_STAGING_PLAYER3_QA_PUBLISH==='AIRTRUST_STAGING_PLAYER3_SYNTHETIC_PUBLISH',
         'PLAYER3_F0_APPROVAL_LOCK_RECOVERY_AND_TARGET_REQUIRED');
  const doc=publication();
  // The exact F4 SHA-pinned publisher recomputes and verifies this plan
  // without performing remote operations. Only main-owned steps below write.
  cleanRun('python3',['scripts/staging/player3-qa-governed-publisher.py',
    '--candidate',CAND,'--plan',PLAN,'--pages-project',PROJECT]);
  return doc;
}
function expectedR2Proof(doc){
  return hash(Buffer.from(JSON.stringify({
    releaseSha:E.QA_RELEASE_SHA,courseId:CID,planSha:E.QA_PLAN_SHA,
    d1Proof:E.QA_D1_PREFLIGHT_OK,
    objects:doc.privateR2Objects.map(x=>[x.key,x.sha256,x.bytes])
  })));
}
function getRemoteR2(key,target){
  const result=spawnSync(WR,['r2','object','get',BUCKET+'/'+key,'--remote',
    '--file='+target],{cwd:path.join(RELEASE,'worker-airtrust'),
    encoding:'utf8',maxBuffer:4194304,timeout:90000});
  if(result.status===0)return true;
  const summary=(result.stderr||'')+' '+(result.stdout||'');
  if(!result.error&&isExplicitMissingR2Object(summary))
    return false;
  throw Error('PLAYER3_R2_GET_DENIED_OR_UNVERIFIED');
}
function assertRemoteR2(file,obj){
  demand(fs.existsSync(file)&&fileHash(file)===obj.sha256&&
    fs.statSync(file).size===obj.bytes,'PLAYER3_PRIVATE_R2_HASH_MISMATCH');
}
async function doPublishR2(){
  const doc=validatePublishInputs();
  await doAccess('access-r2');
  demand(!fs.existsSync(R2_PROOF),'PLAYER3_R2_PROOF_REPLAY_DENIED');
  for(const [index,obj] of doc.privateR2Objects.entries()){
    const name=path.basename(obj.key);
    demand(obj.key.startsWith('lms/native/999006/'+CID+'/'+AR+'/')&&
      /^[a-zA-Z0-9._-]{1,128}$/.test(name),
      'PLAYER3_R2_OBJECT_SCOPE_INVALID');
    const file=path.join(CAND,'private',name);
    demand(fs.existsSync(file)&&fs.statSync(file).isFile()&&
      fileHash(file)===obj.sha256&&fs.statSync(file).size===obj.bytes,
      'PLAYER3_R2_LOCAL_HASH_MISMATCH');
    const retrieved=path.join(TEMP,'r2-readback-'+index);
    demand(!fs.existsSync(retrieved),'PLAYER3_R2_TEMP_REPLAY_DENIED');
    let exists=getRemoteR2(obj.key,retrieved);
    if(exists){
      assertRemoteR2(retrieved,obj);
    }else{
      cleanRun(WR,['r2','object','put',BUCKET+'/'+obj.key,'--remote',
        '--file='+file,'--content-type=application/json'],
        path.join(RELEASE,'worker-airtrust'));
      exists=getRemoteR2(obj.key,retrieved);
      demand(exists,'PLAYER3_R2_PUT_NOT_READABLE');
      assertRemoteR2(retrieved,obj);
    }
  }
  save(R2_PROOF,JSON.stringify({digest:expectedR2Proof(doc)}));
  console.log('PLAYER3_PRIVATE_R2_ALL_FOUR_OBJECTS_VERIFIED');
}
/** Pages' canonical QA domain may briefly 404 while a first deploy propagates.
 * Retries are bounded, read-only and strictly compare SHA-256/bytes on 200.
 */
export async function verifyQaAssetWithRetry(item,prefix,{
  fetcher=fetch,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  attempts=9,intervalMs=4000
}={}){
  demand(Number.isInteger(attempts)&&attempts>=1&&attempts<=9,
    'PLAYER3_QA_HTTPS_RETRY_SCOPE_INVALID');
  demand(item.url.startsWith(prefix)&&
    ['index.html','app.js'].includes(item.url.slice(prefix.length)),
    'PLAYER3_QA_PUBLIC_ASSET_SCOPE_INVALID');
  for(let i=0;i<attempts;i++){
    let response;
    try{
      response=await fetcher(item.url,{
        signal:AbortSignal.timeout(12000),headers:{'Cache-Control':'no-cache'}});
    }catch{
      if(i===attempts-1)throw Error('PLAYER3_QA_HTTPS_NOT_FOUND');
      await sleep(intervalMs);
      continue;
    }
    if(response.status===200){
      const bytes=Buffer.from(await response.arrayBuffer());
      demand(bytes.length===item.bytes&&hash(bytes)===item.sha256,
        'PLAYER3_QA_HTTPS_BYTE_HASH_INVALID');
      return;
    }
    // Only propagation/transient states are retryable. Auth fails closed.
    demand([404,429,502,503,504].includes(response.status),
      'PLAYER3_QA_HTTPS_NOT_FOUND');
    if(i===attempts-1)throw Error('PLAYER3_QA_HTTPS_NOT_FOUND');
    await sleep(intervalMs);
  }
}
async function verifyPublicHttps(doc){
  const prefix=ORIGIN+'/qa/player3/999006/'+CID+'/'+AR+'/';
  for(const item of doc.publicHtml5Objects)
    await verifyQaAssetWithRetry(item,prefix);
}
async function doPublishPages(){
  const doc=validatePublishInputs();
  const receipt=fs.existsSync(R2_PROOF)?
    JSON.parse(fs.readFileSync(R2_PROOF,'utf8')):null;
  demand(receipt?.digest===expectedR2Proof(doc),
    'PLAYER3_PRIVATE_R2_STEP_PROOF_REQUIRED');
  await doAccess('access-pages');
  const prefix=ORIGIN+'/qa/player3/999006/'+CID+'/'+AR+'/';
  const zip=path.join(CAND,'browser/player3-technical-only.zip');
  const names=[];
  const site=path.join(TEMP,'site');
  for(const item of doc.publicHtml5Objects){
    const name=item.url.startsWith(prefix)?item.url.slice(prefix.length):'';
    demand(['index.html','app.js'].includes(name),'PLAYER3_PUBLIC_ASSET_SCOPE_INVALID');
    names.push(name);
    let bytes;
    try{bytes=execFileSync('unzip',['-p',zip,name],{
      encoding:null,maxBuffer:4194304,timeout:30000});}
    catch{throw Error('PLAYER3_PINNED_BROWSER_ASSET_UNREADABLE');}
    demand(bytes.length===item.bytes&&hash(bytes)===item.sha256,
      'PLAYER3_PINNED_BROWSER_ASSET_DRIFT');
    const target=path.join(site,'qa','player3','999006',String(CID),AR,name);
    fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
    fs.writeFileSync(target,bytes,{mode:0o600,flag:'wx'});
  }
  demand(names.sort().join('|')==='app.js|index.html','PLAYER3_PUBLIC_ASSET_SET_INVALID');
  // Main is the production branch of the isolated qa-player3-staging Pages
  // project, NOT the AirTrust application project or production environment.
  cleanRun(WR,['pages','deploy',site,'--project-name='+PROJECT,
    '--branch=main','--commit-hash='+E.QA_RELEASE_SHA],RELEASE);
  await verifyPublicHttps(doc);
  console.log('PLAYER3_ISOLATED_QA_PAGES_AND_PRIVATE_R2_VERIFIED');
}
async function doApply(){
  validateLocal();cloudflare();
  demand(PH!=='publish','PLAYER3_SPLIT_PUBLISH_MODES_REQUIRED');
  const before=prepared();
  demand(fs.existsSync(SQL)&&fileHash(SQL)===E.QA_SQL_SHA,
         'PLAYER3_SQL_PLAN_TAMPERED');
  demand(JSON.stringify(snapshot())===JSON.stringify(before),
         'PLAYER3_D1_CHANGED_SINCE_TIME_TRAVEL_PREIMAGE');
  if(PH==='edition'){
    demand(/^[a-f0-9]{64}$/.test(E.QA_R2_VERIFIED_PLAN_SHA||'') &&
           E.QA_R2_VERIFIED_PLAN_SHA===E.QA_PLAN_SHA,
           'PLAYER3_R2_HTTPS_PREPUBLICATION_PROOF_MISSING');
  }
  cleanRun(WR,['d1','execute',DB,'--env','staging','--remote','--json',
    '--file='+SQL],path.join(RELEASE,'worker-airtrust'));
  postD1();
  console.log('PLAYER3_PROTECTED_D1_PHASE_PUBLISHED_AND_READBACK_VERIFIED');
}
async function main(){
 const mode=process.argv[2];
 try{
  if(mode==='access-pages'||mode==='access-r2')await doAccess(mode);
  else if(mode==='publish-r2')await doPublishR2();
  else if(mode==='publish-pages')await doPublishPages();
  else if(mode==='prepare')doPrepare();
  else if(mode==='preflight')doPreflight();
  else if(mode==='verify')await doVerify();
  else if(mode==='apply')await doApply();
  else demand(false,'PLAYER3_GOVERNED_MODE_DENIED');
 }catch(error){
  console.error(String(error?.message||'').startsWith('PLAYER3_')?
     error.message:'PLAYER3_GOVERNED_EXECUTOR_FAILED_CLOSED');
  process.exitCode=1;
 }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main();
