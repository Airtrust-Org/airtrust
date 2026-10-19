import {createHmac} from 'node:crypto';
import {describe,expect,it} from 'vitest';

import {
  activateScormPackageVersion, importScormFunctionalAttestation,
} from '../../lib/lms/lms-scorm-package-version-service';
import {REQUIRED_SCORM_FUNCTIONAL_CASES,SCORM_FUNCTIONAL_HARNESS}
  from '../../lib/lms/lms-scorm-functional-certification';
import {
  serializeScormAttestation,TRUSTED_SCORM_ATTESTATION_KIND,
  type TrustedScormAttestationPayload,
} from '../../lib/lms/lms-scorm-trusted-attestation';

const id='123e4567-e89b-42d3-a456-426614174000';
const secret='test-only-secret-with-length-above-thirty-two-characters';
const sha='a'.repeat(64),runtimeSha='b'.repeat(40);
const runtime={
  status:'PASS', candidateSha256:sha, startedAt:'2026-10-17T17:00:00.000Z',
  finishedAt:'2026-10-17T17:01:00.000Z',
  initializeObserved:true,commitObserved:true,finishObserved:true,
  completionReached:true,lessonStatus:'passed',scoreRaw:'95',
  masteryScore:'70',lessonLocation:'4/4',trace:[],errors:[],
  runnerVersion:'qa-runtime',functionalCompletionVerified:true,
  requiresAssessmentEvidence:true,expectedSuccessStatus:'passed',
};
function quality(){
  return {
    validatorVersion:'AIRTRUST_SCORM_PACKAGE_QUALITY_GATE_V1',
    structural:{status:'PASS',errors:[],warnings:[]},
    completionManifest:{status:'PASS',errors:[],warnings:[]},
    diagnostics:{status:'PASS',errors:[],warnings:[]},
    conformance:{status:'PASS',tests:[]},runtime,
    functionalCertification:{status:'UNCERTIFIED',packageSha256:sha,
      missing:['CHROMIUM:RUN_REQUIRED_UNIQUE'],requiresAssessment:true,runs:[]},
    publishable:false,
  };
}
function seal(){
  const run=(browser:'CHROMIUM'|'WEBKIT')=>({
    harness:SCORM_FUNCTIONAL_HARNESS,browser,packageSha256:sha,
    cases:REQUIRED_SCORM_FUNCTIONAL_CASES.map(name=>({name,status:'PASS' as const})),
  });
  const p:TrustedScormAttestationPayload={
    kind:TRUSTED_SCORM_ATTESTATION_KIND,
    empresaId:6,cursoId:22,packageId:id,packageSha256:sha,
    runtimeSha,harnessSha:'c'.repeat(40),
    issuedAt:new Date().toISOString(),
    scope:'GOVERNED_STAGING_SYNTHETIC',requiresAssessment:true,
    pedagogicalReview:{artifactSha256:'5'.repeat(64),driverSha256:'6'.repeat(64),
      reviewerReference:'reviewer-test-01',approvalReference:'approval-test-only-01',
      approvedAt:new Date().toISOString(),itemCount:2,
      reviewerKeyId:'reviewer-test-key-01',reviewerPublicKeySha256:'7'.repeat(64),
      approvalSignatureSha256:'8'.repeat(64)},
    browserEvidenceSha256:{CHROMIUM:'1'.repeat(64),WEBKIT:'2'.repeat(64)},
    certificateDocuments:{
      CHROMIUM:{enrollmentId:1001,cycleId:2001,qualificationHistoryId:3001,documentId:'qa-doc-1',sha256:'3'.repeat(64)},
      WEBKIT:{enrollmentId:1002,cycleId:2002,qualificationHistoryId:3002,documentId:'qa-doc-2',sha256:'4'.repeat(64)},
    },
    runs:[run('CHROMIUM'),run('WEBKIT')],
  };
  return {payload:p,signature:createHmac('sha256',secret)
    .update(serializeScormAttestation(p)).digest('hex')};
}
function fixture(){
  const row={id,empresa_id:6,curso_id:22,package_sha256:sha,
    r2_prefix:'lms/scorm/6/22/_candidates/'+id+'/',launch_file:'index.html',
    status:'VALIDATED',validation_result_json:JSON.stringify(quality())};
  const writes:{sql:string,args:unknown[]}[]=[];
  let batchCalls=0;
  const db={
    prepare(sql:string){
      return {bind(...args:unknown[]){
        return {
          first:async()=>row,
          run:async()=>{writes.push({sql,args});return {success:true};},
        };
      }};
    },
    batch:async(statements:unknown[])=>{
      batchCalls++;
      // Only preserve the certificate JSON for successful certification imports.
      const statement=statements[0] as {
        bind?:never; // implementation of D1 mock records through SQL strings below
      };
      void statement;
      return [];
    },
  };
  // Capture bound statements accurately to simulate D1's update.
  const realPrepare=db.prepare;
  db.prepare=(sql:string)=>{
    const base=realPrepare(sql);
    return {bind(...args:unknown[]){
      const bound=base.bind(...args);
      return {
        first:bound.first,
        run:async()=>{writes.push({sql,args});return {success:true};},
        __sql:sql,__args:args,
      };
    }};
  };
  db.batch=async(statements:unknown[])=>{
    batchCalls++;
    for(const statement of statements as Array<{__sql?:string;__args?:unknown[]}>){
      const sql=statement.__sql??'',args=statement.__args??[];
      writes.push({sql,args});
      if(sql.includes('SET validation_result_json'))row.validation_result_json=String(args[0]);
      if(sql.includes("SET status = 'ACTIVE'"))row.status='ACTIVE';
    }
    return [];
  };
  return {db:db as unknown as D1Database,row,writes,
    get batchCalls(){return batchCalls;}};
}
const base={empresaId:6,cursoId:22,packageId:id,userId:1,
  attestationSecret:secret,runtimeSha};
