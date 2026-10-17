#!/usr/bin/env node
/**
 * Offline CI signer for independently verified staging SCORM browser evidence.
 * This CLI MUST run only in a protected main-branch GitHub Actions environment
 * after the authenticated QA suite. It never creates PASSes or answers.
 */
import { createHash, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const K='AIRTRUST_SCORM_STAGING_ATTESTATION_V1';
const cases=['FIRST_ACCESS','SUSPEND_RESUME','ASSESSMENT_INSUFFICIENT',
  'ASSESSMENT_APPROVED','EXPLICIT_FINALIZATION','REOPEN_COMPLETED',
  'NO_STATUS_DOWNGRADE','TENANT_CYCLE_ISOLATION'];
const sha=/^[a-f0-9]{64}$/, commit=/^[a-f0-9]{40}$/;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const assert=(condition,reason)=>{if(!condition)throw Error('SCORM_ATTESTATION_'+reason);};
const read=path=>JSON.parse(readFileSync(path,'utf8'));

export function signGovernedScormEvidence({
  candidate, chromiumFile, webkitFile, certificatePdfFile, secret,
  runtimeSha, harnessSha,
}){
  assert(typeof secret==='string'&&secret.length>=32,'SECRET_MISSING');
  assert(commit.test(runtimeSha)&&commit.test(harnessSha),'COMMIT_INVALID');
  assert(candidate?.scope==='GOVERNED_STAGING_SYNTHETIC'&&
    Number.isSafeInteger(candidate.empresaId)&&candidate.empresaId>0&&
    Number.isSafeInteger(candidate.cursoId)&&candidate.cursoId>0&&
    /^[a-f0-9-]{36}$/.test(candidate.packageId)&&
    sha.test(candidate.packageSha256)&&
    typeof candidate.requiresAssessment==='boolean','CANDIDATE_INVALID');
  // Hash the exact ZIP bytes, not extracted files or manifest data.
  assert(digest(readFileSync(candidate.zipPath))===candidate.packageSha256,
    'ZIP_SHA_DRIFT');
  assert(candidate.stagingRuntimeSha===runtimeSha,'RUNTIME_SHA_DRIFT');
  const browserInputs=[
    ['CHROMIUM',chromiumFile],['WEBKIT',webkitFile],
  ];
  const runs=[],browserEvidenceSha256={};
  for(const [browser,file] of browserInputs){
    const bytes=readFileSync(file);
    const row=JSON.parse(bytes.toString('utf8'));
    assert(row.source==='GOVERNED_STAGING_AUTHENTICATED_QA_V1'&&
      row.scope==='GOVERNED_STAGING_SYNTHETIC'&&
      row.browser===browser&&row.packageId===candidate.packageId&&
      row.packageSha256===candidate.packageSha256&&
      row.empresaId===candidate.empresaId&&row.cursoId===candidate.cursoId&&
      row.runtimeSha===runtimeSha&&row.harnessSha===harnessSha,
      'UNTRUSTED_BROWSER_'+browser);
    assert(row.syntheticEnrollment===true&&
      row.persistedBackendEvidence===true&&
      row.verifiedCrossTenantDenial===true&&
      row.verifiedIndependentCycle===true&&
      row.qualificationHistoryVerified===true&&
      row.certificateDocumentVerified===true,'E2E_INCOMPLETE_'+browser);
    assert(Array.isArray(row.cases)&&row.cases.length===cases.length&&
      row.cases.every(v=>cases.includes(v.name)&&v.status==='PASS')&&
      new Set(row.cases.map(v=>v.name)).size===cases.length,
      'CASES_INCOMPLETE_'+browser);
    runs.push({harness:'AIRTRUST_SCORM_FUNCTIONAL_HARNESS_V1',
      browser,packageSha256:candidate.packageSha256,
      cases:row.cases.map(c=>({name:c.name,status:c.status}))});
    browserEvidenceSha256[browser]=digest(bytes);
  }
  assert(browserEvidenceSha256.CHROMIUM!==browserEvidenceSha256.WEBKIT,
    'BROWSER_PROOF_COLLISION');
  const pdf=readFileSync(certificatePdfFile);
  assert(pdf.length>150&&pdf.subarray(0,5).toString()==='%PDF-'&&
    pdf.includes(Buffer.from('%%EOF')),'CERTIFICATE_DOCUMENT_UNVERIFIED');
  const p={kind:K,empresaId:candidate.empresaId,cursoId:candidate.cursoId,
    packageId:candidate.packageId,packageSha256:candidate.packageSha256,
    runtimeSha,harnessSha,issuedAt:new Date().toISOString(),
    scope:'GOVERNED_STAGING_SYNTHETIC',requiresAssessment:candidate.requiresAssessment,
    browserEvidenceSha256,certificateDocumentSha256:digest(pdf),runs};
  // Same exact canonical projection/order as the Worker WebCrypto verifier.
  const canonical=JSON.stringify(p);
  return {payload:p,signature:createHmac('sha256',secret)
    .update(canonical,'utf8').digest('hex')};
}

function main(){
  assert(process.env.GITHUB_ACTIONS==='true'&&
    process.env.GITHUB_REF==='refs/heads/main'&&
    /^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA??''),
    'GOVERNED_MAIN_RUN_REQUIRED');
  const input=process.argv[2],output=process.argv[3];
  assert(input&&output,'ARGUMENTS_REQUIRED');
  const args=read(input);
  const result=signGovernedScormEvidence({
    candidate:args.candidate,
    chromiumFile:args.chromiumFile,webkitFile:args.webkitFile,
    certificatePdfFile:args.certificatePdfFile,
    secret:process.env.SCORM_QA_ATTESTATION_SECRET,
    runtimeSha:process.env.SCORM_QA_RUNTIME_SHA,
    harnessSha:process.env.GITHUB_SHA,
  });
  writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log('SCORM_SIGNED_ATTESTATION_CREATED='+result.payload.packageSha256);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main();
