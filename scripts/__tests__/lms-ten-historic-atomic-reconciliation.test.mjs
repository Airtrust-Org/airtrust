import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {plan,authorizedEnrollmentIds,administrativeObservations,isVerifiedCompletedCredit,classifyHistoricAssessment,assertApprovedScoreProvenScope,assessmentFingerprint} from
 '../production/lms-ten-historic-atomic-reconciliation.mjs';
const targets=[[2106,68],[384,34],[201,28],[608,43],[2139,68],
 [610,43],[544,7],[624,43],[700,55],[2052,68]];
test('scope is the exact ten manager-attested tenant6 enrollments',()=>{
 const old=process.env.LMS_HIST_ATOMIC_TARGET_ENROLLMENT_IDS;
 try{
  process.env.LMS_HIST_ATOMIC_TARGET_ENROLLMENT_IDS=targets.map(x=>x[0]).join(',');
  const ids=authorizedEnrollmentIds();
  assert.equal(ids.size,10);
  const p=plan(targets.map(([id,course])=>({id:course,
   enrollments:[{id,status:'EM_ANDAMENTO',progresso_bruto:100}]})),ids);
  assert.equal(p.rows.length,10);assert.equal(p.pendingReview.length,0);
  assert.match(p.hash,/^[0-9a-f]{64}$/);
  process.env.LMS_HIST_ATOMIC_TARGET_ENROLLMENT_IDS='2106,2106';
  assert.throws(()=>authorizedEnrollmentIds(),/AUTHORIZED_INPUT|AUTHORIZED_DUPLICATES/);
 }finally{
  if(old===undefined)delete process.env.LMS_HIST_ATOMIC_TARGET_ENROLLMENT_IDS;
  else process.env.LMS_HIST_ATOMIC_TARGET_ENROLLMENT_IDS=old;
 }
});
test('course mismatch and missing candidates never silently pass',()=>{
 const ids=new Set(targets.map(x=>x[0]));
 const rows=targets.map(([id,course])=>({id:course,enrollments:[{id,status:'EM_ANDAMENTO',progresso_bruto:100}]}));
 const mismatch=rows.map((r,i)=>i===0?{id:100,enrollments:r.enrollments}:r);
 assert.equal(plan(mismatch,ids).pendingReview.length,1);
 assert.equal(plan(rows.slice(0,9),ids).pendingReview.length,1);
 const scoreDrift=rows.map((r,i)=>i===0?{...r,enrollments:[{...r.enrollments[0],progresso_bruto:4}]}:r);
 assert.equal(plan(scoreDrift,ids).rows.length,9);
});
test('history is explicitly attributed to manager, not new SCORM edition',()=>{
 const note=administrativeObservations('existing notes');
 assert.match(note,/AIRTRUST_MANAGER_HISTORICAL_EDITION_CREDIT_20261016:/);
 assert.match(note,/existing notes/);
 assert.ok(note.startsWith('AIRTRUST_MANAGER_HISTORICAL_EDITION_CREDIT_20261016:'),'manager marker must be first');
});
test('workflow pins SHA and safeguards four qualification links for three approved writes',()=>{
 const wf=readFileSync(new URL('../../.github/workflows/production-lms-ten-historic-atomic-qualification.yml',import.meta.url),'utf8');
 for(const s of ['verify-release-gates.mjs','reviewed_dry_run_run_id','time-travel info',
  'environment: production','.results.qualification_linked==4'])assert.ok(wf.includes(s),s);
});


