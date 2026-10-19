#!/usr/bin/env node
/**
 * F5 governed staging observer; NOT the signer. A protected backend D1
 * readback and edition-bound synthetic enrollment must exist before running.
 * The existing preview-only path has no commit URL and is not valid proof.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium,webkit} from '@playwright/test';
import {validatePedagogicalReview} from '../ci/scorm-pedagogical-review-gate.mjs';
import {validateGovernedScormZipDriver} from '../ci/validate-scorm-governed-driver.mjs';
import {observeMonotonicSuspend} from '../qa/scorm-suspend-monotonic.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex');
const SHA=/^[0-9a-f]{64}$/,COMMIT=/^[0-9a-f]{40}$/;
const ORIGIN='https://airtrust-api-staging.airtrust.workers.dev';
const requireProof=(ok,label)=>{if(!ok)throw Error('F5_STAGING_'+label);};
const positive=x=>Number.isSafeInteger(x)&&x>0;
export function validateF5Plan({plan,driver,zipBytes,driverFile,reviewFile,
  approvalFile,trustedReviewerKeys,env}){
  requireProof(env?.GITHUB_ACTIONS==='true'&&
    env.GITHUB_REF==='refs/heads/main'&&COMMIT.test(env.GITHUB_SHA||''),
    'MAIN_PROTECTED_RUN_REQUIRED');
  requireProof(plan?.schemaVersion===1&&
    plan.scope==='GOVERNED_STAGING_SYNTHETIC'&&plan.origin===ORIGIN&&
    COMMIT.test(plan.releaseSha)&&plan.harnessSha===env.GITHUB_SHA,
    'STAGING_PROVENANCE_INVALID');
  const c=plan.candidate;
  requireProof(c?.scope==='GOVERNED_STAGING_SYNTHETIC'&&
    c.stagingRuntimeSha===plan.releaseSha&&
    positive(c.empresaId)&&positive(c.cursoId)&&
    /^[a-f0-9-]{36}$/.test(c.packageId)&&SHA.test(c.packageSha256)&&
    digest(zipBytes)===c.packageSha256,'CANDIDATE_ZIP_SHA_MISMATCH');
  requireProof(plan.synthetic===true&&
    plan.provisionedBy==='F0_GOVERNED_STAGING_QA'&&
    SHA.test(plan.provisioningReceiptSha256||'')&&
    SHA.test(plan.recoveryReceiptSha256||'')&&
    SHA.test(plan.cleanupContractSha256||''),
    'GOVERNED_SYNTHETIC_PROVISIONING_ABSENT');
  const entries=plan.browserEnrollments;
  requireProof(Array.isArray(entries)&&entries.length===2&&
    entries[0]?.browser==='CHROMIUM'&&entries[1]?.browser==='WEBKIT'&&
    entries.every(e=>positive(e.failedId)&&positive(e.passedId)&&
      positive(e.failedCycle)&&positive(e.passedCycle)&&
      positive(e.foreignTenantId)&&e.failedId!==e.passedId),
    'BROWSER_SYNTHETIC_ENROLLMENTS_MISSING');
  requireProof(new Set(entries.flatMap(e=>[e.failedId,e.passedId])).size===4&&
    new Set(entries.flatMap(e=>[e.failedCycle,e.passedCycle])).size===4,
    'ENROLLMENT_OR_CYCLE_REUSED');
  validateGovernedScormZipDriver(zipBytes,driver,c);
  const review=validatePedagogicalReview({reviewFile,driverFile,approvalFile,
    trustedReviewerKeys,candidate:c});
  requireProof(review.driverSha256===digest(readFileSync(driverFile)),
    'REVIEWED_DRIVER_SHA_CHANGED');
  return review;
}
export function verifyF5Readback(row,plan,entry,id,cycle,phase){
  const c=plan.candidate;
  requireProof(row?.source==='WORKER_D1_STAGING_READBACK'&&
    row.phase===phase&&row.empresaId===c.empresaId&&
    row.cursoId===c.cursoId&&row.packageId===c.packageId&&
    row.packageSha256===c.packageSha256&&row.runtimeSha===plan.releaseSha&&
    row.synthetic===true&&row.enrollmentId===id&&row.cycleId===cycle&&
    typeof row.cmiJson==='string'&&row.cmiJson.length<1048576&&
    typeof row.suspendData==='string'&&row.suspendData.length<1048576&&
    Number.isSafeInteger(row.qualificationHistoryCount)&&
    row.qualificationHistoryCount>=0&&
    typeof row.completionStatus==='string','BACKEND_WITNESS_UNTRUSTED');
  return row;
}
export function verifyF5Pdf(bytes,backend,status){
  const doc=backend?.certificateDocument;
  requireProof(status===200&&Buffer.isBuffer(bytes)&&bytes.length>512&&
    bytes.subarray(0,5).toString()==='%PDF-'&&
    bytes.subarray(-256).includes(Buffer.from('%%EOF')),
    'CERTIFICATE_PDF_INVALID');
  requireProof(doc&&SHA.test(doc.sha256)&&
    doc.sha256===digest(bytes)&&
    doc.enrollmentId===backend.enrollmentId&&
    doc.cycleId===backend.cycleId&&
    doc.qualificationHistoryId===backend.qualificationHistoryId,
    'CERTIFICATE_BACKEND_MISMATCH');
  return doc.sha256;
}
async function performDom(sco,host,actions){
  for(const a of actions){
    const locator=(a.surface==='host'?host:sco).locator(a.selector);
    if(a.op==='click')await locator.click({timeout:15000});
    else if(a.op==='fill'&&a.surface===undefined)
      await locator.fill(a.value,{timeout:15000});
    else if(a.op==='press'&&a.surface===undefined)
      await locator.press(a.value,{timeout:15000});
    else throw Error('F5_STAGING_ACTION_NOT_ALLOWED');
  }
}
async function observe(browserName,browserType,plan,driver,entry,token,outDir){
  const row={browser:browserName,status:'INCONCLUSIVE',
    packageSha256:plan.candidate.packageSha256,reason:'NOT_RUN'};
  let browser;
  try{
    browser=await browserType.launch({headless:true});
    const ctx=await browser.newContext({serviceWorkers:'block'});
    const page=await ctx.newPage();
    const auth={Authorization:'Bearer '+token};
    async function read(id,cycle,phase){
      // Requires F0's protected staging-only readback endpoint. This endpoint
      // does not exist in the current runtime: 404 means inconclusive.
      const p='/api/lms/scorm/qa-evidence/'+plan.candidate.cursoId+'/'+
        plan.candidate.packageId+'/'+id+'?phase='+phase;
      const response=await page.request.get(ORIGIN+p,{headers:auth});
      requireProof(response.status()===200,
        'CANDIDATE_READBACK_HTTP_'+response.status());
      return verifyF5Readback(await response.json(),plan,entry,id,cycle,phase);
    }
    const first=await read(entry.failedId,entry.failedCycle,'BEFORE');
    const second=await read(entry.passedId,entry.passedCycle,'BEFORE');
    requireProof(first.qualificationHistoryCount===0&&
      second.qualificationHistoryCount===0&&
      second.completionStatus!=='CONCLUIDO','SYNTHETIC_ENROLLMENT_DIRTY');
    const cross=await page.request.post(ORIGIN+'/api/lms/assets/session',
      {headers:auth,data:{matricula_id:entry.foreignTenantId}});
    const anon=await page.request.post(ORIGIN+'/api/lms/assets/session',
      {data:{matricula_id:entry.passedId}});
    requireProof([403,404].includes(cross.status())&&
      [401,403].includes(anon.status()),'AUTH_TENANT_NEGATIVE_FAILED');
    async function open(id){
      const session=await page.request.post(ORIGIN+'/api/lms/assets/session',
        {headers:auth,data:{matricula_id:id}});
      requireProof(session.status()===200,'LEARNER_SESSION_UNAVAILABLE');
      await page.goto(ORIGIN+'/api/health');
      await page.setContent('<iframe id="host" src="'+ORIGIN+
        '/api/lms/scorm/launch/'+id+'" title="F5" style="height:95vh"></iframe>');
      const host=page.frameLocator('#host'),sco=host.frameLocator('#scorm-frame');
      await sco.locator('body').waitFor({state:'visible',timeout:30000});
      return {host,sco};
    }
    let f=await open(entry.failedId);
    for(const content of driver.requiredContent)
      await f.sco.locator(content.selector).waitFor({state:'visible'});
    await performDom(f.sco,f.host,driver.resume.actions);
    const suspend=await read(entry.failedId,entry.failedCycle,'SUSPEND');
    requireProof(suspend.suspendData!==first.suspendData&&
      suspend.cmiJson!==first.cmiJson,'CMI_NOT_PERSISTED');
    f=await open(entry.failedId);
    const item=f.sco.locator(driver.resume.assertion.selector);
    if(driver.resume.assertion.state==='visible')
      await item.waitFor({state:'visible'});
    if(driver.resume.assertion.state==='hidden')
      await item.waitFor({state:'hidden'});
    if(driver.resume.assertion.state==='enabled')
      requireProof(await item.isEnabled(),'RESUME_CONTROL_DISABLED');
    if(driver.resume.assertion.state==='text')
      requireProof((await item.textContent())?.includes(driver.resume.assertion.value),
        'RESUME_TEXT_MISSING');
    const resume=await read(entry.failedId,entry.failedCycle,'RESUME');
    requireProof(observeMonotonicSuspend(suspend.suspendData,resume.suspendData).ok,
      'SUSPEND_STATE_REGRESSED');
    if(plan.candidate.requiresAssessment){
      await performDom(f.sco,f.host,driver.fail.actions);
      const rejected=await read(entry.failedId,entry.failedCycle,'REJECTED');
      requireProof(rejected.qualificationHistoryCount===0&&
        rejected.completionStatus!=='CONCLUIDO'&&
        Number.isFinite(rejected.scormScoreRaw)&&
        rejected.scormScoreRaw<driver.masteryScore,'FAILED_ATTEMPT_UNVERIFIED');
    }
    f=await open(entry.passedId);
    await performDom(f.sco,f.host,driver.pass.actions);
    const passed=await read(entry.passedId,entry.passedCycle,'PASSED');
    requireProof(passed.completionStatus!=='CONCLUIDO'&&
      (!plan.candidate.requiresAssessment||
        Number.isFinite(passed.scormScoreRaw)&&
        passed.scormScoreRaw>=driver.masteryScore),
      'PASS_NOT_OBSERVED');
    await performDom(f.sco,f.host,driver.completion.actions);
    const done=await read(entry.passedId,entry.passedCycle,'COMPLETED');
    requireProof(done.completionStatus==='CONCLUIDO'&&
      done.qualificationHistoryCount===1&&
      positive(done.qualificationHistoryId),'REAL_COMPLETION_MISSING');
    f=await open(entry.passedId);
    await performDom(f.sco,f.host,driver.replayCompletion.actions);
    const replay=await read(entry.passedId,entry.passedCycle,'REPLAY');
    requireProof(replay.completionStatus==='CONCLUIDO'&&
      replay.qualificationHistoryCount===1&&
      replay.qualificationHistoryId===done.qualificationHistoryId&&
      replay.cmiJson===done.cmiJson,'REPLAY_NOT_IDEMPOTENT');
    const doc=done.certificateDocument;
    requireProof(doc?.documentId&&doc.documentId===
      replay.certificateDocument?.documentId,'CERTIFICATE_DOCUMENT_ABSENT');
    const download=await page.request.get(ORIGIN+
      '/api/pasta-virtual/stream/'+encodeURIComponent(doc.documentId),
      {headers:auth});
    const pdf=Buffer.from(await download.body());
    row.pdfSha256=verifyF5Pdf(pdf,done,download.status());
    mkdirSync(outDir,{recursive:true});
    writeFileSync(outDir+'/'+browserName.toLowerCase()+'.pdf',pdf,{mode:0o600});
    row.status='OBSERVED';row.reason='REAL_BROWSER_BACKEND_OBSERVATION';
    row.historyId=done.qualificationHistoryId;
    // NEVER mark this as the trusted signer input: missing stale-cycle,
    // signed worker witness and governed cleanup still block certification.
    row.source='F5_STAGING_OBSERVATION_UNTRUSTED_V1';
  }catch(e){row.reason=String(e?.message||e).slice(0,160);}
  finally{if(browser)await browser.close();}
  return row;
}
export async function executeF5({planFile,driverFile,reviewFile,
  approvalFile,outputDir,token,trustedReviewerKeys,env=process.env}){
  const plan=JSON.parse(readFileSync(planFile,'utf8'));
  const driver=JSON.parse(readFileSync(driverFile,'utf8'));
  const zipBytes=readFileSync(plan.candidate.zipPath);
  const review=validateF5Plan({plan,driver,zipBytes,driverFile,
    reviewFile,approvalFile,trustedReviewerKeys,env});
  requireProof(typeof token==='string'&&token.length>40,
    'STAGING_SESSION_REQUIRED');
  const v=await fetch(ORIGIN+'/api/version');
  requireProof(v.ok,'STAGING_VERSION_UNAVAILABLE');
  const data=await v.json();
  requireProof((data.sourceSha??data.data?.sourceSha)===plan.releaseSha,
    'WORKER_SHA_DRIFT');
  const browsers=[];
  for(const [i,name] of ['CHROMIUM','WEBKIT'].entries())
    browsers.push(await observe(name,name==='CHROMIUM'?chromium:webkit,
      plan,driver,plan.browserEnrollments[i],token,outputDir));
  const report={source:'F5_STAGING_OBSERVATION_UNTRUSTED_V1',
    status:'UNCERTIFIED',activationAuthorized:false,
    classification:browsers.every(x=>x.status==='OBSERVED')?
      'PROTOCOL_PASS':'INCONCLUSIVE',
    candidate:{empresaId:plan.candidate.empresaId,cursoId:plan.candidate.cursoId,
      packageId:plan.candidate.packageId,packageSha256:plan.candidate.packageSha256},
    runtimeSha:plan.releaseSha,harnessSha:plan.harnessSha,
    driverSha256:review.driverSha256,reviewSha256:review.artifactSha256,
    browsers,missing:['SIGNED_BACKEND_WITNESS','STALE_CYCLE_NEGATIVE',
      'F0_CLEANUP_RECEIPT','HMAC_AND_WORKER_FINAL_VALIDATION']};
  mkdirSync(outputDir,{recursive:true});
  writeFileSync(outputDir+'/observations.json',
    JSON.stringify(report,null,2)+'\n',{mode:0o600});
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [planFile,driverFile,reviewFile,approvalFile,outputDir]=process.argv.slice(2);
    requireProof([planFile,driverFile,reviewFile,approvalFile,outputDir].every(Boolean),
      'ARGUMENTS_MISSING');
    const trustedReviewerKeys=JSON.parse(
      process.env.SCORM_QA_REVIEWER_PUBLIC_KEYS_JSON||'{}');
    const result=await executeF5({planFile,driverFile,reviewFile,approvalFile,
      outputDir,token:process.env.SCORM_QA_ACCESS_TOKEN,trustedReviewerKeys});
    console.log(JSON.stringify({status:result.status,
      classification:result.classification}));
    // Not an attestation or eligible release gate, even with two browser passes.
    process.exitCode=2;
  }catch(e){console.error(String(e?.message||e).slice(0,220));process.exitCode=2;}
}
