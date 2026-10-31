/**
 * Pure fail-closed contract for a future F5 completion-capable staging producer.
 *
 * F0's existing inactive-candidate executor MUST remain suspend-only. Its
 * readback explicitly prohibits completion/certificates. This module NEVER
 * signs, issues, activates, persists or asserts that a real run occurred.
 * Pass only protected Worker/D1 readbacks and downloaded backend PDF bytes;
 * checking their shapes is not proof of authenticated origin or grant.
 */
import { createHash } from 'node:crypto';
const HEX64=/^[0-9a-f]{64}$/, HEX40=/^[0-9a-f]{40}$/, UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,reason)=>{if(!ok)throw Error('F5_FORMATIVE_FINAL_WITNESS_'+reason);};
function assertReadback(row,c,run,label){
  check(row?.source==='WORKER_D1_STAGING_READBACK' &&
    row.empresaId===c.empresaId && row.cursoId===c.cursoId &&
    row.packageId===c.packageId && row.packageSha256===c.packageSha256 &&
    row.servedPackageSha256===c.packageSha256 &&
    row.committedPackageSha256===c.packageSha256 &&
    row.runtimeSha===run.runtimeSha && row.runId===run.runId &&
    row.enrollmentId===run.enrollmentId && row.cycleId===run.cycleId &&
    row.synthetic===true,label+'_EDITION_SCOPE_INVALID');
  check(Number.isSafeInteger(row.sessionCount)&&row.sessionCount>=0 &&
    Number.isSafeInteger(row.qualificationHistoryCount)&&
    row.qualificationHistoryCount>=0,label+'_COUNTERS_INVALID');
  check(row.scormScoreRaw===null && row.assessmentAttempted===false &&
    row.assessmentApproved===false,label+'_SCORED_ASSESSMENT_PRESENT');
}
function sameCompletion(a,b){
  return a.completionStatus===b.completionStatus &&
    a.cmiSha256===b.cmiSha256 &&
    a.qualificationHistoryCount===b.qualificationHistoryCount &&
    a.qualificationHistoryId===b.qualificationHistoryId &&
    a.certificateDocument?.documentId===b.certificateDocument?.documentId &&
    a.certificateDocument?.sha256===b.certificateDocument?.sha256;
}
export function verifyF5FormativeCompletionObservations({candidate,runtimeSha,runs}){
  check(candidate?.scope==='GOVERNED_STAGING_SYNTHETIC' &&
    candidate.environment==='staging' && candidate.status==='VALIDATED' &&
    candidate.active===false && candidate.assessmentPolicy==='FORMATIVE' &&
    positive(candidate.empresaId) && positive(candidate.cursoId) &&
    UUID.test(candidate.packageId||'') && HEX64.test(candidate.packageSha256||'') &&
    HEX40.test(runtimeSha||''),'CANDIDATE_SCOPE_INVALID');
  check(Array.isArray(runs) && runs.length===2 &&
    runs[0]?.browser==='CHROMIUM' && runs[1]?.browser==='WEBKIT',
    'BROWSER_PAIR_INVALID');
  const unique={enroll:[],cycle:[],history:[],document:[],pdf:[]};
  for(const run of runs){
    const browser=run.browser;
    check(run.runtimeSha===runtimeSha && UUID.test(run.runId||'') &&
      positive(run.enrollmentId) && positive(run.cycleId) &&
      run.synthetic===true && run.candidateRemainedInactive===true &&
      run.cleanupReceiptVerified===true && run.producer==='PROTECTED_STAGING_QA',
      browser+'_PROVISIONING_NOT_PROVEN');
    assertReadback(run.before,candidate,run,browser+'_BEFORE');
    check(['NAO_INICIADO','EM_ANDAMENTO'].includes(run.before.completionStatus) &&
      run.before.qualificationHistoryCount===0 &&
      run.before.qualificationHistoryId===null &&
      run.before.certificateDocument===null,browser+'_PRISTINE_PREIMAGE_MISSING');
    assertReadback(run.completed,candidate,run,browser+'_COMPLETED');
    const c=run.completed;
    check(c.completionStatus==='CONCLUIDO' &&
      c.sessionCount>run.before.sessionCount &&
      HEX64.test(c.cmiSha256||'') &&
      c.qualificationHistoryCount===1 && positive(c.qualificationHistoryId),
      browser+'_COMPLETION_NOT_PERSISTED');
    assertReadback(run.replay,candidate,run,browser+'_REPLAY');
    check([200,204,409].includes(run.replayHttpStatus) &&
      sameCompletion(c,run.replay),browser+'_REPLAY_NOT_IDEMPOTENT');
    const stale=run.stale;
    check(positive(stale?.archivedCycleId) &&
      stale.archivedCycleId!==run.cycleId &&
      [403,409].includes(stale.status) &&
      HEX64.test(stale.cmiBefore||'') &&
      stale.cmiBefore===stale.cmiAfter &&
      HEX64.test(stale.cycleBefore||'') &&
      stale.cycleBefore===stale.cycleAfter &&
      HEX64.test(stale.qualBefore||'') &&
      stale.qualBefore===stale.qualAfter,browser+'_STALE_CYCLE_NOT_ATOMIC');
    const auth=run.negativeAuth;
    check(auth?.anonymous===401 && [403,404].includes(auth.foreignTenant) &&
      [400,409].includes(auth.wrongSha) && [403,409].includes(auth.wrongEdition),
      browser+'_AUTH_NEGATIVES_MISSING');
    const doc=c.certificateDocument;
    check(doc && doc.enrollmentId===run.enrollmentId &&
      doc.cycleId===run.cycleId &&
      doc.qualificationHistoryId===c.qualificationHistoryId &&
      typeof doc.documentId==='string' && doc.documentId.length>0 &&
      HEX64.test(doc.sha256||''),'DOCUMENT_NOT_BOUND_TO_QUALIFICATION');
    check(Buffer.isBuffer(run.pdfBytes) && run.pdfBytes.length>512 &&
      run.pdfBytes.subarray(0,5).toString()==='%PDF-' &&
      run.pdfBytes.subarray(-256).includes(Buffer.from('%%EOF')) &&
      sha(run.pdfBytes)===doc.sha256,'AUTHENTICATED_PDF_BYTES_UNPROVEN');
    unique.enroll.push(run.enrollmentId);
    unique.cycle.push(run.cycleId);
    unique.history.push(c.qualificationHistoryId);
    unique.document.push(doc.documentId);
    unique.pdf.push(doc.sha256);
  }
  for(const [name,ids] of Object.entries(unique))
    check(new Set(ids).size===2,'BROWSERS_NOT_INDEPENDENT_'+name.toUpperCase());
  // Never output GOV_STAGING_AUTHENTICATED_QA_V1, CERTIFIED or publishable:
  // provenance, authorized grants, Ed25519 review and trusted-main signer
  // are separate boundaries which this pure contract cannot establish.
  return {status:'OBSERVATION_CONTRACT_PASS',certificationAuthorized:false,
    activationAuthorized:false,packageSha256:candidate.packageSha256,
    runtimeSha,browsers:['CHROMIUM','WEBKIT']};
}