test('one already completed credit resumes only when qualification is linked',()=>{
 const ids=new Set(targets.map(x=>x[0]));
 const rows=targets.map(([id,course])=>({id:course,enrollments:[{
   id,status:id===700?'CONCLUIDO':'EM_ANDAMENTO',progresso_bruto:100
 }]}));
 const p=plan(rows,ids);
 assert.equal(p.rows.length,9);assert.equal(p.alreadyCompleted.length,1);
 assert.equal(p.pendingReview.length,0);assert.match(p.hash,/^[a-f0-9]{64}$/);
 const base={id:700,empresa_id:6,curso_id:55,status:'CONCLUIDO',progresso_bruto:100,
   data_conclusao:'2026-10-16',qualificacao_historico_id:12345};
 assert.equal(isVerifiedCompletedCredit(base),true);
 for(const change of [
   {qualificacao_historico_id:null},
   {status:'EM_ANDAMENTO'},
   {empresa_id:7},
   {curso_id:68},
   {data_conclusao:null},
   {progresso_bruto:99},
 ])assert.equal(isVerifiedCompletedCredit({...base,...change}),false);
});
test('workflow validates three score-proven credits and six protected enrollments',()=>{
 const wf=readFileSync(new URL('../../.github/workflows/production-lms-ten-historic-atomic-qualification.yml',import.meta.url),'utf8');
 const script=readFileSync(new URL('../production/lms-ten-historic-atomic-reconciliation.mjs',import.meta.url),'utf8');
 assert.match(wf,/\.candidates\+\.already_completed/);
 assert.match(wf,/\.writes==\.results.completed/);
 assert.match(wf,/\.results.selected_verified==3/);
 assert.match(wf,/\.results.blocked_preserved==6/);
 assert.match(wf,/\.results\.qualification_linked==4/);
 assert.match(script,/COMPLETED_WITHOUT_LINKED_QUALIFICATION/);
 assert.match(script,/PATCH_UNCERTAIN_NO_SAFE_RETRY/);
 assert.match(script,/HTTP_UNCERTAIN_VERIFIED_CANONICAL/);
 assert.doesNotMatch(script,/method:'PATCH'[\s\S]{0,200}retry/);
});

test('triage classifies real score 0 below mastery without certifying 100% progress',()=>{
 const row={scorm_mastery_score:70,scorm_assessment_policy:'SCORED',gerar_qualificacao_ao_concluir:1,
  edition_mismatch:{required:true},progresso_pct:100,scorm_progresso:{
    score_raw:0,score_min:0,score_max:100,lesson_status:'incomplete'}};
 const assessment=classifyHistoricAssessment(row);
 assert.equal(assessment.category,'SCORE_BELOW_MASTERY');
 assert.equal(assessment.score_pct,0);
 assert.equal(assessment.mastery_score,70);
 assert.equal(assessment.terminal_status_present,false);
 assert.equal(assessment.edition_mismatch_required,true);
 assert.ok(!('id' in assessment || 'funcionario_id' in assessment || 'cmi_json' in assessment));
});
test('triage treats missing, scaled, low score, and failed status fail-closed',()=>{
 const base={scorm_mastery_score:75,gerar_qualificacao_ao_concluir:1,scorm_assessment_policy:'SCORED'};
 assert.equal(classifyHistoricAssessment({...base,scorm_progresso:{score_raw:80}}).category,'SCORE_AT_OR_ABOVE_MASTERY');
 assert.equal(classifyHistoricAssessment({...base,scorm_progresso:{score_scaled:0.6,score_raw:99}}).category,'SCORE_BELOW_MASTERY');
 assert.equal(classifyHistoricAssessment({...base,scorm_progresso:{score_raw:null}}).category,'SCORE_MISSING');
 assert.equal(classifyHistoricAssessment({...base,scorm_progresso:{score_scaled:101}}).category,'SCORE_INVALID');
 assert.equal(classifyHistoricAssessment({...base,scorm_progresso:{score_raw:90,success_status:'failed'}}).category,'EXPLICIT_FAILURE');
 assert.equal(classifyHistoricAssessment({...base,scorm_progresso:null}).category,'SCORM_EVIDENCE_MISSING');
 assert.equal(classifyHistoricAssessment({...base,scorm_mastery_score:null,scorm_progresso:{score_raw:95}}).category,'MASTERY_INVALID_OR_MISSING');
 assert.equal(classifyHistoricAssessment({...base,scorm_assessment_policy:'FORMATIVE',scorm_progresso:{score_raw:null}}).category,'NOT_SCORED_POLICY_NEEDS_REVIEW');
});
test('workflow remains strictly bounded to exact ten IDs and read-only triage never mutates SCORM',()=>{
 const script=readFileSync(new URL('../production/lms-ten-historic-atomic-reconciliation.mjs',import.meta.url),'utf8');
 assert.match(script,/assessment_by_ordinal/);
 assert.match(script,/qualification_linked:Boolean/);
 assert.match(script,/const assessmentByOrdinal=\[\]/);
 assert.match(script,/candidate_hash:p.hash/);
});

