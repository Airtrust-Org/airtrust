import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  const zip=Buffer.from('SYNTHETIC TEST ZIP NOT A REAL TRAINING PACKAGE');
  const zipPath=join(dir,'candidate.zip');writeFileSync(zipPath,zip);
  const pdfPath=join(dir,'cert.pdf');
  writeFileSync(pdfPath,Buffer.from('%PDF-1.4\n'+('test synthetic document\n').repeat(12)+'%%EOF\n'));
  const runtimeSha='a'.repeat(40),harnessSha='b'.repeat(40);
  const candidate={scope:'GOVERNED_STAGING_SYNTHETIC',
    empresaId:6,cursoId:23,packageId:'123e4567-e89b-42d3-a456-426614174000',
    packageSha256:sha(zip),zipPath,stagingRuntimeSha:runtimeSha,requiresAssessment:true};
  const browserRow=browser=>({
    source:'GOVERNED_STAGING_AUTHENTICATED_QA_V1',
    scope:'GOVERNED_STAGING_SYNTHETIC',
    browser,packageId:candidate.packageId,
    packageSha256:candidate.packageSha256,empresaId:6,cursoId:23,
    runtimeSha,harnessSha,syntheticEnrollment:true,
    persistedBackendEvidence:true,verifiedCrossTenantDenial:true,
    verifiedIndependentCycle:true,qualificationHistoryVerified:true,
    certificateDocumentVerified:true,
    cases:checks.map(name=>({name,status:'PASS'})),
  });
  const chromiumFile=join(dir,'chromium.json');
  const webkitFile=join(dir,'webkit.json');
  const save=(browser,file)=>writeFileSync(file,JSON.stringify(browserRow(browser)));
  save('CHROMIUM',chromiumFile);save('WEBKIT',webkitFile);
  const sign=(overrides={})=>signGovernedScormEvidence({
    candidate,chromiumFile,webkitFile,certificatePdfFile:pdfPath,
    secret,runtimeSha,harnessSha,...overrides});
  return {dir,candidate,sign,chromiumFile,webkitFile,pdfPath,browserRow};
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
    writeFileSync(f.candidate.zipPath,'SYNTHETIC TEST ZIP NOT A REAL TRAINING PACKAGE');
    writeFileSync(f.pdfPath,'not a certificate');
    assert.throws(()=>f.sign(),/CERTIFICATE_DOCUMENT_UNVERIFIED/);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('legitimate formative ZIP requires both browsers without fabricated scored quiz',()=>{
  const f=fixture();try{
    f.candidate.requiresAssessment=false;
    for(const [name,path] of [['CHROMIUM',f.chromiumFile],['WEBKIT',f.webkitFile]]){
      const row=f.browserRow(name);
      row.cases=row.cases.filter(item=>
        item.name!=='ASSESSMENT_INSUFFICIENT'&&item.name!=='ASSESSMENT_APPROVED'&&
        item.name!=='ASSESSMENT_THRESHOLD');
      writeFileSync(path,JSON.stringify(row));
    }
    const signed=f.sign();
    assert.equal(signed.payload.requiresAssessment,false);
    assert.equal(signed.payload.runs[0].cases.length,9);
    assert.equal(signed.payload.runs[1].cases.length,9);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
