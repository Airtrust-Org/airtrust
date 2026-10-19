import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {zipSync,strToU8} from 'fflate';
import {validateF5Plan,verifyF5Readback,verifyF5Pdf} from
  '../staging/scorm-governed-functional-executor.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
function inputs(){
  const dir=mkdtempSync(join(tmpdir(),'airtrust-f5-stage-'));
  const zip=Buffer.from(zipSync({
    'imsmanifest.xml':strToU8('<manifest><resources/></manifest>'),
    'index.html':strToU8('<h1>SCORM synthetic</h1>')}));
  const packageSha256=hash(zip),reviewFile=join(dir,'review.json'),
    driverFile=join(dir,'driver.json'),approvalFile=join(dir,'approval.json');
  const reviewerReference='qa-independent-01',approvedAt=new Date().toISOString();
  const candidate={scope:'GOVERNED_STAGING_SYNTHETIC',empresaId:6,cursoId:15,
    packageId:'123e4567-e89b-42d3-a456-426614174001',packageSha256,
    requiresAssessment:true,reviewItemCount:1,
    stagingRuntimeSha:'b'.repeat(40)};
  const review={kind:'AIRTRUST_SCORM_INDEPENDENT_PEDAGOGICAL_REVIEW_V1',
    packageSha256,approved:true,independentOfPackageAuthor:true,
    reviewerReference,approvalReference:'qa-independent-approval-01',
    approvedAt,items:[{itemId:'synthetic-1',status:'APPROVED',selectedIndex:0,
      rationale:'Only synthetic testing, independently confirmed within unit fixture',
      reviewerReference}]};
  writeFileSync(reviewFile,JSON.stringify(review));
  const driver={schemaVersion:1,packageSha256,authorReviewed:true,
    reviewArtifactSha256:hash(readFileSync(reviewFile)),launchFile:'index.html',
    requiresAssessment:true,masteryScore:70,requiredContent:[{selector:'h1'}],
    resume:{actions:[{op:'click',selector:'#resume'}],
      assertion:{selector:'#resume',state:'visible'}},
    fail:{actions:[{op:'click',selector:'#fail'}]},
    pass:{actions:[{op:'click',selector:'#pass'}]},
    completion:{actions:[{op:'click',surface:'host',selector:'#complete'}]},
    replayCompletion:{actions:[{op:'click',surface:'host',selector:'#replay'}]}};
  writeFileSync(driverFile,JSON.stringify(driver));
  const key=generateKeyPairSync('ed25519'),kid='qa-key-independent';
  const trustedReviewerKeys={[kid]:{reviewerReference,
    role:'INDEPENDENT_PEDAGOGICAL_REVIEWER',
    publicKeyPem:key.publicKey.export({type:'spki',format:'pem'})}};
  const approval={kind:'AIRTRUST_SCORM_PEDAGOGICAL_APPROVAL_ED25519_V1',
    reviewerKeyId:kid,packageSha256,reviewSha256:hash(readFileSync(reviewFile)),
    driverSha256:hash(readFileSync(driverFile)),reviewerReference,approvedAt};
  const sig=[approval.kind,approval.reviewerKeyId,approval.packageSha256,
    approval.reviewSha256,approval.driverSha256,approval.reviewerReference,
    review.approvalReference,approvedAt].join('\n');
  writeFileSync(approvalFile,JSON.stringify({...approval,
    signature:sign(null,Buffer.from(sig),key.privateKey).toString('base64')}));
  const signature=JSON.parse(readFileSync(approvalFile,'utf8')).signature;
  const plan={schemaVersion:1,runId:'123e4567-e89b-42d3-a456-426614174002',
    approvalReceiptSha256:hash(Buffer.from(signature,'base64')),origin:'https://airtrust-api-staging.airtrust.workers.dev',
    scope:'GOVERNED_STAGING_SYNTHETIC',releaseSha:'b'.repeat(40),
    harnessSha:'a'.repeat(40),candidate,synthetic:true,
    provisionedBy:'F0_GOVERNED_STAGING_QA',
    provisioningReceiptSha256:'1'.repeat(64),
    recoveryReceiptSha256:'2'.repeat(64),cleanupContractSha256:'3'.repeat(64),
    browserEnrollments:['CHROMIUM','WEBKIT'].map((browser,i)=>({
      browser,failedId:101+i*2,passedId:102+i*2,
      failedCycle:201+i*2,passedCycle:202+i*2,foreignTenantId:901+i}))};
  const env={GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/main',
    GITHUB_SHA:'a'.repeat(40)};
  const verify=(override={})=>validateF5Plan({plan,driver,zipBytes:zip,
    driverFile,reviewFile,approvalFile,trustedReviewerKeys,env,...override});
  return {dir,verify,plan,driver,env,zip,reviewFile,approvalFile};
}
test('requires independent Ed25519, trusted main, protected staging and distinct cycles',()=>{
  const f=inputs();
  try{
    assert.match(f.verify().driverSha256,/^[a-f0-9]{64}$/);
    for(const override of [
      {env:{...f.env,GITHUB_REF:'refs/heads/branch'}},
      {plan:{...f.plan,synthetic:false}},
      {plan:{...f.plan,origin:'https://airtrust-api.airtrust.workers.dev'}},
      {plan:{...f.plan,cleanupContractSha256:null}},
      {plan:{...f.plan,approvalReceiptSha256:'0'.repeat(64)}},
      {plan:{...f.plan,browserEnrollments:[
        f.plan.browserEnrollments[0],f.plan.browserEnrollments[0]]}},
      {plan:{...f.plan,candidate:{...f.plan.candidate,
        packageSha256:'f'.repeat(64)}}},
      {trustedReviewerKeys:{}},
      {zipBytes:Buffer.from('not a zip')},
    ])assert.throws(()=>f.verify(override));
    const forged={...f.driver,completion:{actions:[
      {op:'postMessage',surface:'host',selector:'#x'}]}};
    assert.throws(()=>f.verify({driver:forged}));
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('rejects fake Worker/D1 state, wrong candidate SHA, wrong tenant or cycle',()=>{
  const f=inputs();
  try{
    const entry=f.plan.browserEnrollments[0],c=f.plan.candidate;
    const row={source:'WORKER_D1_STAGING_READBACK',phase:'BEFORE',
      runId:f.plan.runId,approvalReceiptSha256:f.plan.approvalReceiptSha256,
      empresaId:c.empresaId,cursoId:c.cursoId,packageId:c.packageId,
      packageSha256:c.packageSha256,runtimeSha:f.plan.releaseSha,
      synthetic:true,enrollmentId:entry.failedId,cycleId:entry.failedCycle,
      cmiSha256:hash(Buffer.from('{}')),suspendSha256:null,
      hasSuspendData:false,sessionCount:0,completionStatus:'EM_ANDAMENTO',
      qualificationHistoryCount:0};
    assert.equal(verifyF5Readback(row,f.plan,entry,
      entry.failedId,entry.failedCycle,'BEFORE'),row);
    for(const patch of [
      {source:'LOCAL_SCORM_API_EMULATOR'},{empresaId:99},
      {packageSha256:'0'.repeat(64)},{runtimeSha:'0'.repeat(40)},
      {enrollmentId:999},{cycleId:999},{synthetic:false},
      {cmiSha256:'0'},{runId:'wrong'},
      {approvalReceiptSha256:'0'.repeat(64)},
      {qualificationHistoryCount:undefined},
    ])assert.throws(()=>verifyF5Readback({...row,...patch},f.plan,entry,
      entry.failedId,entry.failedCycle,'BEFORE'));
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('backend PDF hash and identity must match exact bytes',()=>{
  const bytes=Buffer.from('%PDF-1.4\n'+
    ('Synthetic PDF for unit test only\n').repeat(24)+'%%EOF\n');
  const doc={documentId:'900',enrollmentId:101,cycleId:202,
    qualificationHistoryId:303,sha256:null};
  const row={...doc,certificateDocument:doc};
  assert.equal(verifyF5Pdf(bytes,row,200),hash(bytes));
  assert.throws(()=>verifyF5Pdf(Buffer.from('not a PDF'),row,200));
  assert.throws(()=>verifyF5Pdf(bytes,row,404));
  assert.throws(()=>verifyF5Pdf(bytes,{...row,cycleId:999},200));
  assert.throws(()=>verifyF5Pdf(bytes,{...row,certificateDocument:{
    ...doc,sha256:'0'.repeat(64)}},200));
});