test('score-proven three can be selected only from the complete protected ten-person cohort',()=>{
 const ids=new Set(targets.map(t=>t[0]));
 const rows=targets.map(([id,course],i)=>({id:course,enrollments:[{
   id,status:id===700?'CONCLUIDO':'EM_ANDAMENTO',progresso_bruto:100}]}));
 const cohort=plan(rows,ids);
 const evidence=new Map([[384,0],[201,null],[608,68],[610,13],[544,0],[624,13]]);
 const assessmentByOrdinal=targets.map(([id,course],i)=>({
   ordinal:i+1,curso_id:course,enrollment_status:id===700?'CONCLUIDO':'EM_ANDAMENTO',
   qualification_linked:id===700,
   category:id===201?'SCORE_MISSING':evidence.has(id)?'SCORE_BELOW_MASTERY':'SCORE_AT_OR_ABOVE_MASTERY',
   score_pct:evidence.has(id)?evidence.get(id):100,
   mastery_score:70,assessment_required:true,terminal_status_present:false,
   explicit_failure:false,edition_mismatch_required:id!==700
 }));
 const candidate={...cohort,assessmentByOrdinal};
 const selection=assertApprovedScoreProvenScope(candidate,ids);
 assert.deepEqual(selection.selected.map(x=>x.id),[2106,2139,2052]);
 assert.equal(selection.protectedRows.length,6);
 assert.equal(assessmentFingerprint(assessmentByOrdinal).length,64);
 assert.throws(()=>assertApprovedScoreProvenScope({
   ...candidate,assessmentByOrdinal:assessmentByOrdinal.map((a,i)=>i===6?{...a,score_pct:100,category:'SCORE_AT_OR_ABOVE_MASTERY'}:a),
 },ids),/BLOCKED_EVIDENCE_DRIFT/);
 assert.throws(()=>assertApprovedScoreProvenScope({
   ...candidate,assessmentByOrdinal:assessmentByOrdinal.map((a,i)=>i===0?{...a,score_pct:0,category:'SCORE_BELOW_MASTERY'}:a),
 },ids),/SCORE_PROVEN_TARGET_DRIFT/);
});
test('production apply is hard-limited to three immutable IDs and reviewed score evidence',()=>{
 const script=readFileSync(new URL('../production/lms-ten-historic-atomic-reconciliation.mjs',import.meta.url),'utf8');
 const wf=readFileSync(new URL('../../.github/workflows/production-lms-ten-historic-atomic-qualification.yml',import.meta.url),'utf8');
 for(const x of ['score-proven-three','REVIEWED_ASSESSMENT_HASH','BLOCKED_EVIDENCE_DRIFT',
   'TARGET_ASSESSMENT_DRIFT','PROTECTED_POSTCHECK_CHANGED','SELECTED_POSTCHECK_UNQUALIFIED'])
   assert.ok((script+wf).includes(x),x);
 assert.match(wf,/\.score_proven_pending_count==3/);
 assert.match(wf,/\.blocked_pending_count==6/);
 assert.match(wf,/\.assessment_hash\|test/);
 assert.match(wf,/\.results\.qualification_linked==4/);
 assert.match(script,/for\(const row of selected\)/);
 assert.doesNotMatch(script,/for\(const row of cohort.rows\)\{\s*await pin/);
});
