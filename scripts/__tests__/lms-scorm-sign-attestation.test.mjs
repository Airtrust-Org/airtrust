import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash, generateKeyPairSync, sign as edSign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {validateGovernedScormZipDriver} from '../ci/validate-scorm-governed-driver.mjs';
import { tmpdir } from 'node:os';
import { signGovernedScormEvidence } from '../ci/sign-scorm-functional-attestation.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const checks=['FIRST_ACCESS','REQUIRED_CONTENT_COVERAGE',
  'REQUIRED_INTERACTIONS','PERSISTENCE_VERIFIED','SUSPEND_RESUME',
  'ASSESSMENT_INSUFFICIENT','ASSESSMENT_APPROVED','ASSESSMENT_THRESHOLD',
  'EXPLICIT_FINALIZATION','REOPEN_COMPLETED','NO_STATUS_DOWNGRADE',
  'TENANT_CYCLE_ISOLATION'];
const secret='qa-secret-only-for-tests-with-length-over-32';
function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'airtrust-scorm-sign-test-'));
  const zip=Buffer.from(zipSync({
    'imsmanifest.xml':strToU8('<manifest><resources><resource href="index.html"/></resources></manifest>'),
    'index.html':strToU8('<html><body><h1>Synthetic QA</h1></body></html>'),
  }));
  const zipPath=join(dir,'candidate.zip');writeFileSync(zipPath,zip);
  const pdfPaths={CHROMIUM:join(dir,'chromium.pdf'),WEBKIT:join(dir,'webkit.pdf')};
  for(const [browser,file] of Object.entries(pdfPaths)){
    writeFileSync(file,Buffer.from('%PDF-1.4\n'+
      ('test synthetic '+browser+' document\n').repeat(12)+'%%EOF\n'));
  }
  const runtimeSha='a'.repeat(40),harnessSha='b'.repeat(40);
  const candidate={scope:'GOVERNED_STAGING_SYNTHETIC',
    empresaId:6,cursoId:23,packageId:'123e4567-e89b-42d3-a456-426614174000',
    packageSha256:sha(zip),zipPath,stagingRuntimeSha:runtimeSha,requiresAssessment:true};
  const reviewFile=join(dir,'independent-approved-review.json');
  const review={kind:'AIRTRUST_SCORM_INDEPENDENT_PEDAGOGICAL_REVIEW_V1',
    packageSha256:candidate.packageSha256,approved:true,independentOfPackageAuthor:true,
    reviewerReference:'reviewer-test-01',approvalReference:'approval-test-only-01',
    approvedAt:new Date().toISOString(),items:[0,1].map(i=>({
      itemId:'question-'+i,status:'APPROVED',selectedIndex:i,
      rationale:'Reviewed for synthetic test with sufficient independent justification',
      reviewerReference:'reviewer-test-01',
    }))};
  candidate.reviewItemCount=2;
  writeFileSync(reviewFile,JSON.stringify(review));
  const driverFile=join(dir,'reviewed-driver.json');
  writeFileSync(driverFile,JSON.stringify({schemaVersion:1,packageSha256:candidate.packageSha256,
    authorReviewed:true,reviewArtifactSha256:sha(readFileSync(reviewFile)),
    launchFile:'index.html',requiresAssessment:true,masteryScore:70,
    requiredContent:[{selector:'h1'}],
    resume:{actions:[{op:'click',selector:'#resume'}],
      assertion:{selector:'#resume',state:'visible'}},
    pass:{actions:[{op:'click',selector:'#pass'}]},
    fail:{actions:[{op:'click',selector:'#fail'}]},
    completion:{actions:[{op:'click',surface:'host',selector:'#finish'}]},
    replayCompletion:{actions:[{op:'click',surface:'host',selector:'#finish'}]},
  }));
  const driverSha256=sha(readFileSync(driverFile));
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const reviewerKeyId='reviewer-test-key-01';
  const trustedReviewerKeys={[reviewerKeyId]:{
    reviewerReference:'reviewer-test-01',role:'INDEPENDENT_PEDAGOGICAL_REVIEWER',
    publicKeyPem:publicKey.export({type:'spki',format:'pem'})}};
  const approvalFile=join(dir,'reviewer-detached-approval.json');
  const approval={kind:'AIRTRUST_SCORM_PEDAGOGICAL_APPROVAL_ED25519_V1',
    reviewerKeyId,packageSha256:candidate.packageSha256,
    reviewSha256:sha(readFileSync(reviewFile)),driverSha256,
    reviewerReference:review.reviewerReference,approvedAt:review.approvedAt};
  const message=[approval.kind,approval.reviewerKeyId,approval.packageSha256,
    approval.reviewSha256,approval.driverSha256,approval.reviewerReference,
    review.approvalReference,approval.approvedAt].join('\n');
  writeFileSync(approvalFile,JSON.stringify({...approval,
    signature:edSign(null,Buffer.from(message),privateKey).toString('base64')}));
  const backendWitness=browser=>{
    const enrollmentId=browser==='CHROMIUM'?1001:1002;
    const cycleId=browser==='CHROMIUM'?2001:2002;
    const qualificationHistoryId=browser==='CHROMIUM'?3001:3002;
    const documentId=browser==='CHROMIUM'?'qa-doc-chromium':'qa-doc-webkit';
    return {
      source:'WORKER_D1_STAGING_READBACK',
      empresaId:6,cursoId:23,packageId:candidate.packageId,
      enrollmentId,cycleId,qualificationHistoryId,documentId,
      completionStatus:'CONCLUIDO',persistedCmiSha256:'1'.repeat(64),
      staleAttempt:{cycleId:cycleId-10,commitHttpStatus:409,
        progressBeforeSha256:'2'.repeat(64),progressAfterSha256:'2'.repeat(64),
        activeCycleBeforeSha256:'3'.repeat(64),activeCycleAfterSha256:'3'.repeat(64)},
      replay:{completionHttpStatus:200,qualificationHistoryCountBefore:1,
        qualificationHistoryCountAfter:1,qualificationHistoryId},
      authorization:{anonymousHttpStatus:401,foreignTenantHttpStatus:404,
        mismatchedShaHttpStatus:409,incompatibleEditionHttpStatus:409},
      validity:{status:'VALID',validFrom:'2026-10-17T00:00:00.000Z',validUntil:null},
    };
  };
  const browserRow=browser=>({
    backendWitness:backendWitness(browser),
    driverSha256,
    source:'GOVERNED_STAGING_AUTHENTICATED_QA_V1',
    scope:'GOVERNED_STAGING_SYNTHETIC',
    browser,packageId:candidate.packageId,
    packageSha256:candidate.packageSha256,empresaId:6,cursoId:23,
    runtimeSha,harnessSha,syntheticEnrollment:true,
    persistedBackendEvidence:true,verifiedCrossTenantDenial:true,
    verifiedIndependentCycle:true,qualificationHistoryVerified:true,
    certificateDocumentVerified:true,certificateDownloadHttpStatus:200,
    certificateDocument:{
      enrollmentId:browser==='CHROMIUM'?1001:1002,
      cycleId:browser==='CHROMIUM'?2001:2002,
      qualificationHistoryId:browser==='CHROMIUM'?3001:3002,
      documentId:browser==='CHROMIUM'?'qa-doc-chromium':'qa-doc-webkit',
      sha256:sha(readFileSync(pdfPaths[browser])),
    },
    cases:checks.map(name=>({name,status:'PASS'})),
  });
  const chromiumFile=join(dir,'chromium.json');
  const webkitFile=join(dir,'webkit.json');
  const save=(browser,file)=>writeFileSync(file,JSON.stringify(browserRow(browser)));
  save('CHROMIUM',chromiumFile);save('WEBKIT',webkitFile);
  const sign=(overrides={})=>signGovernedScormEvidence({
    candidate,chromiumFile,webkitFile,certificatePdfFiles:pdfPaths,
    reviewFile,driverFile,approvalFile,trustedReviewerKeys,
    secret,runtimeSha,harnessSha,...overrides});
  return {dir,candidate,sign,chromiumFile,webkitFile,pdfPaths,browserRow,
    reviewFile,driverFile,approvalFile,trustedReviewerKeys};
}
test('signer produces separate SHA-bound browser artifact hashes for complete synthetic QA',()=>{
  const f=fixture();try{
    const out=f.sign();
    assert.equal(out.payload.packageSha256,f.candidate.packageSha256);
    assert.equal(out.payload.runs.length,2);
    assert.match(out.signature,/^[a-f0-9]{64}$/);
    assert.notEqual(out.payload.browserEvidenceSha256.CHROMIUM,
      out.payload.browserEvidenceSha256.WEBKIT);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('signer rejects local source, missing backend validation and fabricated pass',()=>{
  const f=fixture();try{
    const row=f.browserRow('WEBKIT');
    row.source='LOCAL_DISPOSABLE_D1_R2_ONLY';
    writeFileSync(f.webkitFile,JSON.stringify(row));
    assert.throws(()=>f.sign(),/UNTRUSTED_BROWSER/);
    row.source='GOVERNED_STAGING_AUTHENTICATED_QA_V1';
    row.qualificationHistoryVerified=false;
    writeFileSync(f.webkitFile,JSON.stringify(row));
    assert.throws(()=>f.sign(),/E2E_INCOMPLETE/);
    row.qualificationHistoryVerified=true;
    row.cases[2].status='INCONCLUSIVE';
    writeFileSync(f.webkitFile,JSON.stringify(row));
    assert.throws(()=>f.sign(),/CASES_INCOMPLETE/);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('signer rejects ZIP drift, runtime mismatch, incomplete PDF and missing secret',()=>{
  const f=fixture();try{
    assert.throws(()=>f.sign({secret:''}),/SECRET_MISSING/);
    assert.throws(()=>f.sign({runtimeSha:'c'.repeat(40)}),/RUNTIME_SHA_DRIFT/);
    writeFileSync(f.candidate.zipPath,'different bytes');
    assert.throws(()=>f.sign(),/ZIP_SHA_DRIFT/);
    writeFileSync(f.candidate.zipPath,zipSync({
      'imsmanifest.xml':strToU8('<manifest><resources><resource href="index.html"/></resources></manifest>'),
      'index.html':strToU8('<html><body><h1>Synthetic QA</h1></body></html>'),
    }));
    writeFileSync(f.pdfPaths.CHROMIUM,'not a certificate');
    assert.throws(()=>f.sign(),/CERTIFICATE_DOCUMENT_UNVERIFIED/);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('legitimate formative ZIP requires both browsers without fabricated scored quiz',()=>{
  const f=fixture();try{
    f.candidate.requiresAssessment=false;
    const driver=JSON.parse(readFileSync(f.driverFile,'utf8'));
    driver.requiresAssessment=false;
    delete driver.masteryScore;delete driver.fail;
    writeFileSync(f.driverFile,JSON.stringify(driver));
    // The detached Ed25519 review must be re-bound to the modified driver.
    // This test asserts the validator independently, not a counterfeit review.
    assert.equal(validateGovernedScormZipDriver(
      readFileSync(f.candidate.zipPath),driver,f.candidate),true);
    for(const [name,path] of [['CHROMIUM',f.chromiumFile],['WEBKIT',f.webkitFile]]){
      const row=f.browserRow(name);
      row.cases=row.cases.filter(item=>
        item.name!=='ASSESSMENT_INSUFFICIENT'&&item.name!=='ASSESSMENT_APPROVED'&&
        item.name!=='ASSESSMENT_THRESHOLD');
      writeFileSync(path,JSON.stringify(row));
    }
    assert.throws(()=>f.sign(),/REVIEW_SIGNATURE_SCOPE_INVALID/);
    // An altered assessment policy invalidates the signed driver. It requires
    // a NEW independent review and signature before governed signing.
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('signer refuses to reuse a different learner certificate in the second browser',()=>{
  const f=fixture();try{
    const webkit=f.browserRow('WEBKIT');
    const chromium=f.browserRow('CHROMIUM');
    webkit.certificateDocument.documentId=chromium.certificateDocument.documentId;
    webkit.backendWitness.documentId=chromium.certificateDocument.documentId;
    writeFileSync(f.webkitFile,JSON.stringify(webkit));
    assert.throws(()=>f.sign(),/CERTIFICATE_BROWSER_ISOLATION_VIOLATION/);
    webkit.certificateDocument.documentId='qa-doc-webkit';
    webkit.backendWitness.documentId='qa-doc-webkit';
    webkit.certificateDocument.sha256=chromium.certificateDocument.sha256;
    writeFileSync(f.webkitFile,JSON.stringify(webkit));
    assert.throws(()=>f.sign(),/CERTIFICATE_DOCUMENT_UNVERIFIED_WEBKIT/);
    const valid=f.browserRow('WEBKIT');
    writeFileSync(f.pdfPaths.WEBKIT,readFileSync(f.pdfPaths.CHROMIUM));
    valid.certificateDocument.sha256=chromium.certificateDocument.sha256;
    writeFileSync(f.webkitFile,JSON.stringify(valid));
    assert.throws(()=>f.sign(),/CERTIFICATE_BROWSER_ISOLATION_VIOLATION/);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('signer rejects absent or unreviewed pedagogical approval and driver mismatch',()=>{
  const f=fixture();try{
    assert.throws(()=>f.sign({reviewFile:undefined}),/PRIVATE_DOCUMENTS_REQUIRED/);
    const row=JSON.parse(readFileSync(f.reviewFile,'utf8'));
    row.approved=false;writeFileSync(f.reviewFile,JSON.stringify(row));
    assert.throws(()=>f.sign(),/APPROVAL_MISSING_OR_ZIP_DRIFT/);
    row.approved=true;row.items[0].selectedIndex=null;
    writeFileSync(f.reviewFile,JSON.stringify(row));
    assert.throws(()=>f.sign(),/REVIEW_ITEM_UNAPPROVED/);
    row.items[0].selectedIndex=0;
    row.items[1].rationale='';writeFileSync(f.reviewFile,JSON.stringify(row));
    assert.throws(()=>f.sign(),/REVIEW_ITEM_UNAPPROVED/);
    row.items[1].rationale='Reviewed independently with adequate support';
    writeFileSync(f.reviewFile,JSON.stringify(row));
    assert.throws(()=>f.sign(),/DRIVER_NOT_APPROVED_BY_REVIEW/);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('signer rejects self-asserted identity with absent, untrusted or tampered Ed25519 proof',()=>{
  const f=fixture();try{
    assert.throws(()=>f.sign({approvalFile:undefined}),/TRUSTED_REVIEW_AUTHORITY_MISSING/);
    assert.throws(()=>f.sign({trustedReviewerKeys:{}}),/REVIEW_SIGNATURE_SCOPE_INVALID/);
    const swapped=structuredClone(f.trustedReviewerKeys);
    swapped['reviewer-test-key-01'].reviewerReference='different-reviewer';
    assert.throws(()=>f.sign({trustedReviewerKeys:swapped}),/REVIEWER_IDENTITY_NOT_IN_TRUSTED_REGISTRY/);
    const approval=JSON.parse(readFileSync(f.approvalFile,'utf8'));
    approval.signature=approval.signature.replace(/^./,approval.signature[0]==='A'?'B':'A');
    writeFileSync(f.approvalFile,JSON.stringify(approval));
    assert.throws(()=>f.sign(),/INDEPENDENT_REVIEW_SIGNATURE_INVALID/);
    approval.signature='invalid';writeFileSync(f.approvalFile,JSON.stringify(approval));
    assert.throws(()=>f.sign(),/REVIEW_SIGNATURE_SCOPE_INVALID/);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('signer refuses fake cycle isolation, replayed qualification, wrong tenant and missing validity',()=>{
  const f=fixture();try{
    const baseline=f.browserRow('CHROMIUM');
    for(const corrupt of [
      w=>{delete w.backendWitness;},
      w=>{w.backendWitness.staleAttempt.commitHttpStatus=200;},
      w=>{w.backendWitness.staleAttempt.progressAfterSha256='0'.repeat(64);},
      w=>{w.backendWitness.replay.qualificationHistoryCountAfter=2;},
      w=>{w.backendWitness.empresaId=999;},
      w=>{w.backendWitness.authorization.foreignTenantHttpStatus=200;},
      w=>{w.backendWitness.validity.status='UNKNOWN';},
      w=>{w.backendWitness.cycleId=99999;},
    ]){
      const row=structuredClone(baseline);corrupt(row);
      writeFileSync(f.chromiumFile,JSON.stringify(row));
      assert.throws(()=>f.sign(),/BACKEND_WITNESS/);
    }
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('governed signer rejects arbitrary bytes, incomplete journey and executable answers',()=>{
  const f=fixture();try{
    const zip=readFileSync(f.candidate.zipPath);
    const driver=JSON.parse(readFileSync(f.driverFile,'utf8'));
    assert.equal(validateGovernedScormZipDriver(zip,driver,f.candidate),true);
    assert.throws(()=>validateGovernedScormZipDriver(
      Buffer.from('not a ZIP'),driver,f.candidate),/ZIP_SIZE_INVALID|ZIP_PARSE_FAILED/);
    assert.throws(()=>validateGovernedScormZipDriver(
      zipSync({'index.html':strToU8('synthetic')}),driver,f.candidate),
      /SCORM_MANIFEST_MISSING/);
    assert.throws(()=>validateGovernedScormZipDriver(zip,{
      ...driver,launchFile:'not-present.html'},f.candidate),
      /LAUNCH_FILE_NOT_IN_ZIP/);
    assert.throws(()=>validateGovernedScormZipDriver(zip,{
      ...driver,pass:undefined},f.candidate),/LEARNER_JOURNEY_MISSING_PASS/);
    assert.throws(()=>validateGovernedScormZipDriver(zip,{
      ...driver,requiredContent:[]},f.candidate),/REQUIRED_CONTENT_PLAN_MISSING/);
    assert.throws(()=>validateGovernedScormZipDriver(zip,{
      ...driver,replayCompletion:undefined},f.candidate),/REPLAY_LEARNER_UI_MISSING/);
    for(const op of ['evaluate','postMessage','request']){
      assert.throws(()=>validateGovernedScormZipDriver(zip,{
        ...driver,completion:{actions:[{op,surface:'host',selector:'#finish'}]},
      },f.candidate),/UNSAFE_COMPLETION_ACTION/);
      assert.throws(()=>validateGovernedScormZipDriver(zip,{
        ...driver,pass:{actions:[{op,selector:'#pass'}]},
      },f.candidate),/UNSAFE_LEARNER_ACTION/);
    }
    assert.throws(()=>validateGovernedScormZipDriver(zip,{
      ...driver,requiresAssessment:false},f.candidate),
      /PACKAGE_OR_ASSESSMENT_PROFILE_MISMATCH/);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
