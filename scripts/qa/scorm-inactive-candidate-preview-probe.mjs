#!/usr/bin/env node
// Isolated authenticated QA of an INACTIVE exact-ZIP version.
// Read-only launch; never completes, qualifies, generates PDF or signs evidence.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {chromium,webkit} from '@playwright/test';
import {unzipCandidate} from './scorm-independent-zip-producer.mjs';
import {validateNavigationDiagnostic} from './scorm-navigation-diagnostic-driver.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const assert=(v,code)=>{if(!v)throw Error('INACTIVE_SCORM_QA_'+code);};
const root='worker-airtrust/.wrangler/scorm-browser-qa';
const f=JSON.parse(readFileSync(join(root,'fixture.json'),'utf8'));
const bytes=readFileSync(f.zipPath);
const sha=hash(bytes),driver=JSON.parse(readFileSync(f.driverPath,'utf8'));
assert(!process.env.CLOUDFLARE_API_TOKEN&&!process.env.AIRTRUST_REMOTE_DB,'REMOTE_DENIED');
assert(f.origin==='http://127.0.0.1:8787'&&f.fixtureKind==='LOCAL_DISPOSABLE_REAL_ZIP',
 'LOCAL_FIXTURE_REQUIRED');
assert(f.packageSha256===sha,'ZIP_SHA_MISMATCH');
const files=unzipCandidate(bytes);
validateNavigationDiagnostic(driver,sha,files);
const api=f.origin+'/api';
const output={source:'LOCAL_INACTIVE_SHA_PINNED_SCORM_PREVIEW_V1',status:'UNCERTIFIED',
 activationAuthorized:false,scope:'DISPOSABLE_LOCAL_WORKER_D1_R2',
 packageSha256:sha,packageId:null,tenantId:f.companyId,courseId:f.courseId,
 candidateStatus:'NOT_UPLOADED',activeCoursePrefixUnchanged:false,
 browsers:[],missing:['GOVERNED_STAGING_RUN','SYNTHETIC_EDITION_CYCLE',
 'COMPLETE_INDEPENDENT_ASSESSMENT','QUALIFICATION_CERTIFICATE_PDF',
 'TRUSTED_ATTESTATION']};
function snapshot(){
 const db=new DatabaseSync(f.dbFile,{readOnly:true});
 try{
  const course=db.prepare('SELECT scorm_package_r2_prefix AS prefix FROM lms_cursos WHERE empresa_id=? AND id=?')
   .get(f.companyId,f.courseId);
  const cmi=db.prepare('SELECT COUNT(*) AS total FROM lms_progresso_scorm WHERE empresa_id=?')
   .get(f.companyId);
  return {prefix:course?.prefix,progressRows:cmi.total};
 }finally{db.close();}
}
async function token(){
 const r=await fetch(api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:'admin@airtrust.com',senha:'Admin@123'})});
 assert(r.ok,'REAL_LOCAL_LOGIN_HTTP_'+r.status);
 const t=(await r.json())?.data?.accessToken;
 assert(typeof t==='string'&&t.length>20,'LOGIN_TOKEN_INVALID');
 return t;
}
const before=snapshot();
const t=await token();
try{
 const upload=await fetch(api+'/lms/cursos/'+f.courseId+'/upload/scorm',{
  method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/zip'},
  body:bytes});
 const data=await upload.json().catch(()=>({}));
 output.uploadHttp=upload.status;
 if(!upload.ok)throw Error('CANDIDATE_UPLOAD_HTTP_'+upload.status+'_CODE_'+String(data.code||'unknown'));
 const v=data.data||{};
 output.packageId=v.packageId;
 output.candidateStatus=v.status;
 if(v.packageSha256!==sha)throw Error('UPLOADED_PACKAGE_SHA_DRIFT');
 if(v.status!=='VALIDATED')throw Error('CANDIDATE_STATIC_GATE_'+v.status);
 const assetPath='/lms/scorm/qa-assets/'+f.companyId+'/'+f.courseId+'/'+v.packageId+'/'+driver.launchFile;
 const previewPath='/lms/scorm/qa-preview/'+f.courseId+'/'+v.packageId;
 for(const [name,type] of [['CHROMIUM',chromium],['WEBKIT',webkit]]){
  let browser;const obs={browser:name,outcome:'INCONCLUSIVE'};
  try{
   browser=await type.launch({headless:true});
   const context=await browser.newContext({serviceWorkers:'block'});
   await context.route('**/*',route=>route.request().url().startsWith(f.origin+'/')?
    route.continue():route.abort('blockedbyclient'));
   const page=await context.newPage();
   const session=await page.request.post(api+'/lms/assets/session',{
    headers:{Authorization:'Bearer '+t},
    data:{curso_id:f.courseId,preview:true,candidate_package_id:v.packageId,
     candidate_package_sha256:sha}});
   obs.sessionHttp=session.status();
   assert(session.ok(),'QA_SESSION_HTTP_'+session.status());
   const asset=await page.request.get(api+assetPath);
   obs.assetHttp=asset.status();
   assert(asset.ok(),'CANDIDATE_ASSET_HTTP_'+asset.status());
   obs.exactAssetSha=hash(Buffer.from(await asset.body()));
   assert(obs.exactAssetSha===hash(files[driver.launchFile]),'CANDIDATE_ASSET_BYTES_DRIFT');
   await page.goto(api+'/health');
   await page.setContent('<iframe id="outer" title="Inactive candidate QA" src="'+api+previewPath+
    '" style="width:99vw;height:95vh"></iframe>');
   const sco=page.frameLocator('#outer').frameLocator('#scorm-frame');
   await sco.locator(driver.requiredContent[0].selector).waitFor({state:'visible',timeout:30000});
   obs.content='PASS';
   const unchanged=snapshot();
   assert(unchanged.prefix===before.prefix&&
    unchanged.progressRows===before.progressRows,'PREVIEW_MODIFIED_ACTIVE_OR_CMI');
   obs.learnerWrites='NONE';
   obs.outcome='LOCAL_INACTIVE_PREVIEW_PASS_NOT_CERTIFIED';
   await context.close();
  }catch(e){obs.error=String(e?.message||e).slice(0,220);}
  finally{if(browser)await browser.close();}
  output.browsers.push(obs);
 }
}catch(e){output.error=String(e?.message||e).slice(0,240);}
finally{
 const after=snapshot();
 output.activeCoursePrefixUnchanged=after.prefix===before.prefix;
 output.previewOnlyNoCmiWrites=after.progressRows===before.progressRows;
 writeFileSync(join(root,'inactive-candidate-preview-observations.json'),
  JSON.stringify(output,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(output));
 if(!output.activeCoursePrefixUnchanged||!output.previewOnlyNoCmiWrites||
  output.browsers.length!==2||
  output.browsers.some(x=>x.outcome!=='LOCAL_INACTIVE_PREVIEW_PASS_NOT_CERTIFIED'))
  process.exitCode=1;
}
