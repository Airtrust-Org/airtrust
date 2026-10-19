import {createHash,createHmac,generateKeyPairSync,sign as edSign} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {zipSync,strToU8} from 'fflate';
// Deliberately exercise the real Node signer and the Worker verifier together.
import {signGovernedScormEvidence} from '../../../../scripts/ci/sign-scorm-functional-attestation.mjs';
import { describe, expect, it } from 'vitest';

import { REQUIRED_SCORM_FUNCTIONAL_CASES, SCORM_FUNCTIONAL_HARNESS } from '../../lib/lms/lms-scorm-functional-certification';
import {
  serializeScormAttestation, verifyTrustedScormAttestation,
  TRUSTED_SCORM_ATTESTATION_KIND,
  type TrustedScormAttestationPayload, type TrustedScormContext,
} from '../../lib/lms/lms-scorm-trusted-attestation';

const secret = 'scorm-qa-secret-for-test-only-with-more-than-32-chars';
const packageId = '123e4567-e89b-42d3-a456-426614174000';
const sha = 'a'.repeat(64);
const runtimeSha = 'b'.repeat(40);
const harnessSha = 'c'.repeat(40);
const context: TrustedScormContext = {
  empresaId: 17, cursoId: 23, packageId, packageSha256: sha,
  runtimeSha, requiresAssessment: true,
};
const run = (browser: 'CHROMIUM' | 'WEBKIT') => ({
  harness: SCORM_FUNCTIONAL_HARNESS, browser, packageSha256: sha,
  cases: REQUIRED_SCORM_FUNCTIONAL_CASES.map(name => ({ name, status: 'PASS' as const })),
});
const payload = (): TrustedScormAttestationPayload => ({
  kind: TRUSTED_SCORM_ATTESTATION_KIND,
  ...context, harnessSha, issuedAt: '2026-10-17T19:00:00.000Z',
  scope: 'GOVERNED_STAGING_SYNTHETIC',
  pedagogicalReview: {artifactSha256:'5'.repeat(64),driverSha256:'6'.repeat(64),
    reviewerReference:'reviewer-test-01',approvalReference:'approval-test-only-01',
    approvedAt:'2026-10-17T18:00:00.000Z',itemCount:2,
    reviewerKeyId:'reviewer-test-key-01',reviewerPublicKeySha256:'7'.repeat(64),
    approvalSignatureSha256:'8'.repeat(64)},
  browserEvidenceSha256: { CHROMIUM: '1'.repeat(64), WEBKIT: '2'.repeat(64) },
  certificateDocuments: {
    CHROMIUM: { enrollmentId: 1001, cycleId: 2001, qualificationHistoryId: 3001, documentId: 'qa-doc-chromium', sha256: '3'.repeat(64) },
    WEBKIT: { enrollmentId: 1002, cycleId: 2002, qualificationHistoryId: 3002, documentId: 'qa-doc-webkit', sha256: '4'.repeat(64) },
  },
  runs: [run('CHROMIUM'), run('WEBKIT')],
});
const seal = (p: TrustedScormAttestationPayload) => ({
  payload: p,
  signature: createHmac('sha256', secret).update(serializeScormAttestation(p)).digest('hex'),
});
const now = Date.parse('2026-10-17T19:05:00.000Z');