describe('SCORM imported certification and activation trust boundary',()=>{
  it('rejects unsigned evidence without any D1 write',async()=>{
    const f=fixture();
    await expect(importScormFunctionalAttestation({
      ...base,db:f.db,attestation:{payload:seal().payload},
    })).rejects.toMatchObject({statusCode:409});
    expect(f.batchCalls).toBe(0);
    await expect(activateScormPackageVersion({...base,db:f.db}))
      .rejects.toMatchObject({statusCode:409});
    expect(f.batchCalls).toBe(0);
  });
  it('imports signed proof, then rechecks provenance before activation',async()=>{
    const f=fixture();
    const result=await importScormFunctionalAttestation({
      ...base,db:f.db,attestation:seal(),
    });
    expect(result.status).toBe('CERTIFIED');
    expect(result.publishable).toBe(true);
    const stored=JSON.parse(f.row.validation_result_json);
    expect(stored.trustedAttestation.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(f.batchCalls).toBe(1);
    await expect(activateScormPackageVersion({...base,db:f.db})).resolves
      .toMatchObject({status:'ACTIVE'});
    expect(f.batchCalls).toBe(2);
  });
  it('rejects runtime drift and signature tampering, preserving active pointer',async()=>{
    const f=fixture();
    await importScormFunctionalAttestation({...base,db:f.db,attestation:seal()});
    await expect(activateScormPackageVersion({
      ...base,db:f.db,runtimeSha:'d'.repeat(40),
    })).rejects.toMatchObject({statusCode:409});
    const stored=JSON.parse(f.row.validation_result_json);
    stored.trustedAttestation.payload.runs[0].cases[0].status='FAIL';
    f.row.validation_result_json=JSON.stringify(stored);
    await expect(activateScormPackageVersion({...base,db:f.db}))
      .rejects.toMatchObject({statusCode:409});
    expect(f.batchCalls).toBe(1);
  });
});
