#!/usr/bin/env node
// Exact external ZIP diagnostic against disposable authenticated Worker/D1/R2.
// Never certifies course, tenant cycle, PDF, or staging attestation.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {join,resolve} from 'node:path';
import {chromium,webkit} from '@playwright/test';
import {validateIndependentDriver,unzipCandidate} from './scorm-independent-zip-producer.mjs';
import {observeMonotonicSuspend} from './scorm-suspend-monotonic.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const requireCondition=(x,message)=>{if(!x)throw Error('ZIP_QA_'+message);};
const root='worker-airtrust/.wrangler/scorm-browser-qa';
const fixture=JSON.parse(readFileSync(join(root,'fixture.json'),'utf8'));
const bytes=readFileSync(fixture.zipPath),sha=hash(bytes);
const author=readFileSync(fixture.driverPath);
const driver=JSON.parse(author.toString('utf8'));
requireCondition(!process.env.CLOUDFLARE_API_TOKEN&&!process.env.AIRTRUST_REMOTE_DB,'REMOTE_DENIED');
requireCondition(fixture.origin==='http://127.0.0.1:8787'&&
 fixture.fixtureKind==='LOCAL_DISPOSABLE_REAL_ZIP'&&
 fixture.dbFile.includes('.wrangler/state/')&&resolve(fixture.driverPath).includes('/.wrangler/'),
 'DISPOSABLE_ONLY');
requireCondition(sha===fixture.packageSha256,'ZIP_SHA_DRIFT');
validateIndependentDriver(driver,sha,unzipCandidate(bytes));
const email=process.env.AIRTRUST_SCORM_QA_EMAIL || 'admin@airtrust.com';
// Disposable local auth is seeded by prepare-local-lms-auth.mjs, never production.
const password=process.env.AIRTRUST_SCORM_QA_PASSWORD || 'Admin@123';
requireCondition(email==='admin@airtrust.com'&&password.length>=8,'LOCAL_QA_IDENTITY_INVALID');
const api=fixture.origin+'/api';
function readState(id){
 const db=new DatabaseSync(fixture.dbFile,{readOnly:true});
 try{return db.prepare('SELECT lesson_status,score_raw,suspend_data,cmi_json FROM lms_progresso_scorm WHERE empresa_id=? AND matricula_id=?').get(fixture.companyId,id);}
 finally{db.close();}
}
async function run(name,type){
 const enrollment=fixture.enrollments[name==='CHROMIUM'?'chromium':'webkit-ipad'];
 const result={browser:name,syntheticEnrollmentId:enrollment,outcome:'INCONCLUSIVE',
  tenantIsolation:'INCONCLUSIVE',requiredContent:'INCONCLUSIVE',
  persistedCmi:'INCONCLUSIVE',suspendResume:'INCONCLUSIVE',
  fullAssessment:'NOT_RUN',qualification:'NOT_RUN',pdf:'NOT_RUN'};
 let browser;
 try{
  browser=await type.launch({headless:true});
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',r=>r.request().url().startsWith(fixture.origin+'/')?
   r.continue():r.abort('blockedbyclient'));
  const page=await context.newPage();
  const login=await page.request.post(api+'/auth/login',{data:{email,senha:password}});
  requireCondition(login.ok(),'AUTH_HTTP_'+login.status());
  const token=(await login.json()).data.accessToken;
  const headers={Authorization:'Bearer '+token};
  const foreign=await page.request.post(api+'/lms/assets/session',{
   headers,data:{matricula_id:fixture.foreignTenant.matriculaId}});
  result.tenantIsolation=foreign.status()===404?'PASS':'FAIL';
  requireCondition(result.tenantIsolation==='PASS','CROSS_TENANT');
  async function open(){
   const s=await page.request.post(api+'/lms/assets/session',{
    headers,data:{matricula_id:enrollment}});
   requireCondition(s.ok(),'ASSET_SESSION_HTTP_'+s.status());
   await page.goto(api+'/health');
   await page.setContent('<iframe id="outer" src="'+api+'/lms/scorm/launch/'+enrollment+
    '" style="height:95vh;width:100vw"></iframe>');
   const sco=page.frameLocator('#outer').frameLocator('#scorm-frame');
   await sco.locator('body').waitFor({state:'visible',timeout:25000});
   return sco;
  }
  let sco=await open();
  for(const entry of driver.requiredContent)await sco.locator(entry.selector)
   .waitFor({state:'visible',timeout:20000});
  result.requiredContent='PASS';
  for(const action of driver.resume.actions){
   const e=sco.locator(action.selector);
   if(action.op==='click')await e.click({timeout:20000});
   else if(action.op==='fill')await e.fill(action.value,{timeout:20000});
   else await e.press(action.value,{timeout:20000});
  }
  let previous;
  for(let i=0;i<35;i++){
   previous=readState(enrollment);
   if(previous?.cmi_json&&previous.suspend_data)break;
   await page.waitForTimeout(400);
  }
  requireCondition(!!previous?.cmi_json&&!!previous?.suspend_data,'PERSISTED_CMI_MISSING');
  result.persistedCmi='PASS';
  result.cmiSha256=hash(Buffer.from(previous.cmi_json));
  result.suspendBytes=Buffer.byteLength(previous.suspend_data,'utf8');
  const before=previous.suspend_data;
  sco=await open();
  const check=driver.resume.assertion,element=sco.locator(check.selector);
  if(check.state==='visible')await element.waitFor({state:'visible',timeout:20000});
  if(check.state==='hidden')await element.waitFor({state:'hidden',timeout:20000});
  if(check.state==='enabled')requireCondition(await element.isEnabled(),'RESUME_DISABLED');
  if(check.state==='text')requireCondition(
   (await element.innerText()).includes(check.value),'RESUME_TEXT');
  await page.waitForTimeout(500);
  const resumed=readState(enrollment);
  const comparison=observeMonotonicSuspend(before,resumed?.suspend_data);
  requireCondition(comparison.ok,'SUSPEND_'+comparison.reason);
  result.suspendComparison=comparison.reason;
  result.suspendResume='PASS';
  result.outcome='LOCAL_DIAGNOSTIC_PASS_NOT_CERTIFIED';
  await context.close();
 }catch(e){result.error=String(e?.message||e).slice(0,240);}
 finally{if(browser)await browser.close();}
 return result;
}
const report={source:'LOCAL_AUTHENTICATED_EXACT_ZIP_PARTIAL_QA_V1',
 status:'UNCERTIFIED',activationAuthorized:false,packageSha256:sha,
 driverSha256:hash(author),runtimeSha:process.env.SCORM_QA_RUNTIME_SHA||null,
 scope:'DISPOSABLE_LOCAL_WORKER_D1_R2',tenantId:fixture.companyId,
 browsers:[],missing:['AUTHORED_COMPLETE_ASSESSMENT',
 'GOVERNED_STAGING_CANDIDATE_CYCLE','REAL_CERTIFICATE_PDF',
 'TRUSTED_STAGING_ATTESTATION']};
for(const [name,type] of [['CHROMIUM',chromium],['WEBKIT',webkit]])
 report.browsers.push(await run(name,type));
writeFileSync(join(root,'authenticated-exact-zip-observations.json'),
 JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({sha:report.packageSha256,status:report.status,
 browsers:report.browsers,missing:report.missing}));
if(report.browsers.some(x=>x.outcome!=='LOCAL_DIAGNOSTIC_PASS_NOT_CERTIFIED'))
 process.exitCode=1;