describe('governed independent SCORM browser attestation', () => {
  it('verifies a complete signed staging-only certificate', async () => {
    expect(await verifyTrustedScormAttestation(seal(payload()), context, secret, now)).toBe(true);
  });
  it('rejects absent signing authority and tampered signatures', async () => {
    const cert = seal(payload());
    expect(await verifyTrustedScormAttestation(cert, context, undefined, now)).toBe(false);
    expect(await verifyTrustedScormAttestation({ ...cert, signature: '0'.repeat(64) }, context, secret, now)).toBe(false);
    expect(await verifyTrustedScormAttestation({ ...cert, payload: { ...cert.payload, cursoId: 99 } }, context, secret, now)).toBe(false);
  });
  it('rejects edition, ZIP and runtime substitution even when signature is valid', async () => {
    const cert = seal(payload());
    expect(await verifyTrustedScormAttestation(cert, { ...context, packageId: crypto.randomUUID() }, secret, now)).toBe(false);
    expect(await verifyTrustedScormAttestation(cert, { ...context, packageSha256: '0'.repeat(64) }, secret, now)).toBe(false);
    expect(await verifyTrustedScormAttestation(cert, { ...context, runtimeSha: 'd'.repeat(40) }, secret, now)).toBe(false);
    expect(await verifyTrustedScormAttestation(cert, { ...context, empresaId: 18 }, secret, now)).toBe(false);
  });
  it('rejects missing browser, incomplete exam, duplicates and spoofed outcome', async () => {
    const one = payload(); one.runs.pop();
    expect(await verifyTrustedScormAttestation(seal(one), context, secret, now)).toBe(false);
    const duplicate = payload(); duplicate.runs[1] = run('CHROMIUM');
    expect(await verifyTrustedScormAttestation(seal(duplicate), context, secret, now)).toBe(false);
    const missing = payload(); missing.runs[0].cases.pop();
    expect(await verifyTrustedScormAttestation(seal(missing), context, secret, now)).toBe(false);
    const fail = payload(); fail.runs[1].cases[3].status = 'INCONCLUSIVE' as 'PASS';
    expect(await verifyTrustedScormAttestation(seal(fail), context, secret, now)).toBe(false);
  });
  it('rejects local fixture, absent PDF provenance and expired claims', async () => {
    const local = payload(); (local as {scope:string}).scope = 'LOCAL_DISPOSABLE';
    expect(await verifyTrustedScormAttestation(seal(local as TrustedScormAttestationPayload), context, secret, now)).toBe(false);
    const pdf = payload(); pdf.certificateDocuments.WEBKIT.sha256 = '';
    expect(await verifyTrustedScormAttestation(seal(pdf), context, secret, now)).toBe(false);
    const stale = payload(); stale.issuedAt = '2026-08-01T19:00:00.000Z';
    expect(await verifyTrustedScormAttestation(seal(stale), context, secret, now)).toBe(false);
    const future = payload(); future.issuedAt = '2026-10-18T19:00:00.000Z';
    expect(await verifyTrustedScormAttestation(seal(future), context, secret, now)).toBe(false);
  });
  it('rejects reuse of enrollment, lifecycle, history or certificate documents across browsers', async () => {
    const original = payload();
    for (const field of ['enrollmentId','cycleId','qualificationHistoryId','documentId'] as const) {
      const altered = structuredClone(original);
      // The payload is re-signed to prove it is the verifier, not only HMAC,
      // that rejects an invalidly shared student/document identity.
      (altered.certificateDocuments.WEBKIT as unknown as Record<string, unknown>)[field] =
        altered.certificateDocuments.CHROMIUM[field];
      expect(await verifyTrustedScormAttestation(seal(altered), context, secret, now)).toBe(false);
    }
    const reusedPdf = structuredClone(original);
    reusedPdf.certificateDocuments.WEBKIT.sha256 =
      reusedPdf.certificateDocuments.CHROMIUM.sha256;
    expect(await verifyTrustedScormAttestation(seal(reusedPdf), context, secret, now)).toBe(false);
  });
  it('rejects missing, altered or unreconciled pedagogical review even when re-signed', async () => {
    const missing=structuredClone(payload());
    delete (missing as Partial<TrustedScormAttestationPayload>).pedagogicalReview;
    expect(await verifyTrustedScormAttestation(seal(missing),context,secret,now)).toBe(false);
    const bogus=structuredClone(payload());bogus.pedagogicalReview.itemCount=0;
    expect(await verifyTrustedScormAttestation(seal(bogus),context,secret,now)).toBe(false);
    const drift=structuredClone(payload());drift.pedagogicalReview.artifactSha256='';
    expect(await verifyTrustedScormAttestation(seal(drift),context,secret,now)).toBe(false);
  });
  it('rejects unexpected object fields, malicious extra certificate state and malformed evidence', async () => {
    const extended = { ...payload(), publishable: true };
    expect(await verifyTrustedScormAttestation({ payload: extended, signature: 'a'.repeat(64) }, context, secret, now)).toBe(false);
    const bad = payload(); (bad.runs[0].cases[0] as {status:string}).status = 'passed';
    expect(await verifyTrustedScormAttestation(seal(bad), context, secret, now)).toBe(false);
  });
});

