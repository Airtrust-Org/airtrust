import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { verifyF5FormativeCompletionObservations as verify } from '../staging/f5-formative-completion-witness.mjs';
const dig=x=>createHash('sha256').update(x).digest('hex');
const H='a'.repeat(64),R='b'.repeat(40),C='c'.repeat(64);
const blob=i=>Buffer.from('%PDF-1.4\n'+i+'\n'+'x'.repeat(620)+'\n%%EOF\n');
const candidate={scope:'GOVERNED_STAGING_SYNTHETIC',environment:'staging',
  status:'VALIDATED',active:false,assessmentPolicy:'FORMATIVE',
  empresaId:999001,cursoId:26,
  packageId:'11111111-1111-4111-8111-111111111111',packageSha256:H};
const uuid=i=>i===1?'22222222-2222-4222-8222-222222222222':'33333333-3333-4333-8333-333333333333';
function fixture(){
 const runs=['CHROMIUM','WEBKIT'].map((browser,index)=>{
  const i=index+1,runId=uuid(i),enrollmentId=100+i,cycleId=200+i;
  const base={source:'WORKER_D1_STAGING_READBACK',empresaId:candidate.empresaId,
   cursoId:candidate.cursoId,packageId:candidate.packageId,
   packageSha256:H,servedPackageSha256:H,committedPackageSha256:H,
   runtimeSha:R,runId,enrollmentId,cycleId,synthetic:true,
   scormScoreRaw:null,assessmentAttempted:false,assessmentApproved:false};
  const pdfBytes=blob(i),certificateDocument={enrollmentId,cycleId,
   qualificationHistoryId:300+i,documentId:'doc-'+i,sha256:dig(pdfBytes)};
  const before={...base,sessionCount:0,completionStatus:'NAO_INICIADO',
    cmiSha256:null,qualificationHistoryCount:0,
    qualificationHistoryId:null,certificateDocument:null};
  const completed={...base,sessionCount:2,completionStatus:'CONCLUIDO',
    cmiSha256:C,qualificationHistoryCount:1,qualificationHistoryId:300+i,
    certificateDocument};
  return {browser,runtimeSha:R,runId,enrollmentId,cycleId,
    producer:'PROTECTED_STAGING_QA',synthetic:true,
    candidateRemainedInactive:true,cleanupReceiptVerified:true,
    before,completed,replay:{...completed},replayHttpStatus:200,
    stale:{archivedCycleId:900+i,status:409,cmiBefore:C,cmiAfter:C,
      cycleBefore:H,cycleAfter:H,qualBefore:C,qualAfter:C},
    negativeAuth:{anonymous:401,foreignTenant:403,wrongSha:409,wrongEdition:409},
    pdfBytes};
 });
 return {candidate:{...candidate},runtimeSha:R,runs};
}
test('complete synthetic contract is only an observation, never a certificate',()=>{
 const a=verify(fixture());
 assert.equal(a.status,'OBSERVATION_CONTRACT_PASS');
 assert.equal(a.certificationAuthorized,false);
 assert.equal(a.activationAuthorized,false);
});
test('F0 suspend-only readback cannot pass as finalization',()=>{
 const f=fixture();f.runs[0].completed={...f.runs[0].before};
 assert.throws(()=>verify(f),/COMPLETION_NOT_PERSISTED/);
});
test('reject production, active or scored policy',()=>{
 for(const change of [{environment:'production'},{active:true},
  {status:'ACTIVE'},{assessmentPolicy:'SCORED'}]){
  const f=fixture();Object.assign(f.candidate,change);
  assert.throws(()=>verify(f),/CANDIDATE_SCOPE_INVALID/);
 }
});
test('require staging producer, cleanup and exact source SHA',()=>{
 for(const change of [{producer:'ZIP_SELF_REPORT'},{cleanupReceiptVerified:false},
  {runtimeSha:'0'.repeat(40)},{candidateRemainedInactive:false}]){
  const f=fixture();Object.assign(f.runs[0],change);
  assert.throws(()=>verify(f),/PROVISIONING_NOT_PROVEN/);
 }
});
test('reject duplicate finalization or mutated replay',()=>{
 for(const change of [{qualificationHistoryCount:2},{qualificationHistoryId:991},
   {cmiSha256:H},{certificateDocument:{documentId:'replacement'}}]){
  const f=fixture();Object.assign(f.runs[1].replay,change);
  assert.throws(()=>verify(f),/REPLAY_NOT_IDEMPOTENT/);
 }
});
test('reject stale cycle writes even if HTTP status is 409',()=>{
 for(const change of [{status:200},{cmiAfter:H},{cycleAfter:C},
  {qualAfter:H},{archivedCycleId:201}]){
  const f=fixture();Object.assign(f.runs[0].stale,change);
  assert.throws(()=>verify(f),/STALE_CYCLE_NOT_ATOMIC/);
 }
});
test('negative cross-tenant, anonymous, SHA and edition checks mandatory',()=>{
 for(const change of [{anonymous:200},{foreignTenant:200},
  {wrongSha:200},{wrongEdition:200}]){
  const f=fixture();Object.assign(f.runs[0].negativeAuth,change);
  assert.throws(()=>verify(f),/AUTH_NEGATIVES_MISSING/);
 }
});
test('PDF real bytes must match backend-linked qualification document',()=>{
 for(const change of [{pdfBytes:Buffer.from('%PDF-fake')},{pdfBytes:blob('other')}]){
  const f=fixture();Object.assign(f.runs[0],change);
  assert.throws(()=>verify(f),/AUTHENTICATED_PDF_BYTES_UNPROVEN/);
 }
});
test('Chromium and WebKit cannot reuse enrollments, cycles, history, documents or PDFs',()=>{
 const changes=[
 f=>{for(const field of ['before','completed','replay'])f.runs[1][field].enrollmentId=101;f.runs[1].enrollmentId=101;f.runs[1].completed.certificateDocument.enrollmentId=101;},
 f=>{for(const field of ['before','completed','replay'])f.runs[1][field].cycleId=201;f.runs[1].cycleId=201;f.runs[1].completed.certificateDocument.cycleId=201;},
 f=>{for(const field of ['completed','replay'])f.runs[1][field].qualificationHistoryId=301;f.runs[1].completed.certificateDocument.qualificationHistoryId=301;},
 f=>{f.runs[1].completed.certificateDocument.documentId='doc-1';},
 f=>{f.runs[1].pdfBytes=f.runs[0].pdfBytes;f.runs[1].completed.certificateDocument.sha256=f.runs[0].completed.certificateDocument.sha256;},
 ];
 for(const change of changes){
  const f=fixture();change(f);
  assert.throws(()=>verify(f),/BROWSERS_NOT_INDEPENDENT/);
 }
});
