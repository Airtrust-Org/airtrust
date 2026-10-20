#!/usr/bin/env node
/** Main-owned Player3 QA executor: synthetic-only, SHA-pinned, staging-only.
 * No user-controlled SQL or target names, no original courses or production.
 * Immutable QA fixtures require governed retirement, never blind DELETE.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
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
const AR='0dcbbb7d50235d2e37d2c1ddda16c1f55cb2482551a6cf3a3a420829cf642b8f';
const SO='2c3794a87fa914370594f1871f2e43d0d2e3fc0995db86372b516f49fa3baa29';
const PO='e576d02331a43c02b5027bc543b10f208b8fc13eb111367f589eb53cd0f74d72';
const BA='17a61f5914a6ce1d4e853525ef8b2daefde8cf65ff5fe65be6a29cb42e1d1875';
const PIN={
 'scripts/learning-factory/generate_player3_technical_zip.py':'9a18f21c60c05c3173f03ad365d6ee1df5b1519202f513e88aea34f6e038f7e5',
 'worker-airtrust/package-lock.json':'0516921fa9eddea097711828b9f5b406391828cb12bb88dbe46b90ffd5562235',
 'scripts/staging/build_player3_qa_catalog_sql_plan.py':'210c707548362e7130bf7205ef6ef010498c3aeb55ae288468a2bf0ebd8d2986',
 'scripts/staging/player3-qa-governed-publisher.py':'a9d279306411c5af9063cd5f85de4fd4e6d78f3910ea07cfcca92a410f6224a0',
 'scripts/learning-factory/prepare_player3_technical_candidate.py':'1cf8cbe4e19e06115c511d091e01fa0854ae663c5c1b5fb22259617217f80a4b',
 'scripts/learning-factory/build_player3_qa_publication_plan.py':'e517317068f4bbab4f61ab8896f0cdcc03f4934f6feeeeee87d2fc0b14a7df92'
};
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
function snapshot(){
 const q=[
 "SELECT",
 "(SELECT COUNT(*) FROM empresas WHERE id=999006 AND codigo='qa_examiner_training' AND ativo=1 AND deleted_at IS NULL) AS tenant,",
 "(SELECT COUNT(*) FROM airtrust_schema_changes_v2 WHERE change_id='lms-native-catalog-activation-0561') AS s61,",
 "(SELECT COUNT(*) FROM airtrust_schema_changes_v2 WHERE change_id='lms-player3-canonical-terminal-0562') AS s62,",
 "(SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=999006 AND codigo='QA-PLAYER3-NATIVE-TYPE' AND ativo=1 AND deleted_at IS NULL) AS types,",
 "(SELECT COUNT(*) FROM lms_cursos WHERE empresa_id=999006 AND titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC' AND version_tag='qa-player3-native-synthetic-v1' AND deleted_at IS NULL) AS courses,",
 "(SELECT COALESCE(MAX(id),0) FROM lms_cursos WHERE empresa_id=999006 AND titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC' AND version_tag='qa-player3-native-synthetic-v1' AND deleted_at IS NULL) AS course_id,",
 "(SELECT COUNT(*) FROM lms_native_catalog_activation WHERE empresa_id=999006) AS markers,",
 "(SELECT COUNT(*) FROM lms_native_edicoes WHERE empresa_id=999006) AS editions,",
 "(SELECT COUNT(*) FROM lms_player3_politicas WHERE empresa_id=999006) AS policies,",
 "(SELECT COUNT(*) FROM lms_matriculas WHERE empresa_id=999006 AND curso_id="+CID+") AS enrolled"
 ].join(' ');
 const rows=readD1(q);demand(rows.length===1,'PLAYER3_QA_DB_NOT_UNIQUE');
 const r=rows[0];demand(r.tenant===1&&r.s61===1&&r.s62===1,'PLAYER3_SCHEMA_TENANT_NOT_READY');
 if(PH==='bootstrap'){
  demand(r.types===0&&r.courses===0&&r.markers===0&&r.editions===0&&r.policies===0,
         'PLAYER3_BOOTSTRAP_DIRTY_STAGING_STATE');
 }else{
  demand(r.types===1&&r.courses===1&&r.course_id===CID&&r.markers===1&&
         r.editions===0&&r.policies===0&&r.enrolled===0,
         'PLAYER3_PUBLISH_OR_EDITION_STATE_DRIFT');
 }
 return r;
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
 if(PH==='bootstrap'){
  const rows=readD1("SELECT c.id FROM lms_cursos c JOIN lms_native_catalog_activation a ON a.curso_id=c.id AND a.empresa_id=c.empresa_id JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id AND qc.empresa_id=qt.empresa_id WHERE c.empresa_id=999006 AND c.titulo='QA-PLAYER3-NATIVE-ONLY-SYNTHETIC' AND c.tipo_conteudo='scorm' AND c.scorm_launch_file IS NULL AND c.scorm_package_r2_prefix IS NULL AND qc.lms_integrada=1 AND qt.codigo='QA-PLAYER3-NATIVE-TYPE'");
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
async function doApply(){
 validateLocal();cloudflare();
 if(PH==='publish'){
  demand(/^[a-f0-9]{64}$/.test(E.QA_D1_PREFLIGHT_OK||''),
         'PLAYER3_TRUSTED_D1_PREFLIGHT_JOB_PROOF_REQUIRED');
  const doc=publication();
  const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+
    E.CLOUDFLARE_ACCOUNT_ID+'/pages/projects/'+PROJECT,{
      headers:{Authorization:'Bearer '+E.CLOUDFLARE_API_TOKEN},
      signal:AbortSignal.timeout(20000)});
  demand(res.ok,'PLAYER3_ISOLATED_PAGES_PROJECT_NOT_PROVISIONED');
  const j=await res.json();
  demand(j.success===true&&j.result?.name===PROJECT,'PLAYER3_PAGES_PROJECT_MISMATCH');
  cleanRun('python3',['scripts/staging/player3-qa-governed-publisher.py',
    '--candidate',CAND,'--plan',PLAN,'--pages-project',PROJECT,'--apply']);
  await verifyBytes(doc);
  console.log('PLAYER3_PRIVATE_R2_AND_HTTPS_STAGING_PUBLICATION_VERIFIED');
  return;
 }
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
  if(mode==='prepare')doPrepare();
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
main();