describe('exact synthetic ZIP: governed Node signer -> real Worker verifier',()=>{
  it('accepts cryptographically bound synthetic evidence and rejects changed scope and bytes',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'scorm-signer-worker-roundtrip-'));
    try{
      // Synthetic QA inputs only. Browser witness fields are test fixtures, not
      // staging observations, so this test MUST NOT enable course activation.
      const digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
      const zip=zipSync({'imsmanifest.xml':strToU8('<manifest/>'),
        'index.html':strToU8('<h1>Technical synthetic test</h1>')});
      const zipPath=join(dir,'technical.zip');
      writeFileSync(zipPath,zip);
      const packageSha256=digest(zip);
      const id='123e4567-e89b-42d3-a456-426614174001';
      const runtime='a'.repeat(40),harness='b'.repeat(40);
      const candidate={scope:'GOVERNED_STAGING_SYNTHETIC',empresaId:17,
        cursoId:23,packageId:id,packageSha256,zipPath,
        stagingRuntimeSha:runtime,requiresAssessment:true,reviewItemCount:1};
      const reviewFile=join(dir,'review.json');
      const reviewerReference='synthetic-qa-reviewer-01';
      const approvalReference='synthetic-qa-approval-01';
      const approvedAt=new Date().toISOString();
      writeFileSync(reviewFile,JSON.stringify({
        kind:'AIRTRUST_SCORM_INDEPENDENT_PEDAGOGICAL_REVIEW_V1',
        packageSha256,approved:true,independentOfPackageAuthor:true,
        reviewerReference,approvalReference,approvedAt,
        items:[{itemId:'synthetic-1',status:'APPROVED',selectedIndex:0,
          rationale:'Synthetic technical review only, never authorization for real students',
          reviewerReference}],
      }));
      const driverFile=join(dir,'driver.json');
      writeFileSync(driverFile,JSON.stringify({schemaVersion:1,packageSha256,
        authorReviewed:true,reviewArtifactSha256:digest(readFileSync(reviewFile))}));
      const driverSha256=digest(readFileSync(driverFile));
      const {privateKey,publicKey}=generateKeyPairSync('ed25519');
      const reviewerKeyId='synthetic-reviewer-key-01';
      const trustedReviewerKeys={[reviewerKeyId]:{reviewerReference,
        role:'INDEPENDENT_PEDAGOGICAL_REVIEWER',
        publicKeyPem:publicKey.export({type:'spki',format:'pem'})}};
      const approvalFile=join(dir,'approval.json');
      const approval={kind:'AIRTRUST_SCORM_PEDAGOGICAL_APPROVAL_ED25519_V1',
        reviewerKeyId,packageSha256,reviewSha256:digest(readFileSync(reviewFile)),
        driverSha256,reviewerReference,approvedAt};
      const message=[approval.kind,approval.reviewerKeyId,approval.packageSha256,
        approval.reviewSha256,approval.driverSha256,approval.reviewerReference,
        approvalReference,approval.approvedAt].join('\n');
      writeFileSync(approvalFile,JSON.stringify({...approval,
        signature:Buffer.from(edSign(null,Buffer.from(message),privateKey)).toString('base64')}));
      const pdfFiles={CHROMIUM:join(dir,'chromium.pdf'),
        WEBKIT:join(dir,'webkit.pdf')};
      const evidenceFiles={CHROMIUM:join(dir,'chromium.json'),
        WEBKIT:join(dir,'webkit.json')};
      for(const browser of ['CHROMIUM','WEBKIT'] as const){
        const n=browser==='CHROMIUM'?1:2;
        const enrollmentId=1000+n,cycleId=2000+n;
        const qualificationHistoryId=3000+n,documentId='qa-synthetic-doc-'+n;
        const pdf=Buffer.from('%PDF-1.4\n'+
          ('Synthetic certificate '+browser+' NOT FOR PRODUCTION\n').repeat(12)+
          '%%EOF\n');
        writeFileSync(pdfFiles[browser],pdf);
        const certificateDocument={enrollmentId,cycleId,qualificationHistoryId,
          documentId,sha256:digest(pdf)};
        const backendWitness={
          source:'WORKER_D1_STAGING_READBACK',empresaId:17,cursoId:23,packageId:id,
          enrollmentId,cycleId,qualificationHistoryId,documentId,
          completionStatus:'CONCLUIDO',persistedCmiSha256:'1'.repeat(64),
          staleAttempt:{cycleId:cycleId-10,commitHttpStatus:409,
            progressBeforeSha256:'2'.repeat(64),progressAfterSha256:'2'.repeat(64),
            activeCycleBeforeSha256:'3'.repeat(64),activeCycleAfterSha256:'3'.repeat(64)},
          replay:{completionHttpStatus:200,qualificationHistoryCountBefore:1,
            qualificationHistoryCountAfter:1,qualificationHistoryId},
          authorization:{anonymousHttpStatus:401,foreignTenantHttpStatus:404,
            mismatchedShaHttpStatus:409,incompatibleEditionHttpStatus:409},
          validity:{status:'VALID',validFrom:approvedAt,validUntil:null},
        };
        writeFileSync(evidenceFiles[browser],JSON.stringify({
          source:'GOVERNED_STAGING_AUTHENTICATED_QA_V1',
          scope:'GOVERNED_STAGING_SYNTHETIC',browser,empresaId:17,cursoId:23,
          packageId:id,packageSha256,runtimeSha:runtime,harnessSha:harness,
          driverSha256,backendWitness,
          syntheticEnrollment:true,persistedBackendEvidence:true,
          verifiedCrossTenantDenial:true,verifiedIndependentCycle:true,
          qualificationHistoryVerified:true,certificateDocumentVerified:true,
          certificateDownloadHttpStatus:200,certificateDocument,
          cases:REQUIRED_SCORM_FUNCTIONAL_CASES.map(name=>({name,status:'PASS'})),
        }));
      }
      const make=()=>signGovernedScormEvidence({
        candidate,chromiumFile:evidenceFiles.CHROMIUM,
        webkitFile:evidenceFiles.WEBKIT,certificatePdfFiles:pdfFiles,
        secret,runtimeSha:runtime,harnessSha:harness,reviewFile,driverFile,
        approvalFile,trustedReviewerKeys,
      });
      const signed=make();
      const expected:TrustedScormContext={empresaId:17,cursoId:23,
        packageId:id,packageSha256,runtimeSha:runtime,requiresAssessment:true};
      expect(await verifyTrustedScormAttestation(signed,expected,secret)).toBe(true);
      expect(await verifyTrustedScormAttestation(signed,{...expected,empresaId:18},
        secret)).toBe(false);
      expect(await verifyTrustedScormAttestation(signed,{...expected,
        packageSha256:'0'.repeat(64)},secret)).toBe(false);
      expect(await verifyTrustedScormAttestation(signed,{...expected,
        packageId:crypto.randomUUID()},secret)).toBe(false);
      expect(await verifyTrustedScormAttestation(signed,{...expected,
        runtimeSha:'f'.repeat(40)},secret)).toBe(false);
      const missing=structuredClone(signed);
      missing.payload.runs[1].cases[0].status='INCONCLUSIVE';
      expect(await verifyTrustedScormAttestation(missing,expected,secret)).toBe(false);
      writeFileSync(zipPath,Buffer.concat([Buffer.from(zip),Buffer.from('tampered')]));
      expect(make).toThrow(/ZIP_SHA_DRIFT/);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
});
